package io.opendoc.proxyagent;

import java.util.Enumeration;
import java.util.HashMap;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public final class ProxyAgentController {
    private final ProxyAgentService service;
    private final MinuteRateLimiter rateLimiter;

    public ProxyAgentController(ProxyAgentService service, MinuteRateLimiter rateLimiter) {
        this.service = service;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    @RequestMapping(path = {"/download", "/proxy"}, method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> options(HttpServletRequest request) {
        HttpHeaders headers = corsHeaders(request);
        return new ResponseEntity<>(headers, HttpStatus.NO_CONTENT);
    }

    @PostMapping("/proxy")
    public ResponseEntity<Map<String, Object>> proxy(HttpServletRequest request) {
        HttpHeaders headers = corsHeaders(request);
        String client = request.getHeader("X-Forwarded-For");
        if (client == null || client.isBlank()) client = request.getRemoteAddr();
        client = client.split(",")[0].trim();
        if (!rateLimiter.allow(client, service.config().rateLimit()))
            throw new ProxyAgentException("RATE_LIMITED", "Proxy rate limit exceeded.", 429);
        byte[] rawBody;
        try {
            rawBody = request.getInputStream().readNBytes((int) service.config().maxBytes() + 1);
        } catch (java.io.IOException error) {
            throw new ProxyAgentException("PROXY_AGENT_ERROR", "Proxied request body could not be read.", 400, error);
        }
        if (rawBody.length > service.config().maxBytes())
            throw new ProxyAgentException("REQUEST_BODY_TOO_LARGE", "Proxied request body exceeds OPENDOC_MAX_BYTES.", 413);
        Map<String, String> incoming = new HashMap<>();
        Enumeration<String> names = request.getHeaderNames();
        while (names != null && names.hasMoreElements()) {
            String name = names.nextElement();
            incoming.put(name.toLowerCase(java.util.Locale.ROOT), request.getHeader(name));
        }
        ProxiedResponse result = service.executeProxiedRequest(rawBody, incoming);
        headers.set("X-OpenDoc-Final-URL", result.finalUrl());
        headers.setCacheControl("no-store");
        headers.set("X-Content-Type-Options", "nosniff");
        headers.setContentType(MediaType.APPLICATION_JSON);
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("status", result.status());
        body.put("statusText", result.statusText());
        body.put("headers", result.headers());
        body.put("finalUrl", result.finalUrl());
        body.put("body", result.body());
        body.put("bodyEncoding", result.bodyEncoding());
        body.put("durationMs", result.durationMs());
        return new ResponseEntity<>(body, headers, HttpStatus.OK);
    }

    @GetMapping("/download")
    public ResponseEntity<byte[]> download(
            @RequestParam(name = "spec_url") String specUrl,
            @RequestHeader(name = "If-None-Match", required = false) String ifNoneMatch,
            @RequestHeader(name = "If-Modified-Since", required = false) String ifModifiedSince,
            HttpServletRequest request) {
        HttpHeaders headers = corsHeaders(request);
        String client = request.getHeader("X-Forwarded-For");
        if (client == null || client.isBlank()) client = request.getRemoteAddr();
        client = client.split(",")[0].trim();
        if (!rateLimiter.allow(client, service.config().rateLimit()))
            throw new ProxyAgentException("RATE_LIMITED", "Proxy agent rate limit exceeded.", 429);
        DownloadResult result = service.download(specUrl, ifNoneMatch, ifModifiedSince);
        result.headers().firstValue("content-type").ifPresent(value -> {
            try {
                headers.setContentType(MediaType.parseMediaType(value));
            } catch (IllegalArgumentException ignored) {
                headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
            }
        });
        result.headers().firstValue("etag").ifPresent(value -> headers.set(HttpHeaders.ETAG, value));
        result.headers().firstValue("last-modified").ifPresent(value -> headers.set(HttpHeaders.LAST_MODIFIED, value));
        headers.set("X-OpenDoc-Final-URL", result.sourceUri().toString());
        headers.setCacheControl("no-store");
        headers.set("X-Content-Type-Options", "nosniff");
        headers.setContentLength(result.body().length);
        return new ResponseEntity<>(result.body(), headers, HttpStatus.valueOf(result.status()));
    }

    @ExceptionHandler(ProxyAgentException.class)
    public ResponseEntity<Map<String, Object>> proxyAgentError(ProxyAgentException error, HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();
        try {
            headers.putAll(corsHeaders(request));
        } catch (ProxyAgentException ignored) {
            // A rejected origin intentionally receives no CORS grant.
        }
        headers.setCacheControl("no-store");
        Map<String, Object> body = Map.of("error", Map.of("code", error.code(), "message", error.getMessage()));
        return new ResponseEntity<>(body, headers, HttpStatus.valueOf(error.status()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unexpectedError(HttpServletRequest request) {
        return proxyAgentError(new ProxyAgentException("PROXY_AGENT_ERROR", "Proxy agent request failed.", 502), request);
    }

    private HttpHeaders corsHeaders(HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();
        String origin = request.getHeader("Origin");
        if (origin == null || origin.isBlank()) return headers;
        if (!service.config().allowedOrigins().contains(origin))
            throw new ProxyAgentException("ORIGIN_NOT_ALLOWED", "Browser origin is not allowed.", 403);
        headers.setAccessControlAllowOrigin(origin);
        headers.setVary(java.util.List.of("Origin"));
        headers.setAccessControlAllowMethods(java.util.List.of(org.springframework.http.HttpMethod.GET, org.springframework.http.HttpMethod.POST, org.springframework.http.HttpMethod.OPTIONS));
        headers.setAccessControlAllowHeaders(java.util.List.of("Content-Type", "If-None-Match", "If-Modified-Since", "X-OpenDoc-Target-Url", "X-OpenDoc-Target-Method", "X-OpenDoc-Target-Headers"));
        headers.setAccessControlExposeHeaders(
                java.util.List.of("ETag", "Last-Modified", "Content-Length", "Content-Type", "X-OpenDoc-Final-URL"));
        return headers;
    }
}
