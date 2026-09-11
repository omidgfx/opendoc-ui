const parseBuildBoolean = (value: string | undefined): boolean => String(value || '').toLowerCase() === 'true';

export const REMOTE_SPEC_BUILD_CONFIG = Object.freeze({
    enabled: parseBuildBoolean(import.meta.env.VITE_LOAD_FROM_URL),
    proxyAgentTemplate: String(import.meta.env.VITE_PROXY_AGENT || '').trim(),
});
