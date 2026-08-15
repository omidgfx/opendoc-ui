package io.opendoc.aigateway;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

public record GatewayConfig(
        String token,
        boolean devMode,
        List<String> origins,
        String provider,
        String model,
        String baseUrl,
        String apiKey,
        boolean allowClientModel,
        Set<String> allowedModels,
        int rateLimit,
        int maxConcurrent,
        int maxMessages,
        int maxMessageChars,
        int maxContextChars,
        int maxOutputTokens,
        Duration timeout,
        int maxBodyBytes,
        String siteUrl,
        String appName) {

    public static GatewayConfig fromEnvironment() {
        String model = value("AI_MODEL", "").trim();
        if (model.isEmpty()) throw new IllegalStateException("AI_MODEL is required.");
        String provider = value("AI_PROVIDER", "openai");
        if (!List.of("openai", "openrouter", "ollama", "custom").contains(provider))
            throw new IllegalStateException("Framework gateway examples require an OpenAI-compatible AI_PROVIDER.");
        boolean allow = Boolean.parseBoolean(value("AI_GATEWAY_ALLOW_CLIENT_MODEL", "false"));
        Set<String> models = (allow ? csv(value("AI_GATEWAY_ALLOWED_MODELS", "")) : List.of(model)).stream()
                .collect(Collectors.toUnmodifiableSet());
        if (models.stream().anyMatch(value -> value.contains("*")))
            throw new IllegalStateException("AI_GATEWAY_ALLOWED_MODELS accepts exact model IDs only.");
        if (models.isEmpty() || !models.contains(model))
            throw new IllegalStateException("AI_GATEWAY_ALLOWED_MODELS must be non-empty and include AI_MODEL.");
        GatewayConfig config = new GatewayConfig(
                value("AI_GATEWAY_TOKEN", ""),
                Boolean.parseBoolean(value("AI_GATEWAY_DEV_MODE", "false")),
                csv(first(value("AI_GATEWAY_ORIGINS", ""), value("AI_GATEWAY_ORIGIN", ""), "http://localhost:3000")),
                provider,
                model,
                value("AI_BASE_URL", "https://api.openai.com/v1").replaceAll("/+$", ""),
                value("AI_API_KEY", ""),
                allow,
                models,
                positive("AI_GATEWAY_RATE_LIMIT", 30),
                positive("AI_GATEWAY_MAX_CONCURRENT", 4),
                positive("AI_GATEWAY_MAX_MESSAGES", 24),
                positive("AI_GATEWAY_MAX_MESSAGE_CHARS", 40_000),
                positive("AI_GATEWAY_MAX_CONTEXT_CHARS", 250_000),
                positive("AI_GATEWAY_MAX_OUTPUT_TOKENS", 2_048),
                Duration.ofMillis(positive("AI_GATEWAY_UPSTREAM_TIMEOUT_MS", 60_000)),
                positive("AI_GATEWAY_MAX_BODY_BYTES", 1_048_576),
                value("AI_SITE_URL", ""),
                value("AI_APP_NAME", "OpenDoc UI"));
        if (config.token().isEmpty() && !config.devMode())
            throw new IllegalStateException("AI_GATEWAY_TOKEN is required unless AI_GATEWAY_DEV_MODE=true.");
        return config;
    }

    private static List<String> csv(String value) {
        return Arrays.stream(value.split(",")).map(String::trim).filter(item -> !item.isEmpty()).toList();
    }

    private static int positive(String name, int fallback) {
        try {
            int parsed = Integer.parseInt(value(name, ""));
            return parsed > 0 ? parsed : fallback;
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static String first(String... values) {
        for (String value : values) if (!value.isEmpty()) return value;
        return "";
    }

    private static String value(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
