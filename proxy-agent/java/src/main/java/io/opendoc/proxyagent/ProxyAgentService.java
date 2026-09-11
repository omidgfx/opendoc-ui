package io.opendoc.proxyagent;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.springframework.stereotype.Service;

@Service
public final class ProxyAgentService {
    private final ProxyAgentConfig config;
    private final HttpClient client;

    public ProxyAgentService() {
        this(ProxyAgentConfig.fromEnvironment());
    }

    ProxyAgentService(ProxyAgentConfig config) {
        this.config = config;
        this.client = HttpClient.newBuilder()
                .connectTimeout(config.timeout())
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public ProxyAgentConfig config() {
        return config;
    }

    private static final Set<String> HOP_BY_HOP_HEADERS = Set.of(
            "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te",
            "trailer", "transfer-encoding", "upgrade", "host", "content-length", "accept-encoding");

    public ProxiedResponse executeProxiedRequest(byte[] rawBody, Map<String, String> incomingHeaders) {
        long started = System.currentTimeMillis();
        if (!config.proxyEnabled())
            throw new ProxyAgentException("PROXY_DISABLED", "The request proxy is disabled on this proxy agent.", 403);
        String target = incomingHeaders.getOrDefault("x-opendoc-target-url", "").trim();
        if (target.isEmpty())
            throw new ProxyAgentException("MISSING_TARGET_URL", "Missing X-OpenDoc-Target-Url header.", 400);
        URI current;
        try {
            current = URI.create(target);
        } catch (IllegalArgumentException error) {
            throw new ProxyAgentException("TARGET_PROTOCOL_BLOCKED", "Only HTTP and HTTPS targets are allowed.", 400, error);
        }
        String scheme = current.getScheme() == null ? "" : current.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https"))
            throw new ProxyAgentException("TARGET_PROTOCOL_BLOCKED", "Only HTTP and HTTPS targets are allowed.", 400);
        if (current.getUserInfo() != null)
            throw new ProxyAgentException("TARGET_CREDENTIALS_BLOCKED", "Target credentials in URLs are not allowed.", 400);
        String method = incomingHeaders.getOrDefault("x-opendoc-target-method", "GET").trim().toUpperCase(Locale.ROOT);
        if (method.isEmpty()) method = "GET";
        if (!method.chars().allMatch(Character::isLetter))
            throw new ProxyAgentException("INVALID_TARGET_METHOD", "Target method is not valid.", 400);
        Map<String, String> targetHeaders = new LinkedHashMap<>();
        String rawHeaders = incomingHeaders.getOrDefault("x-opendoc-target-headers", "").trim();
        if (!rawHeaders.isEmpty()) {
            try {
                Map<String, String> parsed = new ObjectMapper().readValue(rawHeaders, new TypeReference<Map<String, String>>() {});
                parsed.forEach((key, value) -> {
                    if (!HOP_BY_HOP_HEADERS.contains(key.toLowerCase(Locale.ROOT))) targetHeaders.put(key, value);
                });
            } catch (IOException error) {
                throw new ProxyAgentException("INVALID_TARGET_HEADERS", "X-OpenDoc-Target-Headers must be a JSON object.", 400, error);
            }
        }
        byte[] body = rawBody == null ? new byte[0] : rawBody;
        for (int redirects = 0; redirects <= config.maxRedirects(); redirects++) {
            TargetPolicy.validate(current, config);
            HttpRequest.Builder builder = HttpRequest.newBuilder(current)
                    .timeout(config.timeout())
                    .header("Accept-Encoding", "identity")
                    .header("User-Agent", "OpenDoc-Proxy-Agent/0.1");
            if (method.equals("GET")) builder.GET();
            else if (method.equals("HEAD")) builder.method("HEAD", HttpRequest.BodyPublishers.noBody());
            else builder.method(method, HttpRequest.BodyPublishers.ofByteArray(body));
            for (Map.Entry<String, String> header : targetHeaders.entrySet()) builder.header(header.getKey(), header.getValue());
            HttpResponse<InputStream> response;
            try {
                response = client.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new ProxyAgentException("REMOTE_TIMEOUT", "Remote request was interrupted.", 504, error);
            } catch (IOException error) {
                throw new ProxyAgentException("REMOTE_CONNECTION_FAILED", "The remote server could not be reached.", 502, error);
            }
            int status = response.statusCode();
            String location = response.headers().firstValue("location").orElse("");
            if (isRedirect(status) && !location.isBlank() && redirects < config.maxRedirects()) {
                try {
                    response.body().close();
                } catch (IOException ignored) {
                }
                if (status == 303 || ((status == 301 || status == 302) && !method.equals("GET") && !method.equals("HEAD"))) {
                    method = "GET";
                    body = new byte[0];
                }
                current = current.resolve(location);
                continue;
            }
            byte[] payload;
            int limit = (int) Math.min(Integer.MAX_VALUE - 1L, config.maxBytes());
            try (InputStream stream = response.body()) {
                payload = stream.readNBytes(limit + 1);
            } catch (IOException error) {
                throw new ProxyAgentException("REMOTE_CONNECTION_FAILED", "The remote server could not be reached.", 502, error);
            }
            if (payload.length > config.maxBytes())
                throw new ProxyAgentException("REMOTE_RESPONSE_TOO_LARGE", "Remote response exceeds OPENDOC_MAX_BYTES.", 502);
            Map<String, String> headers = new HashMap<>();
            response.headers().map().forEach((name, values) -> headers.put(name.toLowerCase(Locale.ROOT), String.join(", ", values)));
            return new ProxiedResponse(
                    status,
                    "",
                    headers,
                    current.toString(),
                    Base64.getEncoder().encodeToString(payload),
                    "base64",
                    System.currentTimeMillis() - started);
        }
        throw new ProxyAgentException("REMOTE_REDIRECT_LIMIT", "Remote redirect limit exceeded.", 502);
    }

    private static boolean isRedirect(int status) {
        return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
    }

    public DownloadResult download(String input, String ifNoneMatch, String ifModifiedSince) {
        URI current;
        try {
            current = URI.create(input);
        } catch (IllegalArgumentException error) {
            throw new ProxyAgentException("INVALID_TARGET_URL", "spec_url must be a complete HTTP or HTTPS URL.", 400, error);
        }
        for (int redirects = 0; redirects <= config.maxRedirects(); redirects++) {
            TargetPolicy.validate(current, config);
            HttpRequest.Builder builder = HttpRequest.newBuilder(current)
                    .GET()
                    .timeout(config.timeout())
                    .header("Accept", "application/json, application/yaml, text/yaml, text/plain, */*;q=0.5")
                    .header("Accept-Encoding", "identity")
                    .header("User-Agent", "OpenDoc-Proxy-Agent/0.1");
            if (ifNoneMatch != null && !ifNoneMatch.isBlank()) builder.header("If-None-Match", ifNoneMatch);
            if (ifModifiedSince != null && !ifModifiedSince.isBlank()) builder.header("If-Modified-Since", ifModifiedSince);
            try {
                HttpResponse<InputStream> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
                int status = response.statusCode();
                String location = response.headers().firstValue("location").orElse("");
                if (status >= 300 && status <= 399 && !location.isBlank()) {
                    response.body().close();
                    if (redirects == config.maxRedirects())
                        throw new ProxyAgentException("REMOTE_REDIRECT_LIMIT", "Remote redirect limit exceeded.", 502);
                    current = current.resolve(location);
                    continue;
                }
                if (status == 304) {
                    response.body().close();
                    return new DownloadResult(status, response.headers(), new byte[0], current);
                }
                if (status < 200 || status >= 300) {
                    response.body().close();
                    throw new ProxyAgentException("REMOTE_HTTP_STATUS", "Remote server returned HTTP " + status + ".", 502);
                }
                long declared = response.headers().firstValueAsLong("content-length").orElse(0);
                if (declared > config.maxBytes()) {
                    response.body().close();
                    throw new ProxyAgentException("REMOTE_FILE_TOO_LARGE", "Remote specification exceeds OPENDOC_MAX_BYTES.", 413);
                }
                int limit = (int) Math.min(Integer.MAX_VALUE - 1L, config.maxBytes());
                byte[] body;
                try (InputStream stream = response.body()) {
                    body = stream.readNBytes(limit + 1);
                }
                if (body.length > config.maxBytes())
                    throw new ProxyAgentException("REMOTE_FILE_TOO_LARGE", "Remote specification exceeds OPENDOC_MAX_BYTES.", 413);
                return new DownloadResult(status, response.headers(), body, current);
            } catch (ProxyAgentException error) {
                throw error;
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new ProxyAgentException("REMOTE_TIMEOUT", "Remote request was interrupted.", 504, error);
            } catch (IOException error) {
                throw new ProxyAgentException("REMOTE_CONNECTION_FAILED", "The remote server could not be reached.", 502, error);
            }
        }
        throw new ProxyAgentException("REMOTE_REDIRECT_LIMIT", "Remote redirect limit exceeded.", 502);
    }
}
