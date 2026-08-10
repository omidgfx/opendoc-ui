import express from 'express';
import {AIStreamError, fetchProviderModels, streamAIResponse} from '../src/utils/aiProviders';
import type {AIRequestMessage, AISettings} from '../src/types';
import {allowedModelCatalog, createGatewayModelPolicy, resolveGatewaySelection} from './ai-gateway-policy';
const app = express();
const port = Number(process.env.AI_GATEWAY_PORT || 8787);
const isDevelopment = process.env.NODE_ENV === 'development' || process.env.AI_GATEWAY_DEV_MODE === 'true';
const gatewayToken = process.env.AI_GATEWAY_TOKEN || '';
const allowedOrigins = (process.env.AI_GATEWAY_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
const modelPolicy = createGatewayModelPolicy({
    provider: process.env.AI_PROVIDER || 'openrouter',
    configuredModel: process.env.AI_MODEL || '',
    allowClientModel: process.env.AI_GATEWAY_ALLOW_CLIENT_MODEL === 'true',
    allowedModels: process.env.AI_GATEWAY_ALLOWED_MODELS,
});
const apiKey = process.env.AI_API_KEY || '';
const baseUrl = process.env.AI_BASE_URL || '';
const maxMessages = Math.max(1, Number(process.env.AI_GATEWAY_MAX_MESSAGES || 24));
const maxMessageChars = Math.max(1000, Number(process.env.AI_GATEWAY_MAX_MESSAGE_CHARS || 40000));
const maxContextChars = Math.max(10000, Number(process.env.AI_GATEWAY_MAX_CONTEXT_CHARS || 250000));
const maxOutputTokens = Math.max(256, Number(process.env.AI_GATEWAY_MAX_OUTPUT_TOKENS || 2048));
const upstreamTimeoutMs = Math.max(5000, Number(process.env.AI_GATEWAY_UPSTREAM_TIMEOUT_MS || 60000));
const maxConcurrent = Math.max(1, Number(process.env.AI_GATEWAY_MAX_CONCURRENT || 4));
const rateWindowMs = 60000;
const maxRequestsPerWindow = Math.max(1, Number(process.env.AI_GATEWAY_RATE_LIMIT || 30));
const requestBuckets = new Map<string, number[]>();
let activeRequests = 0;
if (!gatewayToken && !isDevelopment) {
    throw new Error(
        'AI_GATEWAY_TOKEN is required outside development. Set AI_GATEWAY_DEV_MODE=true only for a trusted local gateway.',
    );
}
const originAllowed = (origin: string | undefined): boolean =>
    !origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*');
app.disable('x-powered-by');
app.set('trust proxy', false);
app.use((req, res, next) => {
    const origin = req.header('origin');
    if (origin && !originAllowed(origin))
        return res.status(403).json({error: {message: 'Origin is not allowed by this AI gateway.'}});
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
    if (requestBuckets.size > 10000) {
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
const releaseRequest = () => {
    activeRequests = Math.max(0, activeRequests - 1);
};
const withRequestGuard = (req: express.Request, res: express.Response): boolean =>
    authorize(req, res) && takeRateLimitSlot(req, res) && acquireConcurrency(res);
const validateMessages = (messages: unknown): messages is AIRequestMessage[] => {
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > maxMessages) return false;
    let total = 0;
    return messages.every(message => {
        if (!message || typeof message !== 'object') return false;
        const item = message as AIRequestMessage;
        if (
            !['system', 'user', 'assistant'].includes(item.role) ||
            typeof item.content !== 'string' ||
            item.content.length > maxMessageChars
        )
            return false;
        total += item.content.length;
        return total <= maxContextChars;
    });
};
const resolveSelection = (body: unknown) => resolveGatewaySelection(modelPolicy, body);
const baseSettings = (model: string, temperature: unknown): AISettings => ({
    transport: 'direct',
    gatewayUrl: '',
    gatewayToken: '',
    provider: modelPolicy.provider,
    model,
    apiKey,
    baseUrl,
    temperature:
        typeof temperature === 'number' && Number.isFinite(temperature) ? Math.max(0, Math.min(2, temperature)) : 0.2,
    maxTokens: maxOutputTokens,
    skillPacks: ['openapi', 'rest-debugging', 'security', 'api-testing'],
    customInstructions: '',
});
app.get('/health', (_req, res) =>
    res.json({
        ok: true,
        authenticated: Boolean(gatewayToken),
        provider: modelPolicy.provider,
        model: modelPolicy.configuredModel,
        clientModelSelection: modelPolicy.clientModelSelection,
    }),
);
app.post('/api/ai/models', async (req, res) => {
    if (!withRequestGuard(req, res)) return;
    try {
        const selection = resolveSelection(req.body);
        if ('error' in selection) return res.status(400).json({error: {message: selection.error}});
        if (!modelPolicy.clientModelSelection) {
            return res.json({
                models: allowedModelCatalog(modelPolicy, []),
                gateway: {
                    clientModelSelection: false,
                    provider: modelPolicy.provider,
                    model: modelPolicy.configuredModel,
                },
            });
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs);
        try {
            const discovered = await fetchProviderModels(baseSettings(selection.model, 0.2), {
                signal: controller.signal,
            });
            return res.json({
                models: allowedModelCatalog(modelPolicy, discovered),
                gateway: {
                    clientModelSelection: true,
                    provider: modelPolicy.provider,
                    model: modelPolicy.configuredModel,
                    models: Array.from(modelPolicy.allowedModels),
                },
            });
        } finally {
            clearTimeout(timeout);
        }
    } catch (error) {
        return res
            .status(502)
            .json({error: {message: error instanceof Error ? error.message : 'Unable to fetch provider models.'}});
    } finally {
        releaseRequest();
    }
});
app.post('/api/ai/chat', async (req, res) => {
    if (!withRequestGuard(req, res)) return;
    const messages = req.body?.messages as AIRequestMessage[] | undefined;
    if (!validateMessages(messages)) {
        releaseRequest();
        return res.status(400).json({
            error: {
                message: `A valid messages array is required (1-${maxMessages} messages, ${maxMessageChars} characters each, ${maxContextChars} total).`,
            },
        });
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
        return res
            .status(503)
            .json({error: {message: 'AI_API_KEY is not configured on the gateway for this provider.'}});
    }
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), upstreamTimeoutMs);
    req.on('aborted', () => abortController.abort());
    res.on('close', () => {
        if (!res.writableEnded) abortController.abort();
    });
    try {
        await streamAIResponse(baseSettings(selection.model, req.body?.temperature), messages, {
            signal: abortController.signal,
            onToken: token => {
                if (!res.writableEnded)
                    res.write(`data: ${JSON.stringify({choices: [{delta: {content: token}}]})}\n\n`);
            },
        });
        if (!res.writableEnded) {
            res.write('data: [DONE]\n\n');
            res.end();
        }
    } catch (error) {
        if (!res.writableEnded) {
            const errorPayload = abortController.signal.aborted
                ? {
                      message: `AI upstream timed out or was cancelled after ${upstreamTimeoutMs} ms.`,
                      code: 'upstream_timeout',
                  }
                : error instanceof AIStreamError
                  ? {
                        message: error.message,
                        code: error.code,
                        status: error.status,
                        provider: error.provider,
                        model: error.model,
                    }
                  : {message: error instanceof Error ? error.message : 'AI gateway request failed.'};
            res.write(`data: ${JSON.stringify({error: errorPayload})}\n\n`);
            res.end();
        }
    } finally {
        clearTimeout(timeout);
        releaseRequest();
    }
});
app.listen(port, '0.0.0.0', () => {
    console.log(`OpenDoc UI AI gateway listening on http://0.0.0.0:${port}`);
    console.log(
        `Provider: ${modelPolicy.provider} · Model: ${modelPolicy.clientModelSelection ? `${modelPolicy.allowedModels.size} allowlisted` : modelPolicy.configuredModel}`,
    );
    console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
    console.log(
        `Limits: ${maxRequestsPerWindow} req/min/IP · ${maxConcurrent} concurrent · ${upstreamTimeoutMs} ms upstream timeout`,
    );
});
export default app;
