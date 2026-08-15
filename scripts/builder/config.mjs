/** Builder configuration schema, validation, and (de)serialization. */
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {CONFIG_PATH, ENV_PATH} from './paths.mjs';
import {readEnv} from './env.mjs';
import {
    isDockerContainerName,
    isDockerImageName,
    isOrigin,
    isPort,
    normalizeBasePath,
    toOrigin,
    validateBasePath,
    validateDownloaderTemplate,
    validateOrigins,
} from './validators.mjs';

export const DEFAULT_CONFIG = () => ({
    version: 1,
    profile: 'both',
    clean: true,
    disableAppleEmojis: true,
    basePath: '/',
    loadFromUrl: false,
    downloaderTemplate: null,
    proxyExample: 'none',
    deploymentOrigin: null,
    aiGateway: {
        enabled: false,
        provider: 'openrouter',
        model: '',
        baseUrl: '',
        origins: 'http://localhost:3000,http://127.0.0.1:3000',
        port: 8787,
        rateLimit: 30,
        maxConcurrent: 4,
        maxMessages: 24,
        maxMessageChars: 40000,
        maxContextChars: 250000,
        maxOutputTokens: 2048,
        upstreamTimeoutMs: 60000,
        aiProxyExample: 'none',
    },
    docker: {
        imageName: 'opendoc-ui',
        containerName: 'opendoc-ui',
        port: 3000,
        restartPolicy: 'unless-stopped',
    },
});

export const cloneConfig = () => JSON.parse(JSON.stringify(DEFAULT_CONFIG()));

/** Validate a fully-loaded configuration object. Returns an error string or null. */
export const validateConfig = config => {
    if (!config || typeof config !== 'object') return 'Configuration is not an object.';
    if (!['static', 'docker', 'both'].includes(config.profile)) return `Unknown profile "${config.profile}".`;
    if (typeof config.clean !== 'boolean') return 'clean must be a boolean.';
    if (typeof config.disableAppleEmojis !== 'boolean') return 'disableAppleEmojis must be a boolean.';
    if (typeof config.basePath !== 'string' || validateBasePath(config.basePath) !== true)
        return `Invalid base path "${config.basePath}".`;
    if (typeof config.loadFromUrl !== 'boolean') return 'loadFromUrl must be a boolean.';
    if (config.downloaderTemplate !== null && validateDownloaderTemplate(config.downloaderTemplate) !== true)
        return 'Invalid downloader template.';
    if (config.deploymentOrigin !== null && !isOrigin(config.deploymentOrigin))
        return `Invalid deployment origin "${config.deploymentOrigin}".`;
    const gateway = config.aiGateway;
    if (!gateway || typeof gateway !== 'object') return 'aiGateway configuration is missing.';
    if (typeof gateway.enabled !== 'boolean') return 'aiGateway.enabled must be a boolean.';
    if (gateway.enabled) {
        if (!['openai', 'anthropic', 'ollama', 'openrouter', 'custom'].includes(gateway.provider))
            return `Unknown AI provider "${gateway.provider}".`;
        if (!gateway.model) return 'aiGateway.model is required when the gateway is enabled.';
        if (gateway.baseUrl && !isOrigin(gateway.baseUrl) && !/^https?:\/\/.+\..+/.test(gateway.baseUrl))
            return `Invalid AI base URL "${gateway.baseUrl}".`;
        if (validateOrigins(gateway.origins) !== true) return 'Invalid AI gateway origins.';
        if (!isPort(gateway.port)) return `Invalid AI gateway port "${gateway.port}".`;
    }
    const docker = config.docker;
    if (!docker || typeof docker !== 'object') return 'docker configuration is missing.';
    if (!isDockerImageName(docker.imageName)) return `Invalid Docker image name "${docker.imageName}".`;
    if (!isDockerContainerName(docker.containerName)) return `Invalid Docker container name "${docker.containerName}".`;
    if (!isPort(docker.port)) return `Invalid Docker host port "${docker.port}".`;
    if (!['unless-stopped', 'always', 'on-failure', 'no'].includes(docker.restartPolicy))
        return `Unknown restart policy "${docker.restartPolicy}".`;
    return null;
};

export const loadLastConfig = () => {
    if (!existsSync(CONFIG_PATH)) return null;
    try {
        return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
        return null;
    }
};

/** Merge a possibly-old config onto defaults and validate. Secrets come from .env, never from JSON. */
export const normalizeLoadedConfig = last => {
    const env = readEnv();
    const config = cloneConfig();
    if (last && typeof last === 'object') {
        if (last.profile) config.profile = last.profile;
        if (typeof last.clean === 'boolean') config.clean = last.clean;
        if (typeof last.disableAppleEmojis === 'boolean') config.disableAppleEmojis = last.disableAppleEmojis;
        else if (typeof last.appleEmojis === 'boolean') config.disableAppleEmojis = !last.appleEmojis; // v0 migration
        if (last.basePath) config.basePath = last.basePath;
        if (typeof last.loadFromUrl === 'boolean') config.loadFromUrl = last.loadFromUrl;
        if (last.downloaderTemplate) config.downloaderTemplate = last.downloaderTemplate;
        if (last.proxyExample) config.proxyExample = last.proxyExample;
        if (last.deploymentOrigin) config.deploymentOrigin = last.deploymentOrigin;
        else if (last.deploymentUrl) config.deploymentOrigin = toOrigin(last.deploymentUrl);
        if (last.aiGateway && typeof last.aiGateway === 'object') {
            Object.assign(config.aiGateway, last.aiGateway);
        }
        if (last.docker && typeof last.docker === 'object') {
            Object.assign(config.docker, last.docker);
        }
    }
    // Secrets always come from .env (never persisted in the JSON config).
    config.aiGateway.token = env.AI_GATEWAY_TOKEN || '';
    config.aiGateway.apiKey = env.AI_API_KEY || '';
    const error = validateConfig(config);
    if (error) throw new Error(`Stored configuration is invalid: ${error}`);
    return config;
};

export const saveConfig = config => {
    // Never persist secrets in the JSON config.
    const {token: _token, apiKey: _apiKey, ...safeGateway} = config.aiGateway;
    const safe = {...config, aiGateway: safeGateway};
    writeFileSync(CONFIG_PATH, `${JSON.stringify(safe, null, 2)}\n`);
};
