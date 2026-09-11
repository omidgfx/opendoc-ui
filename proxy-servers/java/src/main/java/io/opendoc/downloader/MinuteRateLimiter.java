package io.opendoc.downloader;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

@Component
public final class MinuteRateLimiter {
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    public boolean allow(String key, int limit) {
        long minute = Instant.now().getEpochSecond() / 60;
        Bucket bucket = buckets.compute(key, (ignored, current) -> {
            if (current == null || current.minute != minute) return new Bucket(minute, 1);
            return new Bucket(minute, current.count + 1);
        });
        return bucket.count <= limit;
    }

    private record Bucket(long minute, int count) {}
}
