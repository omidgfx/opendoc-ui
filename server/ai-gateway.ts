import express from 'express';
import {fetchProviderModels, streamAIResponse} from '../src/utils/aiProviders';
import type {AIProviderId, AIRequestMessage, AISettings} from '../src/types';

const app = express();
const port = Number(process.env.AI_GATEWAY_PORT || 8787);
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.AI_GATEWAY_DEV_MODE === 'true';
const gatewayToken = process.env.AI_GATEWAY_TOKEN || '';
const allowedOrigins = (process.env.AI_GATEWAY_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',').map(value => value.trim()).filter(Boolean);
const configuredProvider = (process.env.AI_PROVIDER || 'openrouter') as AIProviderId;
const configuredModel = process.env.AI_MODEL || '';
const apiKey = process.env.AI_API_KEY || '';
const baseUrl = process.env.AI_BASE_URL || '';
const allowClientModel = process.env.AI_GATEWAY_ALLOW_CLIENT_MODEL === 'true';
const allowedProviders = new Set((process.env.AI_GATEWAY_ALLOWED_PROVIDERS || configuredProvider).split(',').map(value => value.trim()).filter(Boolean));
const allowedModels = new Set((process.env.AI_GATEWAY_ALLOWED_MODELS || configuredModel).split(',').map(value => value.trim()).filter(Boolean));
const maxMessages = Math.max(1, Number(process.env.AI_GATEWAY_MAX_MESSAGES || 24));
const maxMessageChars = Math.max(1_000, Number(process.env.AI_GATEWAY_MAX_MESSAGE_CHARS || 40_000));
const maxContextChars = Math.max(10_000, Number(process.env.AI_GATEWAY_MAX_CONTEXT_CHARS || 250_000));
const maxOutputTokens = Math.max(256, Number(process.env.AI_GATEWAY_MAX_OUTPUT_TOKENS || 2_048));
const upstreamTimeoutMs = Math.max(5_000, Number(process.env.AI_GATEWAY_UPSTREAM_TIMEOUT_MS || 60_000));
const maxConcurrent = Math.max(1, Number(process.env.AI_GATEWAY_MAX_CONCURRENT || 4));
const rateWindowMs = 60_000;
const maxRequestsPerWindow = Math.max(1, Number(process.env.AI_GATEWAY_RATE_LIMIT || 30));
const requestBuckets = new Map<string, number[]>();
let activeRequests = 0;

if (!gatewayToken && !isDevelopment) {
    throw new Error('AI_GATEWAY_TOKEN is required outside development. Set AI_GATEWAY_DEV_MODE=true only for a trusted local gateway.');
}
if (!configuredModel && !allowClientModel) {
    throw new Error('AI_MODEL is required unless AI_GATEWAY_ALLOW_CLIENT_MODEL=true with an explicit allowlist.');
}
if (allowClientModel && allowedModels.size === 0) {
    throw new Error('AI_GATEWAY_ALLOWED_MODELS must contain at least one model when client model selection is enabled.');
}

const originAllowed = (origin: string | undefined): boolean => {
    if (!origin) return true;
    return allowedOrigins.includes(origin) || allowedOrigins.includes('*');
};

app.disable('x-powered-by');
app.set('trust proxy', false);
app.use((req, res, next) => {
    const origin = req.header('origin');
    if (origin && !originAllowed(origin)) return res.status(403).json({error: {message: 'Origin is not allowed by this AI gateway.'}});
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});
app.use(express.json({limit: `${Math.max(128, Number(process.env.AI_GATEWAY_MAX_BODY_MB || 1))}mb`, strict: true}));

const clientAddress = (req: express.Request) => req.socket.remoteAddress || 'unknown';
const authorize = (req: express.Request, res: express.Response): boolean => {
    if (!gatewayToken) return isDevelopment;
    if (req.header('authorization') !== `Bearer ${gatewayToken}`) {
        res.status(401).json({error: {message: 'Invalid AI gateway token.'}});
        return false;
    }
    return true;
};

const takeRateLimitSlot = (req: express.Request, res: express.Response): boolean => {
    const now = Date.now();
    const key = clientAddress(req);
    if (requestBuckets.size > 10_000) {
        for (const [bucketKey, timestamps] of requestBuckets) {
            if (!timestamps.some(timestamp => now - timestamp < rateWindowMs)) requestBuckets.delete(bucketKey);
        }
    }
    const recent = (requestBuckets.get(key) || []).filter(timestamp => now - timestamp < rateWindowMs);
    if (recent.length >= maxRequestsPerWindow) {
        const retryAfter = Math.max(1, Math.ceil((rateWindowMs - (now - recent[0])) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        res.setHeader('X-RateLimit-Limit', String(maxRequestsPerWindow));
        res.setHeader('X-RateLimit-Remaining', '0');
        res.status(429).json({error: {message: 'AI gateway rate limit exceeded. Try again later.'}});
        requestBuckets.set(key, recent);
        return false;
    }
    recent.push(now);
    requestBuckets.set(key, recent);
    res.setHeader('X-RateLimit-Limit', String(maxRequestsPerWindow));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequestsPerWindow - recent.length)));
    return true;
};

const acquireConcurrency = (res: express.Response): boolean => {
    if (activeRequests >= maxConcurrent) {
        res.setHeader('Retry-After', '2');
        res.status(429).json({error: {message: 'AI gateway is busy. Try again shortly.'}});
        return false;
    }
    activeRequests += 1;
    return true;
};

