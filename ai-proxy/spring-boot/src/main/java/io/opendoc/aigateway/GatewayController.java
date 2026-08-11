package io.opendoc.aigateway;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
public final class GatewayController {
    private final GatewayConfig config = GatewayConfig.fromEnvironment();
    private final GatewayLimits limits;
    private final ObjectMapper mapper;
    private final HttpClient client;

    public GatewayController(GatewayLimits limits, ObjectMapper mapper) {
        this.limits = limits;
        this.mapper = mapper;
        this.client = HttpClient.newBuilder().connectTimeout(config.timeout()).build();
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
                "ok", true,
                "authenticated", !config.token().isEmpty(),
                "provider", config.provider(),
                "model", config.model(),
                "clientModelSelection", config.allowClientModel());
    }

    @RequestMapping(path = "/api/ai/**", method = RequestMethod.OPTIONS)
    public ResponseEntity<Void> options(HttpServletRequest request) {
        HttpHeaders headers = cors(request);
        return new ResponseEntity<>(headers, HttpStatus.NO_CONTENT);
    }

    @PostMapping("/api/ai/models")
    public ResponseEntity<?> models(HttpServletRequest request) {
        Guard guard = guard(request);
        if (guard.failure != null) return guard.failure;
        try {
            List<Map<String, String>> models = config.allowedModels().stream()
                    .map(model -> Map.of(
                            "id", model,
                            "label", model + " · Gateway allowed",
                            "tier", tier(model)))
                    .toList();
            Map<String, Object> gateway = new LinkedHashMap<>();
            gateway.put("clientModelSelection", config.allowClientModel());
            gateway.put("provider", config.provider());
            gateway.put("model", config.model());
            if (config.allowClientModel()) gateway.put("models", config.allowedModels());
            HttpHeaders headers = cors(request);
            headers.set("X-RateLimit-Limit", String.valueOf(config.rateLimit()));
            headers.set("X-RateLimit-Remaining", String.valueOf(guard.remaining));
            return new ResponseEntity<>(Map.of("models", models, "gateway", gateway), headers, HttpStatus.OK);
        } finally {
            limits.release();
        }
    }

    @PostMapping(path = "/api/ai/chat", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> chat(HttpServletRequest servletRequest, @org.springframework.web.bind.annotation.RequestBody byte[] raw) {
        Guard guard = guard(servletRequest);
        if (guard.failure != null) return guard.failure;
        if (raw.length > config.maxBodyBytes()) {
            limits.release();
            return failure(servletRequest, "AI gateway request body is too large.", 413);
        }
        Map<String, Object> body;
        try {
            body = mapper.readValue(raw, new TypeReference<>() {});
        } catch (IOException error) {
            limits.release();
            return failure(servletRequest, "A valid JSON request body is required.", 400);
        }
        Object messagesValue = body.get("messages");
        if (!(messagesValue instanceof List<?> messages) || !validMessages(messages)) {
            limits.release();
            return failure(servletRequest, "The messages array exceeds gateway limits or is invalid.", 400);
        }
        Object requestedProvider = body.get("provider");
        if (requestedProvider instanceof String provider && !provider.isBlank() && !provider.equals(config.provider())) {
            limits.release();
            return failure(servletRequest, "Provider is fixed to '" + config.provider() + "' by the gateway.", 400);
        }
        String model = body.get("model") instanceof String value && !value.isBlank() ? value.trim() : config.model();
        if (!config.allowedModels().contains(model)) {
            limits.release();
            return failure(servletRequest, "Model '" + model + "' is not allowed by this gateway.", 400);
        }
        if (config.apiKey().isEmpty() && !config.provider().equals("ollama")) {
            limits.release();
            return failure(servletRequest, "AI_API_KEY is not configured on the gateway.", 503);
        }
        double temperature = body.get("temperature") instanceof Number value
                ? Math.max(0, Math.min(2, value.doubleValue()))
                : 0.2;
        Map<String, Object> upstreamBody = Map.of(
                "model", model,
                "messages", messages,
                "temperature", temperature,
                "max_tokens", config.maxOutputTokens(),
                "stream", true);
        String base = config.baseUrl();
        String url = base.endsWith("/chat/completions") ? base : base + "/chat/completions";
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(url))
                    .timeout(config.timeout())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofByteArray(mapper.writeValueAsBytes(upstreamBody)));
            if (!config.apiKey().isEmpty()) builder.header("Authorization", "Bearer " + config.apiKey());
            if (!config.siteUrl().isEmpty()) builder.header("HTTP-Referer", config.siteUrl());
            if (!config.appName().isEmpty()) builder.header("X-Title", config.appName());
            HttpResponse<InputStream> upstream = client.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
            if (upstream.statusCode() < 200 || upstream.statusCode() >= 300) {
                String message;
                try (InputStream stream = upstream.body()) {
                    byte[] bytes = stream.readNBytes(16_384);
                    message = upstreamMessage(bytes, upstream.statusCode());
                }
                limits.release();
                return failure(servletRequest, message, 502, Map.of(
                        "code", "upstream_error",
                        "status", upstream.statusCode(),
                        "provider", config.provider(),
                        "model", model));
            }
            StreamingResponseBody stream = output -> {
                try (InputStream input = upstream.body()) {
                    input.transferTo(output);
                    output.flush();
                } finally {
                    limits.release();
                }
            };
            HttpHeaders headers = cors(servletRequest);
            headers.setContentType(MediaType.parseMediaType(
                    upstream.headers().firstValue("content-type").orElse("text/event-stream; charset=utf-8")));
            headers.setCacheControl("no-cache, no-transform");
            headers.set("X-Accel-Buffering", "no");
            headers.set("X-RateLimit-Limit", String.valueOf(config.rateLimit()));
            headers.set("X-RateLimit-Remaining", String.valueOf(guard.remaining));
            return new ResponseEntity<>(stream, headers, HttpStatus.OK);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            limits.release();
            return failure(servletRequest, "AI upstream request was interrupted.", 502);
        } catch (Exception error) {
            limits.release();
            return failure(servletRequest, "AI upstream could not be reached.", 502);
        }
    }

    private Guard guard(HttpServletRequest request) {
        HttpHeaders headers;
        try {
            headers = cors(request);
        } catch (GatewayFailure error) {
            return new Guard(failure(request, error.getMessage(), error.status), -1);
        }
        if (!config.token().isEmpty() && !("Bearer " + config.token()).equals(request.getHeader("Authorization")))
            return new Guard(failure(request, "Invalid AI gateway token.", 401), -1);
        String client = request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
        int remaining = limits.takeRateSlot(client, config.rateLimit());
        if (remaining < 0) return new Guard(failure(request, "AI gateway rate limit exceeded.", 429), -1);
        if (!limits.acquire(config.maxConcurrent())) return new Guard(failure(request, "AI gateway is busy.", 429), -1);
        return new Guard(null, remaining);
    }

    private HttpHeaders cors(HttpServletRequest request) {
        String origin = request.getHeader("Origin");
        HttpHeaders headers = new HttpHeaders();
        if (origin != null && !origin.isBlank()) {
            if (!config.origins().contains(origin)) throw new GatewayFailure("Origin is not allowed by this AI gateway.", 403);
            headers.setAccessControlAllowOrigin(origin);
        }
        headers.setVary(List.of("Origin"));
        headers.setAccessControlAllowHeaders(List.of("Content-Type", "Authorization"));
        headers.setAccessControlAllowMethods(List.of(org.springframework.http.HttpMethod.GET, org.springframework.http.HttpMethod.POST, org.springframework.http.HttpMethod.OPTIONS));
        headers.setAccessControlExposeHeaders(List.of("X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"));
        return headers;
    }

    private ResponseEntity<Map<String, Object>> failure(HttpServletRequest request, String message, int status) {
        return failure(request, message, status, Map.of());
    }

    private ResponseEntity<Map<String, Object>> failure(HttpServletRequest request, String message, int status, Map<String, Object> details) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("message", message);
        error.putAll(details);
        HttpHeaders headers;
        try { headers = cors(request); } catch (GatewayFailure ignored) { headers = new HttpHeaders(); }
        return new ResponseEntity<>(Map.of("error", error), headers, HttpStatus.valueOf(status));
    }

    private boolean validMessages(List<?> messages) {
        if (messages.isEmpty() || messages.size() > config.maxMessages()) return false;
        int total = 0;
        for (Object item : messages) {
            if (!(item instanceof Map<?, ?> message)) return false;
            Object role = message.get("role");
            Object content = message.get("content");
            if (!(role instanceof String roleText)
                    || !List.of("system", "user", "assistant").contains(roleText)
                    || !(content instanceof String text)
                    || text.length() > config.maxMessageChars()) return false;
            total += text.length();
            if (total > config.maxContextChars()) return false;
        }
        return true;
    }

    private String tier(String model) {
        return config.provider().equals("ollama") ? "local" : model.endsWith(":free") ? "free" : "premium";
    }

    private String upstreamMessage(byte[] bytes, int status) {
        try {
            Map<String, Object> payload = mapper.readValue(bytes, new TypeReference<>() {});
            if (payload.get("error") instanceof Map<?, ?> error && error.get("message") instanceof String message)
                return message;
            if (payload.get("message") instanceof String message) return message;
        } catch (IOException ignored) {}
        String raw = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
        return raw.isBlank() ? "Upstream returned HTTP " + status + "." : raw;
    }

    private record Guard(ResponseEntity<?> failure, int remaining) {}
    private static final class GatewayFailure extends RuntimeException {
        final int status;
        GatewayFailure(String message, int status) { super(message); this.status = status; }
    }
}
