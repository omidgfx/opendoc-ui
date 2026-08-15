using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;

namespace OpenDoc.SpecDownloader;

public sealed record DownloaderConfig(
    HashSet<string> AllowedOrigins,
    long MaxBytes,
    TimeSpan Timeout,
    int MaxRedirects,
    HashSet<int> AllowedPorts,
    string[] AllowedHosts,
    int RateLimit)
{
    public static DownloaderConfig FromEnvironment() => new(
        Csv(Environment.GetEnvironmentVariable("OPENDOC_ALLOWED_ORIGINS")).ToHashSet(StringComparer.Ordinal),
        PositiveLong(Environment.GetEnvironmentVariable("OPENDOC_MAX_BYTES"), 10L * 1024 * 1024),
        TimeSpan.FromSeconds(PositiveInt(Environment.GetEnvironmentVariable("OPENDOC_TIMEOUT_SECONDS"), 15)),
        PositiveInt(Environment.GetEnvironmentVariable("OPENDOC_MAX_REDIRECTS"), 3),
        Csv(Environment.GetEnvironmentVariable("OPENDOC_ALLOWED_PORTS") ?? "80,443").Select(int.Parse).ToHashSet(),
        Csv(Environment.GetEnvironmentVariable("OPENDOC_ALLOWED_REMOTE_HOSTS")).Select(value => value.ToLowerInvariant()).ToArray(),
        PositiveInt(Environment.GetEnvironmentVariable("OPENDOC_RATE_LIMIT_PER_MINUTE"), 60));

    private static string[] Csv(string? value) => (value ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
    private static int PositiveInt(string? value, int fallback) => int.TryParse(value, out var parsed) && parsed > 0 ? parsed : fallback;
    private static long PositiveLong(string? value, long fallback) => long.TryParse(value, out var parsed) && parsed > 0 ? parsed : fallback;
}

public sealed class DownloaderException(string code, string message, int status = 502, Exception? inner = null)
    : Exception(message, inner)
{
    public string Code { get; } = code;
    public int Status { get; } = status;
}

public static class TargetPolicy
{
    public static async Task<(Uri Uri, IPAddress[] Addresses)> ValidateAsync(string input, DownloaderConfig config, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(input, UriKind.Absolute, out var target))
            throw new DownloaderException("INVALID_TARGET_URL", "spec_url must be a complete HTTP or HTTPS URL.", 400);
        if (target.Scheme is not ("http" or "https"))
            throw new DownloaderException("TARGET_PROTOCOL_BLOCKED", "Only HTTP and HTTPS targets are allowed.", 400);
        if (!string.IsNullOrEmpty(target.UserInfo))
            throw new DownloaderException("TARGET_CREDENTIALS_BLOCKED", "Target credentials in URLs are not allowed.", 400);
        var host = target.DnsSafeHost.ToLowerInvariant();
        if (host is "localhost" || host.EndsWith(".localhost") || host.EndsWith(".local"))
            throw new DownloaderException("TARGET_HOST_BLOCKED", "Local hostnames are blocked.", 403);
        if (!HostAllowed(host, config.AllowedHosts))
            throw new DownloaderException("TARGET_HOST_NOT_ALLOWED", "The target host is not in OPENDOC_ALLOWED_REMOTE_HOSTS.", 403);
        if (!config.AllowedPorts.Contains(target.Port))
            throw new DownloaderException("TARGET_PORT_BLOCKED", $"Remote port {target.Port} is not allowed.", 403);
        IPAddress[] addresses;
        try
        {
            addresses = await Dns.GetHostAddressesAsync(host, cancellationToken);
        }
        catch (SocketException error)
        {
            throw new DownloaderException("TARGET_DNS_FAILED", "The target hostname could not be resolved.", 502, error);
        }
        if (addresses.Length == 0)
            throw new DownloaderException("TARGET_DNS_FAILED", "The target hostname could not be resolved.", 502);
        if (addresses.Any(address => !IsPublic(address)))
            throw new DownloaderException("TARGET_ADDRESS_BLOCKED", "The target resolves to a private, reserved, or otherwise prohibited address.", 403);
        return (target, addresses);
    }

    public static bool IsPublic(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        if (IPAddress.IsLoopback(address) || address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any)) return false;
        var bytes = address.GetAddressBytes();
        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            var a = bytes[0];
            var b = bytes[1];
            var c = bytes[2];
            if (a is 0 or 10 or 127 || a >= 224) return false;
            if (a == 100 && b is >= 64 and <= 127) return false;
            if (a == 169 && b == 254) return false;
            if (a == 172 && b is >= 16 and <= 31) return false;
            if (a == 192 && (b == 168 || b == 0 && (c is 0 or 2))) return false;
            if (a == 198 && (b is 18 or 19 || b == 51 && c == 100)) return false;
            return !(a == 203 && b == 0 && c == 113);
        }
        if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (address.IsIPv6LinkLocal || address.IsIPv6Multicast || address.IsIPv6SiteLocal) return false;
            if ((bytes[0] & 0xfe) == 0xfc) return false;
            if (bytes[0] == 0x20 && bytes[1] == 0x01 && bytes[2] == 0x0d && bytes[3] == 0xb8) return false;
            return true;
        }
        return false;
    }

    public static bool HostAllowed(string host, string[] patterns) =>
        patterns.Length == 0 || patterns.Any(pattern =>
            pattern.StartsWith("*.")
                ? host.EndsWith(pattern[1..], StringComparison.Ordinal) && host.Length > pattern.Length - 1
                : host.Equals(pattern, StringComparison.Ordinal));
}

