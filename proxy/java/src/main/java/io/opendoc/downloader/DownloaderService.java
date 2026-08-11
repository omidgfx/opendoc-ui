package io.opendoc.downloader;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.springframework.stereotype.Service;

@Service
public final class DownloaderService {
    private final DownloaderConfig config;
    private final HttpClient client;

    public DownloaderService() {
        this(DownloaderConfig.fromEnvironment());
    }

    DownloaderService(DownloaderConfig config) {
        this.config = config;
        this.client = HttpClient.newBuilder()
                .connectTimeout(config.timeout())
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public DownloaderConfig config() {
        return config;
    }

    public DownloadResult download(String input, String ifNoneMatch, String ifModifiedSince) {
        URI current;
        try {
            current = URI.create(input);
        } catch (IllegalArgumentException error) {
            throw new DownloaderException("INVALID_TARGET_URL", "spec_url must be a complete HTTP or HTTPS URL.", 400, error);
        }
        for (int redirects = 0; redirects <= config.maxRedirects(); redirects++) {
            TargetPolicy.validate(current, config);
            HttpRequest.Builder builder = HttpRequest.newBuilder(current)
                    .GET()
                    .timeout(config.timeout())
                    .header("Accept", "application/json, application/yaml, text/yaml, text/plain, */*;q=0.5")
                    .header("Accept-Encoding", "identity")
                    .header("User-Agent", "OpenDoc-Spec-Downloader/0.1");
            if (ifNoneMatch != null && !ifNoneMatch.isBlank()) builder.header("If-None-Match", ifNoneMatch);
            if (ifModifiedSince != null && !ifModifiedSince.isBlank()) builder.header("If-Modified-Since", ifModifiedSince);
            try {
                HttpResponse<InputStream> response = client.send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
                int status = response.statusCode();
                String location = response.headers().firstValue("location").orElse("");
                if (status >= 300 && status <= 399 && !location.isBlank()) {
                    response.body().close();
                    if (redirects == config.maxRedirects())
                        throw new DownloaderException("REMOTE_REDIRECT_LIMIT", "Remote redirect limit exceeded.", 502);
                    current = current.resolve(location);
                    continue;
                }
                if (status == 304) {
                    response.body().close();
                    return new DownloadResult(status, response.headers(), new byte[0], current);
                }
                if (status < 200 || status >= 300) {
                    response.body().close();
                    throw new DownloaderException("REMOTE_HTTP_STATUS", "Remote server returned HTTP " + status + ".", 502);
                }
                long declared = response.headers().firstValueAsLong("content-length").orElse(0);
                if (declared > config.maxBytes()) {
                    response.body().close();
                    throw new DownloaderException("REMOTE_FILE_TOO_LARGE", "Remote specification exceeds OPENDOC_MAX_BYTES.", 413);
                }
                int limit = (int) Math.min(Integer.MAX_VALUE - 1L, config.maxBytes());
                byte[] body;
                try (InputStream stream = response.body()) {
                    body = stream.readNBytes(limit + 1);
                }
                if (body.length > config.maxBytes())
                    throw new DownloaderException("REMOTE_FILE_TOO_LARGE", "Remote specification exceeds OPENDOC_MAX_BYTES.", 413);
                return new DownloadResult(status, response.headers(), body, current);
            } catch (DownloaderException error) {
                throw error;
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new DownloaderException("REMOTE_TIMEOUT", "Remote request was interrupted.", 504, error);
            } catch (IOException error) {
                throw new DownloaderException("REMOTE_CONNECTION_FAILED", "The remote server could not be reached.", 502, error);
            }
        }
        throw new DownloaderException("REMOTE_REDIRECT_LIMIT", "Remote redirect limit exceeded.", 502);
    }
}
