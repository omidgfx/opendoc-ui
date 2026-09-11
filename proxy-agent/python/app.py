from __future__ import annotations

import http.client
import ipaddress
import base64
import json
import os
import socket
import ssl
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Mapping
from urllib.parse import parse_qs, urljoin, urlsplit


def csv(value: str | None) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]


def positive_int(value: str | None, fallback: int) -> int:
    try:
        parsed = int(value or "")
        return parsed if parsed > 0 else fallback
    except ValueError:
        return fallback


@dataclass(frozen=True)
class Config:
    bind: str
    port: int
    allowed_origins: tuple[str, ...]
    max_bytes: int
    timeout_seconds: int
    max_redirects: int
    allowed_ports: frozenset[int]
    allowed_hosts: tuple[str, ...]
    rate_limit: int
    proxy_enabled: bool = True

    @staticmethod
    def from_env(env: Mapping[str, str] = os.environ) -> "Config":
        return Config(
            bind=env.get("OPENDOC_BIND", "0.0.0.0"),
            port=positive_int(env.get("PORT"), 8080),
            allowed_origins=tuple(csv(env.get("OPENDOC_ALLOWED_ORIGINS"))),
            max_bytes=positive_int(env.get("OPENDOC_MAX_BYTES"), 10 * 1024 * 1024),
            timeout_seconds=positive_int(env.get("OPENDOC_TIMEOUT_SECONDS"), 15),
            max_redirects=positive_int(env.get("OPENDOC_MAX_REDIRECTS"), 3),
            allowed_ports=frozenset(int(port) for port in csv(env.get("OPENDOC_ALLOWED_PORTS", "80,443"))),
            allowed_hosts=tuple(host.lower() for host in csv(env.get("OPENDOC_ALLOWED_REMOTE_HOSTS"))),
            rate_limit=positive_int(env.get("OPENDOC_RATE_LIMIT_PER_MINUTE"), 60),
            proxy_enabled=env.get("OPENDOC_PROXY_ENABLED", "true").strip().lower() != "false",
        )


class ProxyAgentError(Exception):
    def __init__(self, code: str, message: str, status: int = 502):
        super().__init__(message)
        self.code = code
        self.status = status


def host_allowed(hostname: str, patterns: tuple[str, ...]) -> bool:
    if not patterns:
        return True
    return any(
        hostname.endswith(pattern[1:]) and len(hostname) > len(pattern) - 1
        if pattern.startswith("*.")
        else hostname == pattern
        for pattern in patterns
    )


def resolve_public_target(target: str, config: Config) -> tuple[object, str, int, list[tuple[int, str]]]:
    parsed = urlsplit(target)
    if parsed.scheme not in ("http", "https"):
        raise ProxyAgentError("TARGET_PROTOCOL_BLOCKED", "Only HTTP and HTTPS targets are allowed.", 400)
    if parsed.username or parsed.password:
        raise ProxyAgentError("TARGET_CREDENTIALS_BLOCKED", "Target credentials in URLs are not allowed.", 400)
    hostname = (parsed.hostname or "").lower()
    if not hostname or hostname == "localhost" or hostname.endswith((".localhost", ".local")):
        raise ProxyAgentError("TARGET_HOST_BLOCKED", "Local hostnames are blocked.", 403)
    if not host_allowed(hostname, config.allowed_hosts):
        raise ProxyAgentError("TARGET_HOST_NOT_ALLOWED", "The target host is not in OPENDOC_ALLOWED_REMOTE_HOSTS.", 403)
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if port not in config.allowed_ports:
        raise ProxyAgentError("TARGET_PORT_BLOCKED", f"Remote port {port} is not allowed.", 403)
    try:
        resolved = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as error:
        raise ProxyAgentError("TARGET_DNS_FAILED", "The target hostname could not be resolved.", 502) from error
    addresses: list[tuple[int, str]] = []
    for family, _, _, _, sockaddr in resolved:
        address = sockaddr[0]
        if (family not in (socket.AF_INET, socket.AF_INET6)):
            continue
        try:
            if not ipaddress.ip_address(address.split("%")[0]).is_global:
                raise ProxyAgentError(
                    "TARGET_ADDRESS_BLOCKED",
                    "The target resolves to a private, reserved, or otherwise prohibited address.",
                    403,
                )
        except ValueError as error:
            raise ProxyAgentError("TARGET_ADDRESS_BLOCKED", "The target resolved to an invalid address.", 403) from error
        item = (family, address)
        if item not in addresses:
            addresses.append(item)
    if not addresses:
        raise ProxyAgentError("TARGET_DNS_FAILED", "The target has no usable public address.", 502)
    return parsed, hostname, port, addresses


class PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, host: str, port: int, address: str, timeout: int):
        super().__init__(host, port, timeout=timeout)
        self.address = address

    def connect(self) -> None:
        self.sock = socket.create_connection((self.address, self.port), self.timeout)


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host: str, port: int, address: str, timeout: int):
        super().__init__(host, port, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self) -> None:
        raw = socket.create_connection((self.address, self.port), self.timeout)
        self.sock = self._context.wrap_socket(raw, server_hostname=self.host)


def request_once(target: str, request_headers: Mapping[str, str], config: Config):
    parsed, hostname, port, addresses = resolve_public_target(target, config)
    address = addresses[0][1]
    connection = (
        PinnedHTTPSConnection(hostname, port, address, config.timeout_seconds)
        if parsed.scheme == "https"
        else PinnedHTTPConnection(hostname, port, address, config.timeout_seconds)
    )
    path = parsed.path or "/"
    if parsed.query:
        path += f"?{parsed.query}"
    headers = {
        "Accept": "application/json, application/yaml, text/yaml, text/plain, */*;q=0.5",
        "Accept-Encoding": "identity",
        "User-Agent": "OpenDoc-Proxy-Agent/0.1",
        "Host": hostname if port in (80, 443) else f"{hostname}:{port}",
    }
    if request_headers.get("if-none-match"):
        headers["If-None-Match"] = request_headers["if-none-match"]
    if request_headers.get("if-modified-since"):
        headers["If-Modified-Since"] = request_headers["if-modified-since"]
    try:
        connection.request("GET", path, headers=headers)
        return connection, connection.getresponse()
    except (OSError, http.client.HTTPException) as error:
        connection.close()
        raise ProxyAgentError("REMOTE_CONNECTION_FAILED", "The remote server could not be reached.", 502) from error


def download_spec(target: str, request_headers: Mapping[str, str], config: Config):
    current = target
    for redirect_count in range(config.max_redirects + 1):
        connection, response = request_once(current, request_headers, config)
        status = response.status
        headers = {name.lower(): value for name, value in response.getheaders()}
        if status in (301, 302, 303, 307, 308) and headers.get("location"):
            response.read()
            connection.close()
            if redirect_count == config.max_redirects:
                raise ProxyAgentError("REMOTE_REDIRECT_LIMIT", "Remote redirect limit exceeded.", 502)
            current = urljoin(current, headers["location"])
            continue
        if status == 304:
            response.read()
            connection.close()
            return status, headers, b"", current
        if status < 200 or status >= 300:
            response.read()
            connection.close()
            raise ProxyAgentError("REMOTE_HTTP_STATUS", f"Remote server returned HTTP {status}.", 502)
        declared = positive_int(headers.get("content-length"), 0)
        if declared > config.max_bytes:
            connection.close()
            raise ProxyAgentError("REMOTE_FILE_TOO_LARGE", "Remote specification exceeds OPENDOC_MAX_BYTES.", 413)
        body = response.read(config.max_bytes + 1)
        connection.close()
        if len(body) > config.max_bytes:
            raise ProxyAgentError("REMOTE_FILE_TOO_LARGE", "Remote specification exceeds OPENDOC_MAX_BYTES.", 413)
        return status, headers, body, current
    raise ProxyAgentError("REMOTE_REDIRECT_LIMIT", "Remote redirect limit exceeded.", 502)


HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
    "accept-encoding",
}


def request_once_with_body(target: str, method: str, headers: Mapping[str, str], body: bytes, config: Config):
    parsed, hostname, port, addresses = resolve_public_target(target, config)
    address = addresses[0][1]
    connection = (
        PinnedHTTPSConnection(hostname, port, address, config.timeout_seconds)
        if parsed.scheme == "https"
        else PinnedHTTPConnection(hostname, port, address, config.timeout_seconds)
    )
    path = parsed.path or "/"
    if parsed.query:
        path += f"?{parsed.query}"
    forward = {
        "Accept-Encoding": "identity",
        "User-Agent": "OpenDoc-Proxy-Agent/0.1",
        "Host": hostname if port in (80, 443) else f"{hostname}:{port}",
    }
    forward.update(headers)
    try:
        connection.request(method, path, body=body if body else None, headers=forward)
        return connection, connection.getresponse()
    except (OSError, http.client.HTTPException) as error:
        connection.close()
        raise ProxyAgentError("REMOTE_CONNECTION_FAILED", "The remote server could not be reached.", 502) from error


