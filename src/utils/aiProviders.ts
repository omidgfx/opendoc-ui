import type { AIProviderId, AIProviderPreset, AIRequestMessage, AISettings } from '../types';
export interface GatewayModelPolicyInfo {
    clientModelSelection: boolean;
    provider: AIProviderId;
    model: string;
    models?: string[];
}
export interface AIModelCatalogResult {
    models: AIProviderPreset['models'];
    gateway?: GatewayModelPolicyInfo;
}
export class AIStreamError extends Error {
    readonly status?: number;
    readonly code?: string;
    readonly provider?: string;
    readonly model?: string;
    constructor(message: string, details: {
        status?: number;
        code?: string;
        provider?: string;
        model?: string;
    } = {}) {
        super(message);
        this.name = 'AIStreamError';
        this.status = details.status;
        this.code = details.code;
        this.provider = details.provider;
        this.model = details.model;
    }
}
export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
    {
        id: 'openrouter',
        label: 'OpenRouter',
        description: 'Hosted model gateway with free-tier and premium models.',
        defaultBaseUrl: 'https://openrouter.ai/api/v1',
        requiresApiKey: true,
        native: false,
        models: [
            { id: 'openrouter/free', label: 'OpenRouter Free Models Router · Free', tier: 'free' },
            { id: 'openai/gpt-oss-20b:free', label: 'OpenAI gpt-oss-20b · Free', tier: 'free' },
            { id: 'inclusionai/ling-3.0-flash:free', label: 'Ling 3.0 Flash · Free', tier: 'free' },
            { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra · Free', tier: 'free' },
            { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B · Free', tier: 'free' },
            { id: 'openai/gpt-5', label: 'GPT latest · Premium', tier: 'premium' },
            { id: 'anthropic/claude-latest', label: 'Claude latest · Premium', tier: 'premium' },
        ],
    },
    {
        id: 'ollama',
        label: 'Ollama',
        description: 'Local models running on your machine through an OpenAI-compatible API.',
        defaultBaseUrl: 'http://localhost:11434/v1',
        requiresApiKey: false,
        native: false,
        models: [
            { id: 'llama3.2', label: 'Llama 3.2 · Local', tier: 'local' },
            { id: 'qwen2.5:7b', label: 'Qwen 2.5 7B · Local', tier: 'local' },
            { id: 'mistral', label: 'Mistral · Local', tier: 'local' },
        ],
    },
    {
        id: 'openai',
        label: 'OpenAI',
        description: 'OpenAI’s official chat-completions API.',
        defaultBaseUrl: 'https://api.openai.com/v1',
        requiresApiKey: true,
        native: false,
        models: [
            { id: 'gpt-4o-mini', label: 'GPT-4o mini · Premium', tier: 'premium' },
            { id: 'gpt-4o', label: 'GPT-4o · Premium', tier: 'premium' },
        ],
    },
    {
        id: 'anthropic',
        label: 'Anthropic',
        description: 'Native Anthropic Messages API adapter.',
        defaultBaseUrl: 'https://api.anthropic.com',
        requiresApiKey: true,
        native: true,
        models: [
            { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku · Premium', tier: 'premium' },
            { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet · Premium', tier: 'premium' },
        ],
    },
    {
        id: 'gemini',
        label: 'Google Gemini',
        description: 'Native Gemini generate-content API adapter.',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com',
        requiresApiKey: true,
        native: true,
        models: [
            { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash · Premium', tier: 'premium' },
            { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash · Premium', tier: 'premium' },
        ],
    },
    {
        id: 'custom',
        label: 'Custom OpenAI-compatible',
        description: 'Any CORS-enabled OpenAI-compatible endpoint or local gateway.',
        defaultBaseUrl: 'http://localhost:1234/v1',
        requiresApiKey: false,
        native: false,
        models: [],
    },
];
export const getProviderPreset = (id: AIProviderId): AIProviderPreset => AI_PROVIDER_PRESETS.find(provider => provider.id === id) || AI_PROVIDER_PRESETS[0];
const trimSlash = (value: string) => value.replace(/\/+$/, '');
const providerBaseUrl = (settings: AISettings): string => {
    const preset = getProviderPreset(settings.provider);
    return trimSlash(settings.baseUrl.trim() || preset.defaultBaseUrl);
};
const gatewayUrl = (settings: AISettings): string => {
    const value = trimSlash(settings.gatewayUrl.trim());
    if (!value)
        throw new Error('Configure an AI gateway URL or switch transport to Direct.');
    if (value.endsWith('/chat'))
        return value;
    if (value.endsWith('/api/ai'))
        return `${value}/chat`;
    return `${value}/api/ai/chat`;
};
const compatibleChatUrl = (settings: AISettings): string => {
    const base = providerBaseUrl(settings);
    if (base.endsWith('/chat/completions'))
        return base;
    return `${base}/chat/completions`;
};
const modelListUrl = (settings: AISettings): string => {
    const base = providerBaseUrl(settings);
    if (settings.provider === 'ollama')
        return `${base.replace(/\/v1$/, '')}/api/tags`;
    if (settings.provider === 'gemini')
        return `${base}/v1beta/models?key=${encodeURIComponent(settings.apiKey)}`;
    return base.endsWith('/models') ? base : `${base}/models`;
};
const modelTier = (model: any): 'free' | 'premium' | 'local' => {
    if (typeof model?.id === 'string' && model.id.endsWith(':free'))
        return 'free';
    if (model?.pricing && String(model.pricing.prompt) === '0' && String(model.pricing.completion) === '0')
        return 'free';
    return 'premium';
};
const isProviderId = (value: unknown): value is AIProviderId => typeof value === 'string' && AI_PROVIDER_PRESETS.some(provider => provider.id === value);
const isModelOption = (value: any): value is AIProviderPreset['models'][number] => value && typeof value === 'object'
    && typeof value.id === 'string'
    && typeof value.label === 'string'
    && (value.tier === 'free' || value.tier === 'premium' || value.tier === 'local');
export const fetchProviderModelCatalog = async (settings: AISettings, options: {
    signal?: AbortSignal;
} = {}): Promise<AIModelCatalogResult> => {
    if (settings.transport === 'gateway') {
        const value = trimSlash(settings.gatewayUrl.trim());
        if (!value)
            throw new Error('Configure a gateway URL first.');
        const url = value.endsWith('/api/ai') ? `${value}/models` : `${value}/api/ai/models`;
        const response = await fetch(url, {
            method: 'POST',
            signal: options.signal,
            headers: { 'Content-Type': 'application/json', ...(settings.gatewayToken ? { Authorization: `Bearer ${settings.gatewayToken}` } : {}) },
            body: JSON.stringify({}),
        });
        await ensureOk(response);
        const body = await response.json();
        const rawGateway = body?.gateway;
        let gateway: GatewayModelPolicyInfo | undefined;
        if (rawGateway !== undefined) {
            if (!rawGateway || typeof rawGateway !== 'object' || !isProviderId(rawGateway.provider) || typeof rawGateway.model !== 'string') {
                throw new Error('The AI gateway returned invalid model-policy metadata.');
            }
            gateway = {
                clientModelSelection: rawGateway.clientModelSelection === true,
                provider: rawGateway.provider,
                model: rawGateway.model,
                models: Array.isArray(rawGateway.models) ? rawGateway.models.filter((model: unknown): model is string => typeof model === 'string') : undefined,
            };
        }
        return { models: Array.isArray(body.models) ? body.models.filter(isModelOption) : [], gateway };
    }
    const response = await fetch(modelListUrl(settings), {
        signal: options.signal,
        headers: {
            ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
            ...(settings.provider === 'anthropic' ? {
                'x-api-key': settings.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            } : {}),
        },
    });
    await ensureOk(response);
    const body = await response.json();
    const rawModels = settings.provider === 'ollama'
        ? (Array.isArray(body.models) ? body.models.map((item: any) => ({ id: item.name, name: item.name })) : [])
        : settings.provider === 'gemini'
            ? (Array.isArray(body.models) ? body.models.filter((item: any) => !item.supportedGenerationMethods || item.supportedGenerationMethods.includes('generateContent')).map((item: any) => ({
                ...item,
                id: String(item.name || '').replace(/^models\//, '')
            })) : [])
            : (Array.isArray(body.data) ? body.data : []);
    const models = rawModels
        .filter((model: any) => typeof model.id === 'string' && model.id.trim())
        .map((model: any) => ({
        id: model.id,
        label: `${model.name || model.id} · ${modelTier(model) === 'free' ? 'Free' : settings.provider === 'ollama' ? 'Local' : 'Premium'}`,
        tier: settings.provider === 'ollama' ? 'local' : modelTier(model),
    }))
        .sort((a, b) => (a.tier === b.tier ? a.label.localeCompare(b.label) : a.tier === 'free' ? -1 : b.tier === 'free' ? 1 : 0));
    return { models };
};
export const fetchProviderModels = async (settings: AISettings, options: {
    signal?: AbortSignal;
} = {}): Promise<AIProviderPreset['models']> => (await fetchProviderModelCatalog(settings, options)).models;
const errorFromPayload = (payload: any, fallback: {
    status?: number;
    message?: string;
} = {}, allowTopLevelMessage = true): AIStreamError | null => {
    const hasErrorObject = payload?.error && typeof payload.error === 'object';
    const rawError = hasErrorObject ? payload.error : allowTopLevelMessage ? payload : null;
    const message = typeof rawError?.message === 'string' && rawError.message.trim() ? rawError.message : fallback.message;
    if (!message)
        return null;
    const statusValue = rawError?.status ?? rawError?.statusCode ?? fallback.status;
    const status = typeof statusValue === 'number' && Number.isFinite(statusValue) ? statusValue : fallback.status;
    return new AIStreamError(message, {
        status,
        code: typeof rawError?.code === 'string' ? rawError.code : undefined,
        provider: typeof rawError?.provider === 'string' ? rawError.provider : undefined,
        model: typeof rawError?.model === 'string' ? rawError.model : undefined,
    });
};
const errorFromResponse = async (response: Response): Promise<AIStreamError> => {
    const raw = await response.text();
    try {
        const parsed = JSON.parse(raw);
        return errorFromPayload(parsed, { status: response.status, message: `${response.status} ${response.statusText}` })
            || new AIStreamError(`${response.status} ${response.statusText}`, { status: response.status });
    }
    catch {
        return new AIStreamError(raw || `${response.status} ${response.statusText}`, { status: response.status });
    }
};
const ensureOk = async (response: Response) => {
    if (!response.ok)
        throw await errorFromResponse(response);
};
const contentFromPayload = (payload: any): string => {
    const openAIContent = payload?.choices?.[0]?.message?.content;
    if (typeof openAIContent === 'string')
        return openAIContent;
    if (Array.isArray(openAIContent))
        return openAIContent.map((part: any) => part?.text || '').join('');
    const anthropicContent = payload?.content;
    if (Array.isArray(anthropicContent))
        return anthropicContent.map((part: any) => part?.text || '').join('');
    const geminiParts = payload?.candidates?.[0]?.content?.parts;
    if (Array.isArray(geminiParts))
        return geminiParts.map((part: any) => part?.text || '').join('');
    if (typeof payload?.content === 'string')
        return payload.content;
    return typeof payload?.text === 'string' ? payload.text : '';
};
const deltaFromPayload = (payload: any): string => {
    if (payload?.delta && typeof payload.delta === 'string')
        return payload.delta;
    const openAIDelta = payload?.choices?.[0]?.delta?.content;
    if (typeof openAIDelta === 'string')
        return openAIDelta;
    const anthropicDelta = payload?.delta?.text;
    if (typeof anthropicDelta === 'string')
        return anthropicDelta;
    const geminiDelta = payload?.candidates?.[0]?.content?.parts;
    if (Array.isArray(geminiDelta))
        return geminiDelta.map((part: any) => part?.text || '').join('');
    return '';
};
const consumeEventStream = async (response: Response, onToken: (token: string) => void): Promise<string> => {
    if (!response.body) {
        const payload = await response.json();
        const text = contentFromPayload(payload);
        if (text)
            onToken(text);
        return text;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    const consumeLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:'))
            return;
        const raw = trimmed.slice(5).trim();
        if (!raw || raw === '[DONE]')
            return;
        let payload: any;
        try {
            payload = JSON.parse(raw);
        }
        catch {
            return;
        }
        const streamError = errorFromPayload(payload, {}, false);
        if (streamError)
            throw streamError;
        const token = deltaFromPayload(payload) || (payload?.type === 'message_stop' ? '' : '');
        if (token) {
            full += token;
            onToken(token);
        }
    };
    while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        lines.forEach(consumeLine);
        if (done)
            break;
    }
    if (buffer)
        consumeLine(buffer);
    return full;
};
const asOpenAIMessages = (messages: AIRequestMessage[]) => messages.map(message => ({
    role: message.role,
    content: message.content,
}));
const requestCompatible = async (settings: AISettings, messages: AIRequestMessage[], signal: AbortSignal | undefined, onToken: (token: string) => void): Promise<string> => {
    const response = await fetch(compatibleChatUrl(settings), {
        method: 'POST',
        signal,
        headers: {
            'Content-Type': 'application/json',
            ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
            ...(settings.provider === 'openrouter' ? { 'X-Title': 'OpenDoc UI' } : {}),
        },
        body: JSON.stringify({
            model: settings.model,
            messages: asOpenAIMessages(messages),
            temperature: settings.temperature,
            ...(settings.maxTokens ? { max_tokens: settings.maxTokens } : {}),
            stream: true,
        }),
    });
    await ensureOk(response);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
        const payload = await response.json();
        const text = contentFromPayload(payload);
        if (text)
            onToken(text);
        return text;
    }
    return consumeEventStream(response, onToken);
};
const requestAnthropic = async (settings: AISettings, messages: AIRequestMessage[], signal: AbortSignal | undefined, onToken: (token: string) => void): Promise<string> => {
    const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
    const response = await fetch(`${providerBaseUrl(settings)}/v1/messages`, {
        method: 'POST',
        signal,
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
            model: settings.model,
            max_tokens: settings.maxTokens || 4096,
            temperature: settings.temperature,
            ...(system ? { system } : {}),
            messages: messages.filter(message => message.role !== 'system').map(message => ({
                role: message.role,
                content: message.content
            })),
            stream: true,
        }),
    });
    await ensureOk(response);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
        const payload = await response.json();
        const text = contentFromPayload(payload);
        if (text)
            onToken(text);
        return text;
    }
    return consumeEventStream(response, onToken);
};
const requestGemini = async (settings: AISettings, messages: AIRequestMessage[], signal: AbortSignal | undefined, onToken: (token: string) => void): Promise<string> => {
    const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
    const contents = messages.filter(message => message.role !== 'system').map(message => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
    }));
    const url = `${providerBaseUrl(settings)}/v1beta/models/${encodeURIComponent(settings.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(settings.apiKey)}`;
    const response = await fetch(url, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            contents,
            generationConfig: { temperature: settings.temperature, ...(settings.maxTokens ? { maxOutputTokens: settings.maxTokens } : {}) },
        }),
    });
    await ensureOk(response);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
        const payload = await response.json();
        const text = contentFromPayload(payload);
        if (text)
            onToken(text);
        return text;
    }
    return consumeEventStream(response, onToken);
};
const requestGateway = async (settings: AISettings, messages: AIRequestMessage[], signal: AbortSignal | undefined, onToken: (token: string) => void): Promise<string> => {
    const response = await fetch(gatewayUrl(settings), {
        method: 'POST',
        signal,
        headers: {
            'Content-Type': 'application/json',
            ...(settings.gatewayToken ? { Authorization: `Bearer ${settings.gatewayToken}` } : {}),
        },
        body: JSON.stringify({
            model: settings.model,
            messages,
            temperature: settings.temperature,
            stream: true,
        }),
    });
    await ensureOk(response);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
        const payload = await response.json();
        const text = contentFromPayload(payload);
        if (text)
            onToken(text);
        return text;
    }
    return consumeEventStream(response, onToken);
};
export const streamAIResponse = async (settings: AISettings, messages: AIRequestMessage[], options: {
    signal?: AbortSignal;
    onToken?: (token: string) => void;
} = {}): Promise<string> => {
    if (!settings.model.trim())
        throw new Error('Choose or enter a model before asking the assistant.');
    const onToken = options.onToken || (() => undefined);
    if (settings.transport === 'gateway')
        return requestGateway(settings, messages, options.signal, onToken);
    if (settings.provider === 'anthropic')
        return requestAnthropic(settings, messages, options.signal, onToken);
    if (settings.provider === 'gemini')
        return requestGemini(settings, messages, options.signal, onToken);
    return requestCompatible(settings, messages, options.signal, onToken);
};
