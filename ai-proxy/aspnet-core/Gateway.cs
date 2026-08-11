using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace OpenDoc.AiGateway;

public sealed record GatewayConfig(
    string Token,
    bool DevMode,
    HashSet<string> Origins,
    string Provider,
    string Model,
    string BaseUrl,
    string ApiKey,
    bool AllowClientModel,
    HashSet<string> AllowedModels,
    int RateLimit,
    int MaxConcurrent,
    int MaxMessages,
    int MaxMessageChars,
    int MaxContextChars,
    int MaxOutputTokens,
    TimeSpan Timeout,
    int MaxBodyBytes,
    string SiteUrl,
    string AppName)
{
    public static GatewayConfig FromEnvironment()
    {
        var model = Env("AI_MODEL", "").Trim();
        if (model.Length == 0) throw new InvalidOperationException("AI_MODEL is required.");
        var provider = Env("AI_PROVIDER", "openai");
        if (provider is not ("openai" or "openrouter" or "ollama" or "custom"))
            throw new InvalidOperationException("Framework gateway examples require an OpenAI-compatible AI_PROVIDER.");
        var allow = Env("AI_GATEWAY_ALLOW_CLIENT_MODEL", "false") == "true";
        var models = (allow ? Csv(Env("AI_GATEWAY_ALLOWED_MODELS", "")) : [model]).ToHashSet(StringComparer.Ordinal);
        if (models.Any(value => value.Contains('*')))
            throw new InvalidOperationException("AI_GATEWAY_ALLOWED_MODELS accepts exact model IDs only.");
        if (models.Count == 0 || !models.Contains(model))
            throw new InvalidOperationException("AI_GATEWAY_ALLOWED_MODELS must be non-empty and include AI_MODEL.");
        var config = new GatewayConfig(
            Env("AI_GATEWAY_TOKEN", ""),
            Env("AI_GATEWAY_DEV_MODE", "false") == "true",
            Csv(First(Env("AI_GATEWAY_ORIGINS", ""), Env("AI_GATEWAY_ORIGIN", ""), "http://localhost:3000")).ToHashSet(StringComparer.Ordinal),
            provider, model, Env("AI_BASE_URL", "https://api.openai.com/v1").TrimEnd('/'),
            Env("AI_API_KEY", ""), allow, models,
            Positive("AI_GATEWAY_RATE_LIMIT", 30), Positive("AI_GATEWAY_MAX_CONCURRENT", 4),
            Positive("AI_GATEWAY_MAX_MESSAGES", 24), Positive("AI_GATEWAY_MAX_MESSAGE_CHARS", 40_000),
            Positive("AI_GATEWAY_MAX_CONTEXT_CHARS", 250_000), Positive("AI_GATEWAY_MAX_OUTPUT_TOKENS", 2_048),
            TimeSpan.FromMilliseconds(Positive("AI_GATEWAY_UPSTREAM_TIMEOUT_MS", 60_000)),
            Positive("AI_GATEWAY_MAX_BODY_BYTES", 1_048_576), Env("AI_SITE_URL", ""), Env("AI_APP_NAME", "OpenDoc UI"));
        if (config.Token.Length == 0 && !config.DevMode)
            throw new InvalidOperationException("AI_GATEWAY_TOKEN is required unless AI_GATEWAY_DEV_MODE=true.");
        return config;
    }

    private static string Env(string name, string fallback) => string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(name)) ? fallback : Environment.GetEnvironmentVariable(name)!;
    private static string[] Csv(string value) => value.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
    private static string First(params string[] values) => values.First(value => value.Length > 0);
    private static int Positive(string name, int fallback) => int.TryParse(Env(name, ""), out var value) && value > 0 ? value : fallback;
}

public sealed class GatewayLimits
{
    private readonly ConcurrentDictionary<string, (long Minute, int Count)> buckets = new();
    private int active;

    public int TakeRateSlot(string key, int limit)
    {
        var minute = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 60;
        var bucket = buckets.AddOrUpdate(key, _ => (minute, 1), (_, current) => current.Minute == minute ? (minute, current.Count + 1) : (minute, 1));
        return bucket.Count <= limit ? limit - bucket.Count : -1;
    }

    public bool Acquire(int limit)
    {
        var value = Interlocked.Increment(ref active);
        if (value <= limit) return true;
        Interlocked.Decrement(ref active);
        return false;
    }

    public void Release() => InterlockedExtensions.DecrementFloorZero(ref active);
}

internal static class InterlockedExtensions
{
    public static void DecrementFloorZero(ref int value)
    {
        while (true)
        {
            var current = Volatile.Read(ref value);
            if (current <= 0 || Interlocked.CompareExchange(ref value, current - 1, current) == current) return;
        }
    }
}

