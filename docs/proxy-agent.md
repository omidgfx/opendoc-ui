← [Back to README](../README.md) · [Docs index](index.md)

---

# Proxy agent services

The `proxy-agent/` directory contains the six reference implementations of the **OpenDoc UI
proxy agent**. Every implementation exposes the same API:

```http
GET /download?spec_url=<percent-encoded-http-or-https-url>
POST /proxy
OPTIONS /download
OPTIONS /proxy
GET /health
```

`GET /download` fetches a remote specification; `POST /proxy` executes a Runner request
server-side and answers with a JSON envelope — downloading specifications is one of the proxy
agent's jobs, not its whole identity, in all six languages. See [Request proxy](request-proxy.md)
for the proxy contract, build flags, and front-end switches.

A successful download returns the raw JSON/YAML bytes. Errors use a consistent JSON envelope:

```json
{
  "error": {
    "code": "TARGET_ADDRESS_BLOCKED",
    "message": "The target resolves to a private, reserved, or otherwise prohibited address."
  }
}
```

Copy `proxy-agent/config.env.example` into your deployment configuration. The common settings are:

```env
OPENDOC_ALLOWED_ORIGINS=https://docs.example.com,http://localhost:3000
OPENDOC_MAX_BYTES=10485760
OPENDOC_TIMEOUT_SECONDS=15
OPENDOC_MAX_REDIRECTS=3
OPENDOC_ALLOWED_PORTS=80,443
OPENDOC_RATE_LIMIT_PER_MINUTE=60
OPENDOC_ALLOWED_REMOTE_HOSTS=
OPENDOC_PROXY_ENABLED=true
PORT=8080
OPENDOC_BIND=0.0.0.0
```

`OPENDOC_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins. Do not include URL
paths. An empty `OPENDOC_ALLOWED_REMOTE_HOSTS` permits arbitrary **public** targets; private,
loopback, link-local, multicast, metadata-service, and reserved destinations remain blocked. Set an
exact/wildcard allowlist for constrained deployments:

```env
OPENDOC_ALLOWED_REMOTE_HOSTS=api.example.com,*.trusted.example
```

`OPENDOC_PROXY_ENABLED=false` turns the service back into a downloads-only agent: `POST /proxy`
answers `403 PROXY_DISABLED` while `GET /download` keeps working unchanged.

All implementations revalidate redirects, resolve every destination before connecting, limit
ports, stream with a hard size cutoff, omit user credentials/cookies, forward only conditional
cache headers, apply a per-client minute rate limit, and expose only the response headers OpenDoc
needs. Run them behind a production TLS reverse proxy and make both HTTP and HTTPS available if
the same OpenDoc bundle is served over both schemes.

## Node.js 22

```bash
cd proxy-agent/node
OPENDOC_ALLOWED_ORIGINS=http://localhost:3000 npm start
```

`server.mjs` exports `configFromEnv`, `downloadSpecification`, `executeProxiedRequest`, and
`createProxyAgentHandler`, so an existing Node/Express application can mount the returned handler
instead of starting the included HTTP server.

## Python 3.11+

```bash
cd proxy-agent/python
OPENDOC_ALLOWED_ORIGINS=http://localhost:3000 python app.py
```

`app.py` uses only the standard library. `download_spec()`, `execute_proxied_request()`, and
`create_handler()` can be called from Flask, Django, FastAPI, or another Python server; the
included `ThreadingHTTPServer` is the standalone entry point.

## PHP 8.1+

```bash
cd proxy-agent/php
OPENDOC_ALLOWED_ORIGINS=http://localhost:3000 php -S 0.0.0.0:8080 -t public public/index.php
```

The cURL extension is required. `src/ProxyAgent.php` contains framework-independent functions; a
Laravel/Symfony controller can call `downloadSpecification()` / `executeProxiedRequest()` and
translate `ProxyAgentException` into its normal response type. `public/index.php` is the
ready-to-run standalone adapter.

## Go 1.23+

```bash
cd proxy-agent/go
go run ./cmd/server
```

Import `proxy-agent/go/proxyagent` and mount `proxyagent.NewHandler(config)` in an existing
`net/http` router, or use the included command directly.

## Java 21 / Spring Boot

```bash
cd proxy-agent/java
mvn spring-boot:run
```

`ProxyAgentService` contains the reusable fetch policy (`download` and
`executeProxiedRequest`) and `ProxyAgentController` exposes the Spring MVC routes. Existing
Spring applications can copy/register those beans without using the included
`ProxyAgentApplication` launcher.

## C# / ASP.NET Core 8

```bash
cd proxy-agent/dotnet
dotnet run
```

Call `app.MapOpenDocProxyAgent(ProxyAgentConfig.FromEnvironment())` in an existing ASP.NET Core
application. `Program.cs` is the standalone host and `ProxyAgent.cs` contains the reusable
service (`DownloadAsync`, `ExecuteProxiedRequestAsync`), target policy, rate limiter, and
endpoint extension.

Every implementation also includes a Dockerfile. Example:

```bash
docker build -t opendoc-proxy-agent proxy-agent/go
docker run --rm -p 8080:8080 \
  -e OPENDOC_ALLOWED_ORIGINS=https://docs.example.com \
  opendoc-proxy-agent
```

These services are intentionally bounded proxy agents—not general-purpose open proxies. Keep
their limits enabled, deploy only the implementation matching your backend stack, and use a host
allowlist where practical.
---

← [Back to README](../README.md)
