import type { AIChatMessage, AIConversation, AIModelOption, AIProfile, AIProviderId, AISettings, AISkillPack, AISourceRef } from '../types';
import { sessionStore, specStorage, uiStorage } from './storage';
import { idbClearPrefix, idbDelete, idbGet, idbSet } from './indexedDb';
import { getProviderPreset } from './aiProviders';
const AI_SETTINGS_KEY = 'ai_settings';
const AI_PROFILES_KEY = 'ai_profiles';
const AI_ACTIVE_PROFILE_KEY = 'ai_active_profile';
const AI_MODEL_CATALOGS_KEY = 'ai_model_catalogs';
const AI_GATEWAY_MODEL_CATALOGS_KEY = 'ai_gateway_model_catalogs';
const AI_CONVERSATIONS_KEY = 'ai_conversations';
const AI_CONVERSATIONS_IDB_PREFIX = 'conversations:';
const AI_SESSION_SECRETS_KEY = 'opendoc_ui_session_secrets';
const MAX_CONVERSATION_MESSAGES = 100;
const MAX_MESSAGE_CHARS = 200000;
const PROVIDERS: AIProviderId[] = ['openrouter', 'ollama', 'openai', 'anthropic', 'gemini', 'custom'];
const SKILLS: AISkillPack[] = ['openapi', 'rest-debugging', 'security', 'sdk-generation', 'api-testing'];
export const DEFAULT_AI_SETTINGS: AISettings = {
    transport: 'direct',
    gatewayUrl: '',
    gatewayToken: '',
    provider: 'openrouter',
    model: 'openrouter/free',
    apiKey: '',
    baseUrl: getProviderPreset('openrouter').defaultBaseUrl,
    temperature: 0.2,
    maxTokens: 2048,
    rememberCredentials: false,
    skillPacks: ['openapi', 'rest-debugging', 'security', 'api-testing'],
    customInstructions: '',
};
const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const normalizeSettings = (value: Partial<AISettings> | null | undefined): AISettings => {
    const provider = PROVIDERS.includes(value?.provider as AIProviderId) ? value!.provider as AIProviderId : DEFAULT_AI_SETTINGS.provider;
    const preset = getProviderPreset(provider);
    const skills = Array.isArray(value?.skillPacks)
        ? value!.skillPacks.filter((skill): skill is AISkillPack => SKILLS.includes(skill as AISkillPack))
        : DEFAULT_AI_SETTINGS.skillPacks;
    const temperature = typeof value?.temperature === 'number' && Number.isFinite(value.temperature)
        ? Math.max(0, Math.min(2, value.temperature))
        : DEFAULT_AI_SETTINGS.temperature;
    return {
        transport: value?.transport === 'gateway' || value?.transport === 'direct' ? value.transport : DEFAULT_AI_SETTINGS.transport,
        gatewayUrl: typeof value?.gatewayUrl === 'string' ? value.gatewayUrl : DEFAULT_AI_SETTINGS.gatewayUrl,
        gatewayToken: typeof value?.gatewayToken === 'string' ? value.gatewayToken : DEFAULT_AI_SETTINGS.gatewayToken,
        provider,
        model: typeof value?.model === 'string' ? value.model : (preset.models[0]?.id || DEFAULT_AI_SETTINGS.model),
        apiKey: typeof value?.apiKey === 'string' ? value.apiKey : DEFAULT_AI_SETTINGS.apiKey,
        baseUrl: typeof value?.baseUrl === 'string' && value.baseUrl.trim() ? value.baseUrl : preset.defaultBaseUrl,
        temperature,
        maxTokens: typeof value?.maxTokens === 'number' && Number.isFinite(value.maxTokens) ? Math.max(256, Math.min(16384, Math.floor(value.maxTokens))) : DEFAULT_AI_SETTINGS.maxTokens,
        rememberCredentials: value?.rememberCredentials === true,
        skillPacks: skills.length > 0 ? skills : DEFAULT_AI_SETTINGS.skillPacks,
        customInstructions: typeof value?.customInstructions === 'string' ? value.customInstructions : DEFAULT_AI_SETTINGS.customInstructions,
    };
};
type SessionSecrets = Record<string, {
    apiKey?: string;
    gatewayToken?: string;
}>;
const readSessionSecrets = (): SessionSecrets => sessionStore.getJSON<SessionSecrets>(AI_SESSION_SECRETS_KEY, {});
export const clearAISessionSecrets = () => sessionStore.remove(AI_SESSION_SECRETS_KEY);
const settingsWithoutSecrets = (settings: AISettings): AISettings => ({
    ...normalizeSettings(settings),
    apiKey: settings.rememberCredentials ? settings.apiKey : '',
    gatewayToken: settings.rememberCredentials ? settings.gatewayToken : '',
});
const withSessionSecrets = (settings: AISettings, scope: string): AISettings => {
    const secrets = readSessionSecrets()[scope] || {};
    return normalizeSettings({
        ...settings,
        apiKey: settings.apiKey || secrets.apiKey || '',
        gatewayToken: settings.gatewayToken || secrets.gatewayToken || '',
    });
};
export const readAISettings = (): AISettings => {
    const persisted = uiStorage.getJSON<Partial<AISettings>>(AI_SETTINGS_KEY, {}, isRecord);
    return withSessionSecrets(normalizeSettings(persisted), 'global');
};
export const writeAISettings = (settings: AISettings) => {
    const normalized = normalizeSettings(settings);
    const secrets = readSessionSecrets();
    secrets.global = { apiKey: normalized.apiKey || undefined, gatewayToken: normalized.gatewayToken || undefined };
    sessionStore.setJSON(AI_SESSION_SECRETS_KEY, secrets);
    uiStorage.setJSON(AI_SETTINGS_KEY, settingsWithoutSecrets(normalized));
};
const isModelOption = (value: any): value is AIModelOption => isRecord(value)
    && typeof value.id === 'string'
    && typeof value.label === 'string'
    && (value.tier === 'free' || value.tier === 'premium' || value.tier === 'local');