public static class GatewayEndpoints
{
    public static IEndpointRouteBuilder MapOpenDocAiGateway(this IEndpointRouteBuilder endpoints, GatewayConfig config)
    {
        var limits = new GatewayLimits();
        var client = new HttpClient { Timeout = config.Timeout };

        endpoints.MapGet("/health", () => Results.Json(new {
            ok = true, authenticated = config.Token.Length > 0, provider = config.Provider,
            model = config.Model, clientModelSelection = config.AllowClientModel,
        }));

        endpoints.MapPost("/api/ai/models", (HttpContext context) =>
        {
            var guard = Guard(context, config, limits);
            if (guard.Failure is not null) return guard.Failure;
            try
            {
                var models = config.AllowedModels.Select(model => new {
                    id = model, label = $"{model} · Gateway allowed",
                    tier = config.Provider == "ollama" ? "local" : model.EndsWith(":free") ? "free" : "premium",
                });
                return Results.Json(new {
                    models,
                    gateway = new {
                        clientModelSelection = config.AllowClientModel,
                        provider = config.Provider, model = config.Model,
                        models = config.AllowClientModel ? config.AllowedModels : null,
                    },
                });
            }
            finally { limits.Release(); }
        });

        endpoints.MapPost("/api/ai/chat", async (HttpContext context) =>
        {
            var guard = Guard(context, config, limits);
            if (guard.Failure is not null) return guard.Failure;
            try
            {
                if (context.Request.ContentLength > config.MaxBodyBytes)
                    return Error("AI gateway request body is too large.", 413);
                using var memory = new MemoryStream();
                var buffer = new byte[81920];
                while (true)
                {
                    var read = await context.Request.Body.ReadAsync(buffer, context.RequestAborted);
                    if (read == 0) break;
                    if (memory.Length + read > config.MaxBodyBytes) return Error("AI gateway request body is too large.", 413);
                    memory.Write(buffer, 0, read);
                }
                JsonDocument document;
                try { document = JsonDocument.Parse(memory.ToArray()); }
                catch (JsonException) { return Error("A valid JSON request body is required.", 400); }
                using (document)
                {
                    var root = document.RootElement;
                    if (!root.TryGetProperty("messages", out var messages) || !ValidMessages(messages, config))
                        return Error("The messages array exceeds gateway limits or is invalid.", 400);
                    if (root.TryGetProperty("provider", out var providerElement)
                        && providerElement.ValueKind == JsonValueKind.String
                        && providerElement.GetString() is { Length: > 0 } provider
                        && provider != config.Provider)
                        return Error($"Provider is fixed to '{config.Provider}' by the gateway.", 400);
                    var model = root.TryGetProperty("model", out var modelElement)
                        && modelElement.ValueKind == JsonValueKind.String
                        && !string.IsNullOrWhiteSpace(modelElement.GetString())
                            ? modelElement.GetString()!.Trim()
                            : config.Model;
                    if (!config.AllowedModels.Contains(model)) return Error($"Model '{model}' is not allowed by this gateway.", 400);
                    if (config.ApiKey.Length == 0 && config.Provider != "ollama")
                        return Error("AI_API_KEY is not configured on the gateway.", 503);
                    var temperature = root.TryGetProperty("temperature", out var temperatureElement)
                        && temperatureElement.TryGetDouble(out var requestedTemperature)
                            ? Math.Clamp(requestedTemperature, 0, 2)
                            : 0.2;
                    var payload = JsonSerializer.SerializeToUtf8Bytes(new {
                        model, messages, temperature, max_tokens = config.MaxOutputTokens, stream = true,
                    });
                    var baseUrl = config.BaseUrl.EndsWith("/chat/completions") ? config.BaseUrl : config.BaseUrl + "/chat/completions";
                    using var request = new HttpRequestMessage(HttpMethod.Post, baseUrl) {
                        Content = new ByteArrayContent(payload),
                    };
                    request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
                    if (config.ApiKey.Length > 0) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.ApiKey);
                    if (config.SiteUrl.Length > 0) request.Headers.TryAddWithoutValidation("HTTP-Referer", config.SiteUrl);
                    if (config.AppName.Length > 0) request.Headers.TryAddWithoutValidation("X-Title", config.AppName);
                    using var upstream = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, context.RequestAborted);
                    if (!upstream.IsSuccessStatusCode)
                    {
                        var raw = (await upstream.Content.ReadAsStringAsync(context.RequestAborted));
                        if (raw.Length > 16_384) raw = raw[..16_384];
                        return Error(UpstreamMessage(raw, (int)upstream.StatusCode), 502, new {
                            code = "upstream_error", status = (int)upstream.StatusCode,
                            provider = config.Provider, model,
                        });
                    }
                    context.Response.StatusCode = 200;
                    context.Response.ContentType = upstream.Content.Headers.ContentType?.ToString() ?? "text/event-stream; charset=utf-8";
                    context.Response.Headers.CacheControl = "no-cache, no-transform";
                    context.Response.Headers["X-Accel-Buffering"] = "no";
                    await using var stream = await upstream.Content.ReadAsStreamAsync(context.RequestAborted);
                    await stream.CopyToAsync(context.Response.Body, context.RequestAborted);
                    return Results.Empty;
                }
            }
            catch (OperationCanceledException)
            {
                return context.Response.HasStarted ? Results.Empty : Error("AI upstream timed out or the request was cancelled.", 502);
            }
            catch
            {
                return context.Response.HasStarted ? Results.Empty : Error("AI gateway request failed.", 502);
            }
            finally { limits.Release(); }
        });
        return endpoints;
    }

    public static async Task CorsMiddleware(HttpContext context, GatewayConfig config, RequestDelegate next)
    {
        var origin = context.Request.Headers.Origin.FirstOrDefault();
        if (!string.IsNullOrEmpty(origin) && !config.Origins.Contains(origin))
        {
            await Error("Origin is not allowed by this AI gateway.", 403).ExecuteAsync(context);
            return;
        }
        if (!string.IsNullOrEmpty(origin)) context.Response.Headers.AccessControlAllowOrigin = origin;
        context.Response.Headers.Vary = "Origin";
        context.Response.Headers.AccessControlAllowHeaders = "Content-Type, Authorization";
        context.Response.Headers.AccessControlAllowMethods = "GET, POST, OPTIONS";
        context.Response.Headers.AccessControlExposeHeaders = "X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After";
        if (context.Request.Method == HttpMethods.Options) { context.Response.StatusCode = 204; return; }
        await next(context);
    }

    private static (IResult? Failure, int Remaining) Guard(HttpContext context, GatewayConfig config, GatewayLimits limits)
    {
        if (config.Token.Length > 0 && context.Request.Headers.Authorization != "Bearer " + config.Token)
            return (Error("Invalid AI gateway token.", 401), -1);
        var key = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var remaining = limits.TakeRateSlot(key, config.RateLimit);
        if (remaining < 0) return (Error("AI gateway rate limit exceeded.", 429), -1);
        if (!limits.Acquire(config.MaxConcurrent)) return (Error("AI gateway is busy.", 429), -1);
        context.Response.Headers["X-RateLimit-Limit"] = config.RateLimit.ToString();
        context.Response.Headers["X-RateLimit-Remaining"] = remaining.ToString();
        return (null, remaining);
    }

    private static bool ValidMessages(JsonElement messages, GatewayConfig config)
    {
        if (messages.ValueKind != JsonValueKind.Array || messages.GetArrayLength() is < 1 || messages.GetArrayLength() > config.MaxMessages) return false;
        var total = 0;
        foreach (var message in messages.EnumerateArray())
        {
            if (!message.TryGetProperty("role", out var role)
                || role.ValueKind != JsonValueKind.String
                || role.GetString() is not ("system" or "user" or "assistant")
                || !message.TryGetProperty("content", out var content)
                || content.ValueKind != JsonValueKind.String) return false;
            var text = content.GetString() ?? "";
            if (text.Length > config.MaxMessageChars) return false;
            total += text.Length;
            if (total > config.MaxContextChars) return false;
        }
        return true;
    }

    private static string UpstreamMessage(string raw, int status)
    {
        try
        {
            using var document = JsonDocument.Parse(raw);
            var root = document.RootElement;
            if (root.TryGetProperty("error", out var error)
                && error.TryGetProperty("message", out var errorMessage)) return errorMessage.GetString() ?? raw;
            if (root.TryGetProperty("message", out var message)) return message.GetString() ?? raw;
        }
        catch (JsonException) { }
        return string.IsNullOrWhiteSpace(raw) ? $"Upstream returned HTTP {status}." : raw;
    }

    private static IResult Error(string message, int status, object? details = null)
    {
        var error = new Dictionary<string, object?> { ["message"] = message };
        if (details is not null)
        {
            var element = JsonSerializer.SerializeToElement(details);
            foreach (var property in element.EnumerateObject()) error[property.Name] = property.Value.Clone();
        }
        return Results.Json(new Dictionary<string, object?> { ["error"] = error }, statusCode: status);
    }
}
