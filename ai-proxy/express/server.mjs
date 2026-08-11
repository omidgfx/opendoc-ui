import express from 'express';
import {Readable} from 'node:stream';
import {pathToFileURL} from 'node:url';

const csv = value =>
    String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
const positiveInt = (value, fallback) => {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const configFromEnv = (env = process.env) => {
    const model = String(env.AI_MODEL || '').trim();
    if (!model) throw new Error('AI_MODEL is required.');
    const provider = env.AI_PROVIDER || 'openai';
    if (!['openai', 'openrouter', 'ollama', 'custom'].includes(provider))
        throw new Error('Framework gateway examples require an OpenAI-compatible AI_PROVIDER.');
    const allowClientModel = env.AI_GATEWAY_ALLOW_CLIENT_MODEL === 'true';
    const allowedModels = new Set(allowClientModel ? csv(env.AI_GATEWAY_ALLOWED_MODELS) : [model]);
    if (allowClientModel && allowedModels.size === 0)
        throw new Error('AI_GATEWAY_ALLOWED_MODELS is required when client model selection is enabled.');
    if ([...allowedModels].some(value => value.includes('*')))
        throw new Error('AI_GATEWAY_ALLOWED_MODELS accepts exact model IDs only.');
    if (!allowedModels.has(model)) throw new Error('AI_GATEWAY_ALLOWED_MODELS must include AI_MODEL.');
    return {
        bind: env.AI_GATEWAY_BIND || '0.0.0.0',
        port: positiveInt(env.PORT, 8787),
        token: env.AI_GATEWAY_TOKEN || '',
        devMode: env.AI_GATEWAY_DEV_MODE === 'true',
        origins: csv(env.AI_GATEWAY_ORIGINS || env.AI_GATEWAY_ORIGIN || 'http://localhost:3000'),
        provider,
        model,
        baseUrl: String(env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
        apiKey: env.AI_API_KEY || '',
        allowClientModel,
        allowedModels,
        rateLimit: positiveInt(env.AI_GATEWAY_RATE_LIMIT, 30),
        maxConcurrent: positiveInt(env.AI_GATEWAY_MAX_CONCURRENT, 4),
        maxMessages: positiveInt(env.AI_GATEWAY_MAX_MESSAGES, 24),
        maxMessageChars: positiveInt(env.AI_GATEWAY_MAX_MESSAGE_CHARS, 40_000),
        maxContextChars: positiveInt(env.AI_GATEWAY_MAX_CONTEXT_CHARS, 250_000),
        maxOutputTokens: positiveInt(env.AI_GATEWAY_MAX_OUTPUT_TOKENS, 2_048),
        timeoutMs: positiveInt(env.AI_GATEWAY_UPSTREAM_TIMEOUT_MS, 60_000),
        maxBodyBytes: positiveInt(env.AI_GATEWAY_MAX_BODY_BYTES, 1_048_576),
        siteUrl: env.AI_SITE_URL || '',
        appName: env.AI_APP_NAME || 'OpenDoc UI',
    };
};

const chatUrl = baseUrl => (baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`);
const tier = (provider, model) => (provider === 'ollama' ? 'local' : model.endsWith(':free') ? 'free' : 'premium');
const errorMessage = async response => {
    const raw = (await response.text()).slice(0, 16_384);
    try {
        const payload = JSON.parse(raw);
        return payload?.error?.message || payload?.message || `Upstream returned HTTP ${response.status}.`;
    } catch {
        return raw || `Upstream returned HTTP ${response.status}.`;
    }
};

export const createGatewayApp = (config = configFromEnv()) => {
    if (!config.token && !config.devMode)
        throw new Error('AI_GATEWAY_TOKEN is required unless AI_GATEWAY_DEV_MODE=true.');
    const app = express();
    const buckets = new Map();
    let active = 0;
    app.disable('x-powered-by');
    app.set('trust proxy', false);
    app.use((request, response, next) => {
        const origin = request.header('origin');
        if (origin && !config.origins.includes(origin))
            return response.status(403).json({error: {message: 'Origin is not allowed by this AI gateway.'}});
        if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After');
        if (request.method === 'OPTIONS') return response.sendStatus(204);
        next();
    });
    app.use(express.json({limit: config.maxBodyBytes, strict: true}));

    const guard = (request, response) => {
        if (config.token && request.header('authorization') !== `Bearer ${config.token}`) {
            response.status(401).json({error: {message: 'Invalid AI gateway token.'}});
            return false;
        }
        const now = Date.now();
        const key = request.socket.remoteAddress || 'unknown';
        const recent = (buckets.get(key) || []).filter(timestamp => now - timestamp < 60_000);
        if (recent.length >= config.rateLimit) {
            response.setHeader('Retry-After', '60');
            response.status(429).json({error: {message: 'AI gateway rate limit exceeded.'}});
            return false;
        }
        recent.push(now);
        buckets.set(key, recent);
        response.setHeader('X-RateLimit-Limit', String(config.rateLimit));
        response.setHeader('X-RateLimit-Remaining', String(Math.max(0, config.rateLimit - recent.length)));
        if (active >= config.maxConcurrent) {
            response.setHeader('Retry-After', '2');
            response.status(429).json({error: {message: 'AI gateway is busy.'}});
            return false;
        }
        active += 1;
        return true;
    };
    const release = () => {
        active = Math.max(0, active - 1);
    };
    const selection = body => {
        if (body?.provider && body.provider !== config.provider)
            return {error: `Provider is fixed to '${config.provider}' by the gateway.`};
        const model = typeof body?.model === 'string' && body.model.trim() ? body.model.trim() : config.model;
        if (!config.allowedModels.has(model)) return {error: `Model '${model}' is not allowed by this gateway.`};
        return {model};
    };
    const validMessages = messages => {
        if (!Array.isArray(messages) || messages.length === 0 || messages.length > config.maxMessages) return false;
        let total = 0;
        return messages.every(message => {
            if (
                !message ||
                !['system', 'user', 'assistant'].includes(message.role) ||
                typeof message.content !== 'string'
            )
                return false;
            if (message.content.length > config.maxMessageChars) return false;
            total += message.content.length;
            return total <= config.maxContextChars;
        });
    };

    app.get('/health', (_request, response) =>
        response.json({
            ok: true,
            authenticated: Boolean(config.token),
            provider: config.provider,
            model: config.model,
            clientModelSelection: config.allowClientModel,
        }),
    );
    app.post('/api/ai/models', (request, response) => {
        if (!guard(request, response)) return;
        try {
            response.json({
                models: [...config.allowedModels].map(model => ({
                    id: model,
                    label: `${model} · Gateway allowed`,
                    tier: tier(config.provider, model),
                })),
                gateway: {
                    clientModelSelection: config.allowClientModel,
                    provider: config.provider,
                    model: config.model,
                    ...(config.allowClientModel ? {models: [...config.allowedModels]} : {}),
                },
            });
        } finally {
            release();
        }
    });
    app.post('/api/ai/chat', async (request, response) => {
        if (!guard(request, response)) return;
        let released = false;
        const releaseOnce = () => {
            if (released) return;
            released = true;
            release();
        };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
        request.on('aborted', () => controller.abort());
        response.on('close', releaseOnce);
        try {
            if (!validMessages(request.body?.messages))
                return response
                    .status(400)
                    .json({error: {message: 'The messages array exceeds gateway limits or is invalid.'}});
            const selected = selection(request.body);
            if (selected.error) return response.status(400).json({error: {message: selected.error}});
            if (!config.apiKey && config.provider !== 'ollama')
                return response.status(503).json({error: {message: 'AI_API_KEY is not configured on the gateway.'}});
            const upstream = await fetch(chatUrl(config.baseUrl), {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...(config.apiKey ? {Authorization: `Bearer ${config.apiKey}`} : {}),
                    ...(config.siteUrl ? {'HTTP-Referer': config.siteUrl} : {}),
                    ...(config.appName ? {'X-Title': config.appName} : {}),
                },
                body: JSON.stringify({
                    model: selected.model,
                    messages: request.body.messages,
                    temperature:
                        typeof request.body.temperature === 'number'
                            ? Math.max(0, Math.min(2, request.body.temperature))
                            : 0.2,
                    max_tokens: config.maxOutputTokens,
                    stream: true,
                }),
            });
            if (!upstream.ok)
                return response.status(502).json({
                    error: {
                        message: await errorMessage(upstream),
                        code: 'upstream_error',
                        status: upstream.status,
                        provider: config.provider,
                        model: selected.model,
                    },
                });
            const contentType = upstream.headers.get('content-type') || 'application/json';
            response.status(200);
            response.setHeader(
                'Content-Type',
                contentType.includes('text/event-stream')
                    ? 'text/event-stream; charset=utf-8'
                    : 'application/json; charset=utf-8',
            );
            response.setHeader('Cache-Control', 'no-cache, no-transform');
            response.setHeader('X-Accel-Buffering', 'no');
            response.flushHeaders?.();
            if (!upstream.body) return response.end();
            await new Promise((resolve, reject) => {
                const stream = Readable.fromWeb(upstream.body);
                stream.on('error', reject);
                response.on('error', reject);
                response.on('finish', resolve);
                stream.pipe(response);
            });
        } catch (error) {
            if (!response.headersSent)
                response.status(502).json({
                    error: {
                        message: controller.signal.aborted
                            ? 'AI upstream timed out or the request was cancelled.'
                            : error instanceof Error
                              ? error.message
                              : 'AI gateway request failed.',
                    },
                });
            else if (!response.writableEnded) response.end();
        } finally {
            clearTimeout(timeout);
            releaseOnce();
        }
    });
    return app;
};

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
    const config = configFromEnv();
    createGatewayApp(config).listen(config.port, config.bind, () => {
        console.log(`OpenDoc AI gateway listening on http://${config.bind}:${config.port}`);
    });
}
