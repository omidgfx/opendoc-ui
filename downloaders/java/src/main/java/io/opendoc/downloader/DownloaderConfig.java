package io.opendoc.downloader;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

public record DownloaderConfig(
        List<String> allowedOrigins,
        long maxBytes,
        Duration timeout,
        int maxRedirects,
        Set<Integer> allowedPorts,
        List<String> allowedHosts,
        int rateLimit) {

    public static DownloaderConfig fromEnvironment() {
        return new DownloaderConfig(
                csv(System.getenv("OPENDOC_ALLOWED_ORIGINS")),
                positiveLong(System.getenv("OPENDOC_MAX_BYTES"), 10L * 1024 * 1024),
                Duration.ofSeconds(positiveInt(System.getenv("OPENDOC_TIMEOUT_SECONDS"), 15)),
                positiveInt(System.getenv("OPENDOC_MAX_REDIRECTS"), 3),
                csv(valueOr(System.getenv("OPENDOC_ALLOWED_PORTS"), "80,443")).stream()
                        .map(Integer::parseInt)
                        .collect(Collectors.toUnmodifiableSet()),
                csv(System.getenv("OPENDOC_ALLOWED_REMOTE_HOSTS")).stream()
                        .map(String::toLowerCase)
                        .toList(),
                positiveInt(System.getenv("OPENDOC_RATE_LIMIT_PER_MINUTE"), 60));
    }

    private static List<String> csv(String value) {
        if (value == null || value.isBlank()) return List.of();
        return Arrays.stream(value.split(",")).map(String::trim).filter(item -> !item.isEmpty()).toList();
    }

    private static int positiveInt(String value, int fallback) {
        try {
            int parsed = Integer.parseInt(valueOr(value, ""));
            return parsed > 0 ? parsed : fallback;
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static long positiveLong(String value, long fallback) {
        try {
            long parsed = Long.parseLong(valueOr(value, ""));
            return parsed > 0 ? parsed : fallback;
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }
}
