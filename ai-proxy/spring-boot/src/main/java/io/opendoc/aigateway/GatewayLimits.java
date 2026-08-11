package io.opendoc.aigateway;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.stereotype.Component;

@Component
public final class GatewayLimits {
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();
    private final AtomicInteger active = new AtomicInteger();

    public int takeRateSlot(String client, int limit) {
        long minute = Instant.now().getEpochSecond() / 60;
        Bucket bucket = buckets.compute(client, (key, current) ->
                current == null || current.minute != minute
                        ? new Bucket(minute, 1)
                        : new Bucket(minute, current.count + 1));
        return bucket.count <= limit ? limit - bucket.count : -1;
    }

    public boolean acquire(int limit) {
        int value = active.incrementAndGet();
        if (value <= limit) return true;
        active.decrementAndGet();
        return false;
    }

    public void release() {
        active.updateAndGet(value -> Math.max(0, value - 1));
    }

    private record Bucket(long minute, int count) {}
}
