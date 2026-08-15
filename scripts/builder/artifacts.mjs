/** Writes the generated runtime artifacts (.env, config, framework examples). */
import {chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ENV_PATH, ROOT} from './paths.mjs';
import {note, section, warning} from './ui.mjs';
import {writeEnv} from './env.mjs';
import {saveConfig} from './config.mjs';

const ensureIgnored = file => {
    if (!existsSync(join(ROOT, '.gitignore'))) return;
    const patterns = readFileSync(join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).filter(Boolean);
    const relative = file.replace(ROOT, '').replace(/^[\\/]/, '');
    const ignored = patterns.some(pattern => {
        const normalized = pattern.trim();
        if (!normalized || normalized.startsWith('#')) return false;
        if (normalized.startsWith('/')) return relative.startsWith(normalized.slice(1));
        return (
            relative === normalized ||
            relative.startsWith(`${normalized}/`) ||
            normalized === '.env*' ||
            (normalized.endsWith('*') && relative.includes(normalized.slice(0, -1)))
        );
    });
    if (!ignored) warning(`"${relative}" contains credentials but is not covered by .gitignore.`);
};

const writeExampleEnv = (targetDir, sourceExample, replacements) => {
    const example = join(ROOT, sourceExample);
    if (!existsSync(example)) {
        warning(`Example source ${sourceExample} is missing; skipping.`);
        return;
    }
    let text = readFileSync(example, 'utf8');
    Object.entries(replacements).forEach(([key, value]) => {
        text = text.replace(new RegExp(`^(${key}=).*$`, 'm'), `$1${value}`);
    });
    mkdirSync(targetDir, {recursive: true});
    const target = join(targetDir, '.env');
    writeFileSync(target, text);
    if (process.platform !== 'win32') {
        try {
            chmodSync(target, 0o600);
        } catch {
            // not supported
        }
    }
    ensureIgnored(target);
    note(`wrote ${target.replace(ROOT, '.')}`);
};

/** Called only after the build verified successfully. */
export function writeArtifacts(config) {
    section('Writing configuration');
    const env = {};
    if (config.aiGateway.enabled) {
        Object.assign(env, {
            AI_GATEWAY_TOKEN: config.aiGateway.token,
            AI_GATEWAY_ORIGIN: config.aiGateway.origins,
            AI_GATEWAY_PORT: String(config.aiGateway.port),
            AI_PROVIDER: config.aiGateway.provider,
            AI_MODEL: config.aiGateway.model,
            AI_GATEWAY_RATE_LIMIT: String(config.aiGateway.rateLimit),
            AI_GATEWAY_MAX_CONCURRENT: String(config.aiGateway.maxConcurrent),
            AI_GATEWAY_MAX_MESSAGES: String(config.aiGateway.maxMessages),
            AI_GATEWAY_MAX_MESSAGE_CHARS: String(config.aiGateway.maxMessageChars),
            AI_GATEWAY_MAX_CONTEXT_CHARS: String(config.aiGateway.maxContextChars),
            AI_GATEWAY_MAX_OUTPUT_TOKENS: String(config.aiGateway.maxOutputTokens),
            AI_GATEWAY_UPSTREAM_TIMEOUT_MS: String(config.aiGateway.upstreamTimeoutMs),
        });
        if (config.aiGateway.baseUrl) env.AI_BASE_URL = config.aiGateway.baseUrl;
        if (config.aiGateway.apiKey) env.AI_API_KEY = config.aiGateway.apiKey;
    }
    if (config.profile !== 'static') {
        Object.assign(env, {
            OPENDOC_IMAGE_NAME: config.docker.imageName,
            OPENDOC_CONTAINER_NAME: config.docker.containerName,
            OPENDOC_PORT: String(config.docker.port),
            OPENDOC_RESTART_POLICY: config.docker.restartPolicy,
        });
    }
    // Build the desired managed map first, then remove every managed key that
    // is no longer applicable so stale secrets can never survive.
    writeEnv(env);
    note(`wrote ${ENV_PATH.replace(ROOT, '.')}`);
    ensureIgnored(ENV_PATH);
    saveConfig(config);
    note('wrote ./builder.config.json');
    if (config.proxyExample !== 'none' && config.downloaderTemplate) {
        const origin = [config.deploymentOrigin, 'http://localhost:3000'].filter(Boolean).join(',');
        writeExampleEnv(join(ROOT, 'downloaders', config.proxyExample), 'downloaders/config.env.example', {
            OPENDOC_ALLOWED_ORIGINS: origin,
        });
    }
    if (config.aiGateway.enabled && config.aiGateway.aiProxyExample !== 'none') {
        writeExampleEnv(join(ROOT, 'ai-gateways', config.aiGateway.aiProxyExample), 'ai-gateways/config.env.example', {
            AI_GATEWAY_TOKEN: config.aiGateway.token,
            AI_GATEWAY_ORIGINS: config.aiGateway.origins,
            AI_PROVIDER: config.aiGateway.provider,
            AI_MODEL: config.aiGateway.model,
            ...(config.aiGateway.apiKey ? {AI_API_KEY: config.aiGateway.apiKey} : {}),
            ...(config.aiGateway.baseUrl ? {AI_BASE_URL: config.aiGateway.baseUrl} : {}),
        });
    }
    if (config.aiGateway.enabled)
        note('gateway token, provider and limits saved to .env — the gateway reads them at runtime');
    if (config.profile !== 'static')
        note('docker/config.json stays the specs source (Mode 1/2/3); edit it and reload the browser');
}
