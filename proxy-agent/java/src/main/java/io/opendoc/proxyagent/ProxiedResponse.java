package io.opendoc.proxyagent;

import java.util.Map;

public record ProxiedResponse(
        int status,
        String statusText,
        Map<String, String> headers,
        String finalUrl,
        String body,
        String bodyEncoding,
        long durationMs) {
}