const isProfile = (value: any): value is AIProfile => isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && Number.isFinite(value.createdAt)
    && Number.isFinite(value.updatedAt)
    && isRecord(value.settings);
export const readAIProfiles = (): AIProfile[] => {
    const profiles = uiStorage.getJSON<AIProfile[]>(AI_PROFILES_KEY, [], value => Array.isArray(value) && value.length <= 30 && value.every(isProfile));
    return profiles.map(profile => ({
        ...profile,
        settings: withSessionSecrets(normalizeSettings(profile.settings), `profile:${profile.id}`)
    }));
};
export const writeAIProfiles = (profiles: AIProfile[]) => {
    const nextProfiles = profiles.slice(0, 30).map(profile => ({
        ...profile,
        settings: normalizeSettings(profile.settings)
    }));
    const secrets = readSessionSecrets();
    const activeIds = new Set(nextProfiles.map(profile => `profile:${profile.id}`));
    Object.keys(secrets).filter(key => key.startsWith('profile:') && !activeIds.has(key)).forEach(key => delete secrets[key]);
    nextProfiles.forEach(profile => {
        const normalized = normalizeSettings(profile.settings);
        secrets[`profile:${profile.id}`] = {
            apiKey: normalized.apiKey || undefined,
            gatewayToken: normalized.gatewayToken || undefined
        };
    });
    sessionStore.setJSON(AI_SESSION_SECRETS_KEY, secrets);
    uiStorage.setJSON(AI_PROFILES_KEY, nextProfiles.map(profile => ({
        ...profile,
        settings: settingsWithoutSecrets(profile.settings),
    })));
};
export const readActiveAIProfileId = (): string => uiStorage.get(AI_ACTIVE_PROFILE_KEY, '');
export const writeActiveAIProfileId = (id: string) => uiStorage.set(AI_ACTIVE_PROFILE_KEY, id);
export const readAIModelCatalogs = (): Partial<Record<AIProviderId, AIModelOption[]>> => {
    const catalogs = uiStorage.getJSON<Partial<Record<AIProviderId, AIModelOption[]>>>(AI_MODEL_CATALOGS_KEY, {}, value => isRecord(value) && Object.values(value).every(models => Array.isArray(models) && models.length <= 1000 && models.every(isModelOption)));
    return catalogs;
};
export const writeAIModelCatalog = (provider: AIProviderId, models: AIModelOption[]) => {
    const catalogs = readAIModelCatalogs();
    catalogs[provider] = models.slice(0, 1000);
    uiStorage.setJSON(AI_MODEL_CATALOGS_KEY, catalogs);
};
const gatewayCatalogKey = (gatewayUrl: string, provider: AIProviderId): string => `${gatewayUrl.trim().replace(/\/+$/, '')}|${provider}`;
export const readAIGatewayModelCatalog = (gatewayUrl: string, provider: AIProviderId): AIModelOption[] => {
    const catalogs = uiStorage.getJSON<Record<string, AIModelOption[]>>(AI_GATEWAY_MODEL_CATALOGS_KEY, {}, value => isRecord(value) && Object.values(value).every(models => Array.isArray(models) && models.length <= 1000 && models.every(isModelOption)));
    return catalogs[gatewayCatalogKey(gatewayUrl, provider)] || [];
};
export const writeAIGatewayModelCatalog = (gatewayUrl: string, provider: AIProviderId, models: AIModelOption[]) => {
    const catalogs = uiStorage.getJSON<Record<string, AIModelOption[]>>(AI_GATEWAY_MODEL_CATALOGS_KEY, {}, value => isRecord(value) && Object.values(value).every(items => Array.isArray(items) && items.length <= 1000 && items.every(isModelOption)));
    catalogs[gatewayCatalogKey(gatewayUrl, provider)] = models.slice(0, 1000);
    uiStorage.setJSON(AI_GATEWAY_MODEL_CATALOGS_KEY, catalogs);
};
export const newAIProfile = (name: string, settings: AISettings): AIProfile => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return { id, name, settings: normalizeSettings(settings), createdAt: Date.now(), updatedAt: Date.now() };
};
const isSource = (value: any): value is AISourceRef => isRecord(value)
    && typeof value.id === 'string'
    && typeof value.label === 'string'
    && ['endpoint', 'schema', 'tag', 'security', 'server', 'spec'].includes(value.kind);
