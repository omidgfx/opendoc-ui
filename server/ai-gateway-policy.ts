import type {AIManagedAuthMode, AIModelOption, AIProviderId, AISkillPack} from '../src/types';
const SUPPORTED_PROVIDERS = new Set<AIProviderId>(['openrouter', 'ollama', 'openai', 'anthropic', 'gemini', 'custom']);
const KNOWN_SKILL_PACKS: AISkillPack[] = ['openapi', 'rest-debugging', 'security', 'sdk-generation', 'api-testing'];
const DEFAULT_SKILL_PACKS: AISkillPack[] = ['openapi', 'rest-debugging', 'security', 'api-testing'];
const MANAGED_DISPLAY_NAME_MAX = 48;

export interface ManagedGatewayOptions {
    enabled: boolean;
    authMode: AIManagedAuthMode;
    displayName: string;
    exposeModel: boolean;
    lockTemperature: boolean;
    temperature: number;
    subjectHeader: string;
    allowedSkillPacks: AISkillPack[];
}

const exactList = (raw: string): string[] =>
    raw
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);

/** Parses and hardens the AI_GATEWAY_MANAGED* environment block. */
export const createManagedGatewayOptions = (input: {
    managed?: string;
    authMode?: string;
    displayName?: string;
    exposeModel?: string;
    lockTemperature?: string;
    temperature?: string;
    subjectHeader?: string;
    allowedSkillPacks?: string;
}): ManagedGatewayOptions => {
    const enabled =
        String(input.managed || '')
            .trim()
            .toLowerCase() === 'true';
    const displayName = (input.displayName || '').trim().slice(0, MANAGED_DISPLAY_NAME_MAX) || 'Assistant';
    const authMode: AIManagedAuthMode =
        String(input.authMode || '')
            .trim()
            .toLowerCase() === 'token'
            ? 'token'
            : 'ambient';
    const subjectHeader = (input.subjectHeader || '').trim();
    if (subjectHeader && !/^[A-Za-z0-9-]+$/.test(subjectHeader))
        throw new Error('AI_GATEWAY_SUBJECT_HEADER must be a valid HTTP header name.');
    const temperatureRaw = Number(input.temperature);
    const temperature =
        Number.isFinite(temperatureRaw) && temperatureRaw >= 0 && temperatureRaw <= 2 ? temperatureRaw : 0.2;
    const requestedSkills = exactList(input.allowedSkillPacks || '');
    const allowedSkillPacks = requestedSkills.filter(skill =>
        (KNOWN_SKILL_PACKS as string[]).includes(skill),
    ) as AISkillPack[];
    return {
        enabled,
        authMode,
        displayName,
        exposeModel:
            String(input.exposeModel || '')
                .trim()
                .toLowerCase() === 'true',
        // Managed mode locks generation behavior server-side unless the
        // deployment explicitly opts out.
        lockTemperature:
            String(input.lockTemperature || '')
                .trim()
                .toLowerCase() !== 'false',
        temperature,
        subjectHeader,
        allowedSkillPacks: allowedSkillPacks.length > 0 ? allowedSkillPacks : DEFAULT_SKILL_PACKS,
    };
};

/**
 * Builds the secret-free policy descriptor served at GET /api/ai/policy.
 * Model and provider identity are published only when the deployment opts
 * in via AI_GATEWAY_EXPOSE_MODEL=true. Never add credentials here.
 */
export const managedPolicyPayload = (
    managed: ManagedGatewayOptions,
    modelPolicy: GatewayModelPolicy,
    requestsPerMinute: number | null,
): Record<string, unknown> => ({
    policyVersion: 1,
    mode: 'managed',
    ready: true,
    displayName: managed.displayName,
    exposeModel: managed.exposeModel,
    provider: managed.exposeModel ? modelPolicy.provider : null,
    model: managed.exposeModel ? modelPolicy.configuredModel : null,
    clientModelSelection: false,
    allowedSkillPacks: managed.allowedSkillPacks,
    allowCustomInstructions: false,
    limits: requestsPerMinute === null ? {} : {requestsPerMinute},
    auth: managed.authMode,
});
export interface GatewayModelPolicy {
    provider: AIProviderId;
    configuredModel: string;
    clientModelSelection: boolean;
    allowedModels: ReadonlySet<string>;
}
export const createGatewayModelPolicy = (input: {
    provider: string;
    configuredModel: string;
    allowClientModel: boolean;
    allowedModels?: string;
}): GatewayModelPolicy => {
    const provider = input.provider.trim() as AIProviderId;
    const configuredModel = input.configuredModel.trim();
    if (!SUPPORTED_PROVIDERS.has(provider)) throw new Error(`Unsupported AI_PROVIDER '${input.provider}'.`);
    if (!configuredModel) throw new Error('AI_MODEL is required so the gateway has an explicit default model.');
    const configuredAllowlist = exactList(input.allowedModels || '');
    if (input.allowClientModel && configuredAllowlist.length === 0) {
        throw new Error('AI_GATEWAY_ALLOWED_MODELS is required when AI_GATEWAY_ALLOW_CLIENT_MODEL=true.');
    }
    if (configuredAllowlist.some(model => model === '*' || model.includes('*'))) {
        throw new Error('AI_GATEWAY_ALLOWED_MODELS accepts exact model IDs only; wildcard entries are not allowed.');
    }
    const allowedModels = new Set(input.allowClientModel ? configuredAllowlist : [configuredModel]);
    if (!allowedModels.has(configuredModel)) {
        throw new Error('AI_GATEWAY_ALLOWED_MODELS must include AI_MODEL because AI_MODEL is the gateway default.');
    }
    return {provider, configuredModel, clientModelSelection: input.allowClientModel, allowedModels};
};
export const resolveGatewaySelection = (
    policy: GatewayModelPolicy,
    body: unknown,
):
    | {
          provider: AIProviderId;
          model: string;
      }
    | {
          error: string;
      } => {
    const request = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const requestedProvider = typeof request.provider === 'string' ? request.provider.trim() : '';
    if (requestedProvider && requestedProvider !== policy.provider) {
        return {error: `Provider selection is controlled by the gateway and is fixed to '${policy.provider}'.`};
    }
    const requestedModel =
        typeof request.model === 'string' && request.model.trim() ? request.model.trim() : policy.configuredModel;
    if (!policy.allowedModels.has(requestedModel))
        return {error: `Model '${requestedModel}' is not allowed by this gateway.`};
    if (!policy.clientModelSelection && requestedModel !== policy.configuredModel) {
        return {error: `This gateway is locked to model '${policy.configuredModel}'.`};
    }
    return {provider: policy.provider, model: requestedModel};
};
export const allowedModelCatalog = (policy: GatewayModelPolicy, discovered: AIModelOption[]): AIModelOption[] => {
    const discoveredById = new Map(discovered.map(model => [model.id, model]));
    return Array.from(
        policy.allowedModels,
        id =>
            discoveredById.get(id) || {
                id,
                label: `${id} · Gateway allowed`,
                tier: policy.provider === 'ollama' ? 'local' : 'premium',
            },
    );
};