def execute_proxied_request(raw_body: bytes, request_headers: Mapping[str, str], config: Config):
    started = time.time()
    if not config.proxy_enabled:
        raise ProxyAgentError("PROXY_DISABLED", "The request proxy is disabled on this service.", 403)
    target_url = (request_headers.get("x-opendoc-target-url") or "").strip()
    if not target_url:
        raise ProxyAgentError("MISSING_TARGET_URL", "Missing X-OpenDoc-Target-Url header.", 400)
    parsed_target = urlsplit(target_url)
    if parsed_target.scheme not in ("http", "https"):
        raise ProxyAgentError("TARGET_PROTOCOL_BLOCKED", "Only HTTP and HTTPS targets are allowed.", 400)
    if parsed_target.username or parsed_target.password:
        raise ProxyAgentError("TARGET_CREDENTIALS_BLOCKED", "Target credentials in URLs are not allowed.", 400)
    method = (request_headers.get("x-opendoc-target-method") or "GET").strip().upper() or "GET"
    if not method.isalpha():
        raise ProxyAgentError("INVALID_TARGET_METHOD", "Target method is not valid.", 400)
    target_headers: dict[str, str] = {}
    raw_headers = (request_headers.get("x-opendoc-target-headers") or "").strip()
    if raw_headers:
        try:
            parsed_headers = json.loads(raw_headers)
        except ValueError as error:
            raise ProxyAgentError("INVALID_TARGET_HEADERS", "X-OpenDoc-Target-Headers must be a JSON object.", 400) from error
        if not isinstance(parsed_headers, dict):
            raise ProxyAgentError("INVALID_TARGET_HEADERS", "X-OpenDoc-Target-Headers must be a JSON object.", 400)
        target_headers = {key: value for key, value in parsed_headers.items() if isinstance(value, str)}
    target_headers = {
        key: value for key, value in target_headers.items() if key.lower() not in HOP_BY_HOP_HEADERS
    }
    body = raw_body or b""
    current = target_url
    for redirect_count in range(config.max_redirects + 1):
        connection, response = request_once_with_body(current, method, target_headers, body, config)
        status = response.status
        headers = {name.lower(): value for name, value in response.getheaders()}
        location = headers.get("location") or ""
        if status in (301, 302, 303, 307, 308) and location and redirect_count < config.max_redirects:
            response.read()
            connection.close()
            if status == 303 or (status in (301, 302) and method not in ("GET", "HEAD")):
                method = "GET"
                body = b""
            current = urljoin(current, location)
            continue
        chunks = []
        total = 0
        while True:
            chunk = response.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if total > config.max_bytes:
                connection.close()
                raise ProxyAgentError("REMOTE_RESPONSE_TOO_LARGE", "Remote response exceeds OPENDOC_MAX_BYTES.", 502)
            chunks.append(chunk)
        connection.close()
        return {
            "status": status,
            "statusText": response.reason or "",
            "headers": headers,
            "finalUrl": current,
            "body": base64.b64encode(b"".join(chunks)).decode(),
            "bodyEncoding": "base64",
            "durationMs": int((time.time() - started) * 1000),
        }
    raise ProxyAgentError("REMOTE_REDIRECT_LIMIT", "Remote redirect limit exceeded.", 502)


_rate_lock = threading.Lock()
_rate_buckets: dict[str, tuple[int, int]] = {}