const isMessage = (value: any): value is AIChatMessage => isRecord(value)
    && typeof value.id === 'string'
    && (value.role === 'user' || value.role === 'assistant')
    && typeof value.content === 'string'
    && Number.isFinite(value.createdAt)
    && (value.citations === undefined || (Array.isArray(value.citations) && value.citations.every(isSource)))
    && (value.isError === undefined || typeof value.isError === 'boolean');
const isConversation = (value: any): value is AIConversation => isRecord(value)
    && typeof value.id === 'string'
    && typeof value.specKey === 'string'
    && typeof value.title === 'string'
    && Number.isFinite(value.createdAt)
    && Number.isFinite(value.updatedAt)
    && typeof value.includeAuthValues === 'boolean'
    && typeof value.trustedRunner === 'boolean'
    && Array.isArray(value.messages)
    && value.messages.length <= 2000
    && value.messages.every(isMessage);
const trimMessage = (message: AIChatMessage): AIChatMessage => ({
    ...message,
    content: message.content.slice(0, MAX_MESSAGE_CHARS),
});
export const trimAIConversation = (conversation: AIConversation): AIConversation => {
    const messages = conversation.messages.map(trimMessage);
    if (messages.length <= MAX_CONVERSATION_MESSAGES)
        return { ...conversation, messages };
    const marker: AIChatMessage = {
        id: `history-marker-${conversation.id}`,
        role: 'assistant',
        content: '[Earlier conversation messages were omitted after the 100-message local history limit.]',
        createdAt: messages[0]?.createdAt || Date.now(),
    };
    return { ...conversation, messages: [marker, ...messages.slice(-(MAX_CONVERSATION_MESSAGES - 1))] };
};
export const readAIConversations = (specKey: string): AIConversation[] => {
    if (!specKey)
        return [];
    const conversations = specStorage.getJSON<AIConversation[]>(specKey, AI_CONVERSATIONS_KEY, [], value => Array.isArray(value) && value.length <= 30 && value.every(isConversation));
    return conversations
        .filter(conversation => conversation.specKey === specKey)
        .map(trimAIConversation)
        .sort((a, b) => b.updatedAt - a.updatedAt);
};
const normalizedConversations = (specKey: string, conversations: AIConversation[]): AIConversation[] => conversations
    .filter(conversation => conversation.specKey === specKey)
    .map(trimAIConversation)
    .slice(0, 30)
    .sort((a, b) => b.updatedAt - a.updatedAt);
export const readAIConversationsAsync = async (specKey: string): Promise<AIConversation[]> => {
    if (!specKey)
        return [];
    const fallback = readAIConversations(specKey);
    const indexed = await idbGet<AIConversation[]>(`${AI_CONVERSATIONS_IDB_PREFIX}${specKey}`);
    if (!Array.isArray(indexed) || !indexed.every(isConversation))
        return fallback;
    const normalizedIndexed = normalizedConversations(specKey, indexed);
    const newest = (items: AIConversation[]) => items.reduce((latest, item) => Math.max(latest, item.updatedAt), 0);
    if (newest(fallback) > newest(normalizedIndexed)) {
        void idbSet(`${AI_CONVERSATIONS_IDB_PREFIX}${specKey}`, fallback);
        return fallback;
    }
    return normalizedIndexed;
};
export const clearAIConversations = async (specKey: string): Promise<void> => {
    if (!specKey)
        return;
    await specStorage.remove(specKey, AI_CONVERSATIONS_KEY);
    await idbDelete(`${AI_CONVERSATIONS_IDB_PREFIX}${specKey}`);
};
export const clearAllAIConversations = async (): Promise<void> => {
    await idbClearPrefix(AI_CONVERSATIONS_IDB_PREFIX);
};
export const writeAIConversations = (specKey: string, conversations: AIConversation[]) => {
    if (!specKey)
        return false;
    const next = normalizedConversations(specKey, conversations);
    if (next.length === 0) {
        void idbDelete(`${AI_CONVERSATIONS_IDB_PREFIX}${specKey}`);
        specStorage.remove(specKey, AI_CONVERSATIONS_KEY);
        return true;
    }
    void idbSet(`${AI_CONVERSATIONS_IDB_PREFIX}${specKey}`, next);
    const result = specStorage.setJSON(specKey, AI_CONVERSATIONS_KEY, next);
    if (!result)
        console.warn('OpenDoc UI could not persist the conversation mirror; IndexedDB may still contain it.');
    return result;
};
export const newAIConversation = (specKey: string, title = 'New conversation'): AIConversation => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return {
        id,
        specKey,
        title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        includeAuthValues: false,
        trustedRunner: false,
        messages: [],
    };
};
export const newAIMessage = (role: 'user' | 'assistant', content: string, isError = false): AIChatMessage => ({
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: Date.now(),
    isError,
});
