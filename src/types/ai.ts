export type AIProviderId = 'openrouter' | 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'custom';
export type AITransport = 'direct' | 'gateway';
export type AISkillPack = 'openapi' | 'rest-debugging' | 'security' | 'sdk-generation' | 'api-testing';

export interface AISettings {
    transport: AITransport;
    gatewayUrl: string;
    gatewayToken: string;
    provider: AIProviderId;
    model: string;
    apiKey: string;
    baseUrl: string;
    temperature: number;
    maxTokens?: number;
    rememberCredentials?: boolean;
    skillPacks: AISkillPack[];
    customInstructions: string;
}

export interface AIModelOption {
    id: string;
    label: string;
    tier: 'free' | 'premium' | 'local';
}

export interface AIProviderPreset {
    id: AIProviderId;
    label: string;
    description: string;
    defaultBaseUrl: string;
    requiresApiKey: boolean;
    native: boolean;
    models: AIModelOption[];
}

export interface AIProfile {
    id: string;
    name: string;
    settings: AISettings;
    createdAt: number;
    updatedAt: number;
}

export type AIMessageRole = 'system' | 'user' | 'assistant';

export interface AIChatMessage {
    id: string;
    role: Exclude<AIMessageRole, 'system'>;
    content: string;
    createdAt: number;
    citations?: AISourceRef[];
    isError?: boolean;
}

export interface AIConversation {
    id: string;
    specKey: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    includeAuthValues: boolean;
    trustedRunner: boolean;
    messages: AIChatMessage[];
}

export interface AISourceRef {
    id: string;
    label: string;
    kind: 'endpoint' | 'schema' | 'tag' | 'security' | 'server' | 'spec';
    path?: string;
    method?: string;
    schemaName?: string;
    href?: string;
}

export interface AIContextInput {
    spec: any;
    specKey: string;
    selectedEndpoints?: Array<{
        path: string;
        method: string;
    }>;
    selectedServer?: string;
    activeTab?: string;
    searchQuery?: string;
    activeAuthScheme?: string;
    includeAuthValues?: boolean;
    auth?: any;
}

export interface AIContextResult {
    context: string;
    sources: AISourceRef[];
}

export interface AIRequestMessage {
    role: AIMessageRole;
    content: string;
}