public sealed record DownloadResult(int Status, Dictionary<string, string[]> Headers, byte[] Body, string SourceUrl);

public sealed class DownloaderService
{
    private readonly DownloaderConfig config;

    public DownloaderService(DownloaderConfig config) => this.config = config;
    public DownloaderConfig Config => config;

    private static Dictionary<string, string[]> CopyHeaders(HttpResponseMessage response)
    {
        var output = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        foreach (var header in response.Headers) output[header.Key] = header.Value.ToArray();
        foreach (var header in response.Content.Headers) output[header.Key] = header.Value.ToArray();
        return output;
    }

    private HttpClient CreateClient(IPAddress selected)
    {
        var handler = new SocketsHttpHandler
        {
            AllowAutoRedirect = false,
            AutomaticDecompression = DecompressionMethods.None,
            ConnectTimeout = config.Timeout,
            ConnectCallback = async (context, cancellationToken) =>
            {
                var addresses = await Dns.GetHostAddressesAsync(context.DnsEndPoint.Host, cancellationToken);
                if (addresses.Length == 0 || addresses.Any(address => !TargetPolicy.IsPublic(address)))
                    throw new DownloaderException("TARGET_ADDRESS_BLOCKED", "The connection destination became private or reserved.", 403);
                var pinned = addresses.FirstOrDefault(address => address.Equals(selected));
                if (pinned is null)
                    throw new DownloaderException("TARGET_DNS_CHANGED", "The target DNS result changed before connection.", 403);
                var socket = new Socket(pinned.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
                try
                {
                    await socket.ConnectAsync(new IPEndPoint(pinned, context.DnsEndPoint.Port), cancellationToken);
                    return new NetworkStream(socket, ownsSocket: true);
                }
                catch
                {
                    socket.Dispose();
                    throw;
                }
            },
        };
        return new HttpClient(handler) { Timeout = config.Timeout };
    }

    public async Task<DownloadResult> DownloadAsync(
        string input,
        string? ifNoneMatch,
        string? ifModifiedSince,
        CancellationToken cancellationToken)
    {
        var current = input;
        for (var redirects = 0; redirects <= config.MaxRedirects; redirects++)
        {
            var resolved = await TargetPolicy.ValidateAsync(current, config, cancellationToken);
            using var client = CreateClient(resolved.Addresses[0]);
            using var request = new HttpRequestMessage(HttpMethod.Get, resolved.Uri);
            request.Headers.Accept.ParseAdd("application/json, application/yaml, text/yaml, text/plain, */*;q=0.5");
            request.Headers.TryAddWithoutValidation("Accept-Encoding", "identity");
            request.Headers.UserAgent.ParseAdd("OpenDoc-Spec-Downloader/0.1");
            if (!string.IsNullOrWhiteSpace(ifNoneMatch)) request.Headers.TryAddWithoutValidation("If-None-Match", ifNoneMatch);
            if (!string.IsNullOrWhiteSpace(ifModifiedSince)) request.Headers.TryAddWithoutValidation("If-Modified-Since", ifModifiedSince);
            HttpResponseMessage response;
            try
            {
                response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            }
            catch (DownloaderException)
            {
                throw;
            }
            catch (OperationCanceledException error) when (!cancellationToken.IsCancellationRequested)
            {
                throw new DownloaderException("REMOTE_TIMEOUT", "Remote request timed out.", 504, error);
            }
            catch (Exception error)
            {
                throw new DownloaderException("REMOTE_CONNECTION_FAILED", "The remote server could not be reached.", 502, error);
            }
            using (response)
            {
                var status = (int)response.StatusCode;
                if (status is >= 300 and <= 399 && response.Headers.Location is not null)
                {
                    if (redirects == config.MaxRedirects)
                        throw new DownloaderException("REMOTE_REDIRECT_LIMIT", "Remote redirect limit exceeded.", 502);
                    current = new Uri(resolved.Uri, response.Headers.Location).AbsoluteUri;
                    continue;
                }
                if (status == 304) return new DownloadResult(status, CopyHeaders(response), [], resolved.Uri.AbsoluteUri);
                if (status is < 200 or >= 300)
                    throw new DownloaderException("REMOTE_HTTP_STATUS", $"Remote server returned HTTP {status}.", 502);
                if (response.Content.Headers.ContentLength > config.MaxBytes)
                    throw new DownloaderException("REMOTE_FILE_TOO_LARGE", "Remote specification exceeds OPENDOC_MAX_BYTES.", 413);
                await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
                using var memory = new MemoryStream();
                var buffer = new byte[81920];
                while (true)
                {
                    var read = await stream.ReadAsync(buffer, cancellationToken);
                    if (read == 0) break;
                    if (memory.Length + read > config.MaxBytes)
                        throw new DownloaderException("REMOTE_FILE_TOO_LARGE", "Remote specification exceeds OPENDOC_MAX_BYTES.", 413);
                    memory.Write(buffer, 0, read);
                }
                return new DownloadResult(status, CopyHeaders(response), memory.ToArray(), resolved.Uri.AbsoluteUri);
            }
        }
        throw new DownloaderException("REMOTE_REDIRECT_LIMIT", "Remote redirect limit exceeded.", 502);
    }
}

public sealed class MinuteRateLimiter
{
    private readonly ConcurrentDictionary<string, (long Minute, int Count)> buckets = new();

