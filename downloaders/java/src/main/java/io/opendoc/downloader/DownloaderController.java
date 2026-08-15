package io.opendoc.downloader;

import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public final class DownloaderController {
    private final DownloaderService service;
    private final MinuteRateLimiter rateLimiter;

    public DownloaderController(DownloaderService service, MinuteRateLimiter rateLimiter) {
        this.service = service;
        this.rateLimiter = rateLimiter;
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok");
    }

    @RequestMapping(path = "/download", method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> options(HttpServletRequest request) {
        HttpHeaders headers = corsHeaders(request);
        return new ResponseEntity<>(headers, HttpStatus.NO_CONTENT);
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
            throw new DownloaderException("RATE_LIMITED", "Downloader rate limit exceeded.", 429);
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

    @ExceptionHandler(DownloaderException.class)
    public ResponseEntity<Map<String, Object>> downloaderError(DownloaderException error, HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();
        try {
            headers.putAll(corsHeaders(request));
        } catch (DownloaderException ignored) {
            // A rejected origin intentionally receives no CORS grant.
        }
        headers.setCacheControl("no-store");
        Map<String, Object> body = Map.of("error", Map.of("code", error.code(), "message", error.getMessage()));
        return new ResponseEntity<>(body, headers, HttpStatus.valueOf(error.status()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unexpectedError(HttpServletRequest request) {
        return downloaderError(new DownloaderException("DOWNLOADER_ERROR", "Specification download failed.", 502), request);
    }

    private HttpHeaders corsHeaders(HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();
        String origin = request.getHeader("Origin");
        if (origin == null || origin.isBlank()) return headers;
        if (!service.config().allowedOrigins().contains(origin))
            throw new DownloaderException("ORIGIN_NOT_ALLOWED", "Browser origin is not allowed.", 403);
        headers.setAccessControlAllowOrigin(origin);
        headers.setVary(java.util.List.of("Origin"));
        headers.setAccessControlAllowMethods(java.util.List.of(org.springframework.http.HttpMethod.GET, org.springframework.http.HttpMethod.OPTIONS));
        headers.setAccessControlAllowHeaders(java.util.List.of("Content-Type", "If-None-Match", "If-Modified-Since"));
        headers.setAccessControlExposeHeaders(
                java.util.List.of("ETag", "Last-Modified", "Content-Length", "Content-Type", "X-OpenDoc-Final-URL"));
        return headers;
    }
}