const validateMessages = (messages: unknown): messages is AIRequestMessage[] => {
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > maxMessages) return false;
    let total = 0;
    return messages.every(message => {
        if (!message || typeof message !== 'object') return false;
        const item = message as AIRequestMessage;
        if (!['system', 'user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || item.content.length > maxMessageChars) return false;
        total += item.content.length;
        return total <= maxContextChars;
    });
};

const resolveSelection = (body: any): {provider: AIProviderId; model: string} | {error: string} => {
    const requestedProvider = typeof body?.provider === 'string' ? body.provider : configuredProvider;
    const requestedModel = typeof body?.model === 'string' ? body.model : configuredModel;
    if (!allowClientModel) {
        if (requestedProvider !== configuredProvider || (requestedModel && requestedModel !== configuredModel)) {
            return {error: `This gateway is locked to ${configuredProvider}/${configuredModel}. Enable AI_GATEWAY_ALLOW_CLIENT_MODEL and configure AI_GATEWAY_ALLOWED_MODELS to select models from the UI.`};
        }
        return {provider: configuredProvider, model: configuredModel};
    }
    if (!allowedProviders.has(requestedProvider)) return {error: `Provider '${requestedProvider}' is not allowed by this gateway.`};
    if (!allowedModels.has(requestedModel)) return {error: `Model '${requestedModel}' is not allowed by this gateway.`};
    return {provider: requestedProvider as AIProviderId, model: requestedModel};
};

const baseSettings = (provider: AIProviderId, model: string, temperature: unknown): AISettings => ({
    enabled: true,
    transport: 'direct',
    gatewayUrl: '',
    gatewayToken: '',
    provider,
    model,
    apiKey,
    baseUrl,
    temperature: typeof temperature === 'number' && Number.isFinite(temperature) ? Math.max(0, Math.min(2, temperature)) : 0.2,
    maxTokens: maxOutputTokens,
    skillPacks: ['openapi', 'rest-debugging', 'security', 'api-testing'],
    customInstructions: '',
});

const withRequestGuard = (req: express.Request, res: express.Response): boolean => authorize(req, res) && takeRateLimitSlot(req, res) && acquireConcurrency(res);
const releaseRequest = () => { activeRequests = Math.max(0, activeRequests - 1); };

app.get('/health', (_req, res) => res.json({ok: true, authenticated: Boolean(gatewayToken), provider: allowClientModel ? 'client-selectable' : configuredProvider, model: allowClientModel ? 'allowlisted' : configuredModel || null}));

app.post('/api/ai/models', async (req, res) => {
    if (!withRequestGuard(req, res)) return;
    try {
        const selection = resolveSelection(req.body);
        if ('error' in selection) return res.status(400).json({error: {message: selection.error}});
        if (!allowClientModel) return res.json({models: [{id: selection.model, label: `${selection.model} · Gateway configured`, tier: selection.provider === 'ollama' ? 'local' : 'premium'}], gateway: {clientModelSelection: false, provider: selection.provider, model: selection.model}});
        const settings = baseSettings(selection.provider, selection.model, 0.2);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs);
        try {
            const models = await fetchProviderModels(settings, {signal: controller.signal});
            return res.json({models, gateway: {clientModelSelection: true, providers: Array.from(allowedProviders), models: Array.from(allowedModels)}});
        } finally { clearTimeout(timeout); }
    } catch (error) {
        return res.status(502).json({error: {message: error instanceof Error ? error.message : 'Unable to fetch provider models.'}});
    } finally { releaseRequest(); }
});

app.post('/api/ai/chat', async (req, res) => {
    if (!withRequestGuard(req, res)) return;
    const messages = req.body?.messages as AIRequestMessage[] | undefined;
    if (!validateMessages(messages)) {
        releaseRequest();
        return res.status(400).json({error: {message: `A valid messages array is required (1-${maxMessages} messages, ${maxMessageChars} characters each, ${maxContextChars} total).`}});
    }
    const selection = resolveSelection(req.body);
    if ('error' in selection) {
        releaseRequest();
        return res.status(400).json({error: {message: selection.error}});
    }
    if (!selection.model) {
        releaseRequest();
        return res.status(503).json({error: {message: 'No AI model is configured or allowed on the gateway.'}});
    }
    if (selection.provider !== 'ollama' && !apiKey) {
        releaseRequest();
        return res.status(503).json({error: {message: 'AI_API_KEY is not configured on the gateway for this provider.'}});
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), upstreamTimeoutMs);
    req.on('aborted', () => abortController.abort());
    res.on('close', () => { if (!res.writableEnded) abortController.abort(); });
    try {
        await streamAIResponse(baseSettings(selection.provider, selection.model, req.body?.temperature), messages, {
            signal: abortController.signal,
            onToken: token => { if (!res.writableEnded) res.write(`data: ${JSON.stringify({choices: [{delta: {content: token}}]})}\n\n`); },
        });
        if (!res.writableEnded) { res.write('data: [DONE]\n\n'); res.end(); }
    } catch (error) {
        if (!res.writableEnded) {
            const message = abortController.signal.aborted ? `AI upstream timed out or was cancelled after ${upstreamTimeoutMs} ms.` : error instanceof Error ? error.message : 'AI gateway request failed.';
            res.write(`data: ${JSON.stringify({error: {message}})}\n\n`);
            res.end();
        }
    } finally {
        clearTimeout(timeout);
        releaseRequest();
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`OpenDoc UI gateway listening on http://0.0.0.0:${port}`);
    console.log(`Provider: ${allowClientModel ? 'client-selectable' : configuredProvider} · Model: ${allowClientModel ? `${allowedModels.size} allowlisted` : configuredModel || '(not configured)'}`);
    console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
    console.log(`Limits: ${maxRequestsPerWindow} req/min/IP · ${maxConcurrent} concurrent · ${upstreamTimeoutMs} ms upstream timeout`);
});

export default app;
