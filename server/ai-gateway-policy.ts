import type {AIModelOption, AIProviderId} from '../src/types';
const SUPPORTED_PROVIDERS = new Set<AIProviderId>(['openrouter', 'ollama', 'openai', 'anthropic', 'gemini', 'custom']);
export interface GatewayModelPolicy {
    provider: AIProviderId;
    configuredModel: string;
    clientModelSelection: boolean;
    allowedModels: ReadonlySet<string>;
}
const exactList = (raw: string): string[] =>
    raw
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
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