    public bool Allow(string key, int limit)
    {
        var minute = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 60;
        var bucket = buckets.AddOrUpdate(key, _ => (minute, 1), (_, current) => current.Minute == minute ? (minute, current.Count + 1) : (minute, 1));
        return bucket.Count <= limit;
    }
}

public sealed class RawDownloadResult(int status, byte[] body) : IResult
{
    public async Task ExecuteAsync(HttpContext context)
    {
        context.Response.StatusCode = status;
        context.Response.ContentLength = body.Length;
        if (body.Length > 0) await context.Response.Body.WriteAsync(body, context.RequestAborted);
    }
}

public static class EndpointExtensions
{
    public static IEndpointRouteBuilder MapOpenDocSpecDownloader(this IEndpointRouteBuilder endpoints, DownloaderConfig config)
    {
        var service = new DownloaderService(config);
        var limiter = new MinuteRateLimiter();

        endpoints.MapGet("/health", () => Results.Json(new { status = "ok" }));
        endpoints.MapMethods("/download", ["OPTIONS"], (HttpContext context) =>
        {
            if (!ApplyCors(context, config)) return Error("ORIGIN_NOT_ALLOWED", "Browser origin is not allowed.", 403);
            return Results.NoContent();
        });
        endpoints.MapGet("/download", async (HttpContext context, string? spec_url) =>
        {
            try
            {
                if (!ApplyCors(context, config)) return Error("ORIGIN_NOT_ALLOWED", "Browser origin is not allowed.", 403);
                var client = context.Request.Headers["X-Forwarded-For"].FirstOrDefault()?.Split(',')[0].Trim()
                    ?? context.Connection.RemoteIpAddress?.ToString()
                    ?? "unknown";
                if (!limiter.Allow(client, config.RateLimit)) return Error("RATE_LIMITED", "Downloader rate limit exceeded.", 429);
                if (string.IsNullOrWhiteSpace(spec_url)) return Error("MISSING_TARGET_URL", "Missing spec_url query parameter.", 400);
                var result = await service.DownloadAsync(
                    spec_url,
                    context.Request.Headers.IfNoneMatch,
                    context.Request.Headers.IfModifiedSince,
                    context.RequestAborted);
                foreach (var name in new[] { "Content-Type", "ETag", "Last-Modified" })
                    if (result.Headers.TryGetValue(name, out var values)) context.Response.Headers[name] = values;
                context.Response.Headers["X-OpenDoc-Final-URL"] = result.SourceUrl;
                context.Response.Headers.CacheControl = "no-store";
                context.Response.Headers["X-Content-Type-Options"] = "nosniff";
                return new RawDownloadResult(result.Status, result.Body);
            }
            catch (DownloaderException error)
            {
                return Error(error.Code, error.Message, error.Status);
            }
            catch
            {
                return Error("DOWNLOADER_ERROR", "Specification download failed.", 502);
            }
        });
        return endpoints;
    }

    private static bool ApplyCors(HttpContext context, DownloaderConfig config)
    {
        var origin = context.Request.Headers.Origin.FirstOrDefault();
        if (string.IsNullOrEmpty(origin)) return true;
        if (!config.AllowedOrigins.Contains(origin)) return false;
        context.Response.Headers.AccessControlAllowOrigin = origin;
        context.Response.Headers.Vary = "Origin";
        context.Response.Headers.AccessControlAllowMethods = "GET, OPTIONS";
        context.Response.Headers.AccessControlAllowHeaders = "Content-Type, If-None-Match, If-Modified-Since";
        context.Response.Headers.AccessControlExposeHeaders = "ETag, Last-Modified, Content-Length, Content-Type, X-OpenDoc-Final-URL";
        return true;
    }

    private static IResult Error(string code, string message, int status) =>
        Results.Json(new { error = new { code, message } }, statusCode: status);
}
