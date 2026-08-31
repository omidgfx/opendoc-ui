import type {AIManagedPolicy, AISettings, AISkillPack} from '../../types';

/**
 * Managed AI mode: the deployment's backend owns provider configuration and
 * authorization. The browser discovers a secret-free capability descriptor at
 * the policy endpoint and synthesizes settings locally; no API key, gateway
 * token, or upstream base URL ever reaches the client.
 */
export const MANAGED_POLICY_ENDPOINT = '/api/ai/policy';
export const MANAGED_POLICY_CACHE_TTL_MS = 5 * 60 * 1000;

const SKILL_PACKS: AISkillPack[] = ['openapi', 'rest-debugging', 'security', 'sdk-generation', 'api-testing'];
const DEFAULT_MANAGED_SKILL_PACKS: AISkillPack[] = ['openapi', 'rest-debugging', 'security', 'api-testing'];
const DISPLAY_NAME_MAX_CHARS = 48;
const PROVIDER_IDS = ['openrouter', 'ollama', 'openai', 'anthropic', 'gemini', 'custom'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

export interface ManagedModeSource {
    enabled?: boolean;
    policyUrl?: string;
}

/**
 * Accepts only the two known keys of the runtime `ai.managed` config block.
 * Anything else (including credential-shaped values) is ignored by design.
 */
const normalizeManagedSource = (value: unknown): ManagedModeSource | null => {
    if (value === true) return {enabled: true};
    if (value === false) return {enabled: false};
    if (!isRecord(value)) return null;
    const source: ManagedModeSource = {};
    if (typeof value.enabled === 'boolean') source.enabled = value.enabled;
    if (typeof value.policyUrl === 'string' && value.policyUrl.trim()) source.policyUrl = value.policyUrl.trim();
    return source;
};

let runtimeManagedConfig: ManagedModeSource | null | undefined;

/** Called by the config bootstrap once the runtime config document is known. */
export const recordRuntimeManagedConfig = (value: unknown) => {
    runtimeManagedConfig = normalizeManagedSource(value);
};

/** Undefined means "not loaded yet"; null means "loaded and not present". */
export const readRuntimeManagedConfig = (): ManagedModeSource | null | undefined => runtimeManagedConfig;

export interface ManagedActivationInput {
    /** `ai.managed` from config.json / window.INITIAL_CONFIG, if any. */
    runtimeConfig: unknown;
    envManaged?: string;
    envPolicyUrl?: string;
    /** True once the config bootstrap finished reading the runtime config. */
    configLoaded: boolean;
}

export interface ManagedActivation {
    active: boolean;
    policyUrl: string;
}

/**
 * Precedence: runtime `ai.managed` config block first (it is the deployment's
 * explicit choice), then build-time env, then the silent same-origin default
 * probe. `configLoaded=false` only allows an explicit env opt-in to start
 * early; the default probe waits so config.json is never raced.
 */
export const resolveManagedActivation = (input: ManagedActivationInput): ManagedActivation => {
    const envUrl = (input.envPolicyUrl || '').trim() || MANAGED_POLICY_ENDPOINT;
    const envEnabled = String(input.envManaged || '')
        .trim()
        .toLowerCase();
    const runtime = normalizeManagedSource(input.runtimeConfig);
    if (runtime) return {active: runtime.enabled !== false, policyUrl: runtime.policyUrl || envUrl};
    if (!input.configLoaded) return {active: envEnabled === 'true', policyUrl: envUrl};
    if (envEnabled === 'false') return {active: false, policyUrl: envUrl};
    return {active: true, policyUrl: envUrl};
};

/**
 * Normalizes the policy response into a locked shape. Only allowlisted keys
 * are read, so credential-shaped fields (apiKey, baseUrl, token, ...) can
 * never survive into client state. Returns null for anything that is not a
 * managed-mode descriptor.
 */
export const normalizeManagedPolicy = (raw: unknown): AIManagedPolicy | null => {
    if (!isRecord(raw) || raw.mode !== 'managed') return null;
    const displayName =
        typeof raw.displayName === 'string' && raw.displayName.trim()
            ? raw.displayName.trim().slice(0, DISPLAY_NAME_MAX_CHARS)
            : 'Assistant';
    const exposeModel = raw.exposeModel === true;
    const provider =
        exposeModel && typeof raw.provider === 'string' && (PROVIDER_IDS as readonly string[]).includes(raw.provider)
            ? (raw.provider as AIManagedPolicy['provider'])
            : null;
    const model = exposeModel && typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : null;
    const skillPacks = Array.isArray(raw.allowedSkillPacks)
        ? raw.allowedSkillPacks.filter((skill): skill is AISkillPack =>
              (SKILL_PACKS as string[]).includes(skill as string),
          )
        : [];
    const limits = isRecord(raw.limits) ? raw.limits : {};
    const requestsPerMinute =
        typeof limits.requestsPerMinute === 'number' &&
        Number.isFinite(limits.requestsPerMinute) &&
        limits.requestsPerMinute > 0
            ? Math.floor(limits.requestsPerMinute)
            : null;
    return {
        mode: 'managed',
        ready: raw.ready !== false,
        displayName,
        exposeModel,
        provider,
        model,
        allowedSkillPacks: skillPacks.length > 0 ? skillPacks : DEFAULT_MANAGED_SKILL_PACKS,
        allowCustomInstructions: raw.allowCustomInstructions === true,
        requestsPerMinute,
        auth: raw.auth === 'token' ? 'token' : 'ambient',
    };
};

/** Derives the chat endpoint from the policy URL (`/policy` -> `/chat`). */
export const managedChatUrlFromPolicyUrl = (policyUrl: string): string => {
    const trimmed = policyUrl.trim().replace(/\/+$/, '');
    if (trimmed.endsWith('/policy')) return `${trimmed.slice(0, -'/policy'.length)}/chat`;
    return `${trimmed}/chat`;
};

/**
 * Synthesized, never-persisted settings for managed mode. Secrets are empty
 * by construction and the model is empty on purpose: the gateway-owned model
 * is resolved server-side when the request omits it.
 */
export const managedSettingsFromPolicy = (policy: AIManagedPolicy, policyUrl: string): AISettings => ({
    transport: 'gateway',
    gatewayUrl: managedChatUrlFromPolicyUrl(policyUrl),
    gatewayToken: '',
    provider: policy.exposeModel && policy.provider ? policy.provider : 'custom',
    model: policy.exposeModel && policy.model ? policy.model : '',
    apiKey: '',
    baseUrl: '',
    temperature: 0.2,
    maxTokens: 2048,
    rememberCredentials: false,
    skillPacks: policy.allowedSkillPacks,
    customInstructions: '',
});

/** The only model identity the UI may show in managed mode. */
export const managedModelLabel = (policy: AIManagedPolicy): string => {
    if (policy.exposeModel && policy.model) return policy.model;
    return policy.displayName;
};

const errorStatus = (error: unknown): number => {
    if (error && typeof error === 'object' && 'status' in error) {
        const status = Number((error as {status?: unknown}).status);
        if (Number.isFinite(status)) return status;
    }
    return 0;
};

/**
 * Managed errors never echo provider or upstream text, so nothing about the
 * hidden backend configuration can leak through failure messages.
 */
export const managedErrorMessage = (error: unknown): string => {
    const status = errorStatus(error);
    if (status === 401 || status === 403)
        return 'Your session is not authorized for the assistant. Sign in through your organization portal and try again.';
    if (status === 429) return 'The assistant is rate limited right now. Try again in a moment.';
    if (status === 404) return 'The assistant service was not found. Contact your administrator.';
    if (status >= 500) return 'The assistant service is having trouble right now. Try again shortly.';
    return 'The assistant is unavailable right now. Contact your administrator if this keeps happening.';
};

interface PolicyCacheEntry {
    etag: string | null;
    policy: AIManagedPolicy;
}

const policyCache = new Map<string, PolicyCacheEntry>();

/**
 * Fetches and normalizes the managed policy. Any non-OK response (including
 * 404 and 401) means managed mode stays off; the caller falls back to the
 * classic profile flow. ETag revalidation keeps re-checks cheap.
 */
export const fetchManagedPolicy = async (
    url: string,
    options: {signal?: AbortSignal} = {},
): Promise<AIManagedPolicy | null> => {
    const cached = policyCache.get(url) || null;
    const response = await fetch(url, {
        signal: options.signal,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            ...(cached?.etag ? {'If-None-Match': cached.etag} : {}),
        },
    });
    if (response.status === 304 && cached) return cached.policy;
    if (!response.ok) return null;
    const raw = await response.json().catch(() => null);
    const policy = normalizeManagedPolicy(raw);
    if (!policy) return null;
    policyCache.set(url, {etag: response.headers.get('etag'), policy});
    return policy;
};