def within_rate_limit(client: str, limit: int) -> bool:
    minute = int(time.time() // 60)
    with _rate_lock:
        bucket_minute, count = _rate_buckets.get(client, (minute, 0))
        if bucket_minute != minute:
            count = 0
        count += 1
        _rate_buckets[client] = (minute, count)
        return count <= limit


def create_handler(config: Config):
    class ProxyAgentHandler(BaseHTTPRequestHandler):
        server_version = "OpenDocProxyAgent/0.1"

        def cors_allowed(self) -> bool:
            origin = self.headers.get("Origin", "")
            if not origin:
                return True
            if origin not in config.allowed_origins:
                return False
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header(
                "Access-Control-Allow-Headers",
                "Content-Type, If-None-Match, If-Modified-Since, X-OpenDoc-Target-Url, X-OpenDoc-Target-Method, X-OpenDoc-Target-Headers",
            )
            self.send_header(
                "Access-Control-Expose-Headers",
                "ETag, Last-Modified, Content-Length, Content-Type, X-OpenDoc-Final-URL",
            )
            return True

        def error_json(self, error: ProxyAgentError) -> None:
            payload = json.dumps({"error": {"code": error.code, "message": str(error)}}).encode()
            self.send_response(error.status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.cors_allowed()
            self.end_headers()
            self.wfile.write(payload)

        def do_OPTIONS(self) -> None:
            if urlsplit(self.path).path not in ("/download", "/proxy"):
                self.error_json(ProxyAgentError("NOT_FOUND", "Route not found.", 404))
                return
            if self.headers.get("Origin") and self.headers.get("Origin") not in config.allowed_origins:
                self.error_json(ProxyAgentError("ORIGIN_NOT_ALLOWED", "Browser origin is not allowed.", 403))
                return
            self.send_response(204)
            self.cors_allowed()
            self.end_headers()

        def do_POST(self) -> None:
            parsed = urlsplit(self.path)
            if parsed.path != "/proxy":
                self.error_json(ProxyAgentError("NOT_FOUND", "Route not found.", 404))
                return
            origin = self.headers.get("Origin", "")
            if origin and origin not in config.allowed_origins:
                self.error_json(ProxyAgentError("ORIGIN_NOT_ALLOWED", "Browser origin is not allowed.", 403))
                return
            if not self.cors_allowed():
                self.error_json(ProxyAgentError("ORIGIN_NOT_ALLOWED", "Browser origin is not allowed.", 403))
                return
            client = (self.headers.get("X-Forwarded-For") or self.client_address[0] or "").split(",")[0].strip()
            if not within_rate_limit(client, config.rate_limit):
                self.error_json(ProxyAgentError("RATE_LIMITED", "Proxy rate limit exceeded.", 429))
                return
            length = positive_int(self.headers.get("Content-Length"), 0)
            if length > config.max_bytes:
                self.error_json(ProxyAgentError("REQUEST_BODY_TOO_LARGE", "Proxied request body exceeds OPENDOC_MAX_BYTES.", 413))
                return
            raw_body = self.rfile.read(length) if length else b""
            try:
                result = execute_proxied_request(raw_body, {key.lower(): value for key, value in self.headers.items()}, config)
            except ProxyAgentError as error:
                self.error_json(error)
                return
            payload = json.dumps(result).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-OpenDoc-Final-URL", result["finalUrl"])
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def do_GET(self) -> None:
            parsed = urlsplit(self.path)
            if parsed.path == "/health":
                payload = b'{"status":"ok"}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            if parsed.path != "/download":
                self.error_json(ProxyAgentError("NOT_FOUND", "Route not found.", 404))
                return
            origin = self.headers.get("Origin", "")
            if origin and origin not in config.allowed_origins:
                self.error_json(ProxyAgentError("ORIGIN_NOT_ALLOWED", "Browser origin is not allowed.", 403))
                return
            client = self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
            if not within_rate_limit(client, config.rate_limit):
                self.error_json(ProxyAgentError("RATE_LIMITED", "Proxy agent rate limit exceeded.", 429))
                return
            target = parse_qs(parsed.query).get("spec_url", [""])[0]
            if not target:
                self.error_json(ProxyAgentError("MISSING_TARGET_URL", "Missing spec_url query parameter.", 400))
                return
            try:
                status, upstream, body, source_url = download_spec(
                    target,
                    {
                        "if-none-match": self.headers.get("If-None-Match", ""),
                        "if-modified-since": self.headers.get("If-Modified-Since", ""),
                    },
                    config,
                )
                self.send_response(status)
                self.cors_allowed()
                for header in ("content-type", "etag", "last-modified"):
                    if upstream.get(header):
                        self.send_header(header, upstream[header])
                self.send_header("Content-Length", str(len(body)))
                self.send_header("X-OpenDoc-Final-URL", source_url)
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                if body:
                    self.wfile.write(body)
            except ProxyAgentError as error:
                self.error_json(error)
            except Exception:
                self.error_json(ProxyAgentError("PROXY_AGENT_ERROR", "Proxy agent request failed.", 502))

        def log_message(self, fmt: str, *args) -> None:
            print(f"{self.address_string()} - {fmt % args}")

    return ProxyAgentHandler


def main() -> None:
    config = Config.from_env()
    server = ThreadingHTTPServer((config.bind, config.port), create_handler(config))
    print(f"OpenDoc proxy agent listening on http://{config.bind}:{config.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
