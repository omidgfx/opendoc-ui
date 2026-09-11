import {replaceUrlProtocol} from '../specification/remoteSpec';
import {readAppPreferences} from '../storage/preferences';

/**
 * Request proxy mode: the Runner hands the compiled request to the
 * downloader service's proxy endpoint, which executes the real API call
 * server-side and returns the response envelope. Builds without
 * `VITE_REQUEST_PROXY` never activate it; a runtime `proxy` config block or
 * the user preference can switch it off without touching the backend.
 */
export const REQUEST_PROXY_BUILD_CONFIG = Object.freeze({
    enabled: String((import.meta as any).env?.VITE_REQUEST_PROXY || '').trim().length > 0,
    endpointTemplate: String((import.meta as any).env?.VITE_REQUEST_PROXY || '').trim(),
});

export interface ProxyRuntimeConfig {
    enabled?: boolean;
    url?: string;
}

const normalizeProxySource = (value: unknown): ProxyRuntimeConfig | null => {
    if (value === true) return {enabled: true};
    if (value === false) return {enabled: false};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const source: ProxyRuntimeConfig = {};
    if (typeof record.enabled === 'boolean') source.enabled = record.enabled;
    if (typeof record.url === 'string' && record.url.trim()) source.url = record.url.trim();
    return source;
};

let runtimeProxyConfig: ProxyRuntimeConfig | null | undefined;

/** Called by the config bootstrap once the runtime config document is known. */
export const recordRuntimeProxyConfig = (value: unknown) => {
    runtimeProxyConfig = normalizeProxySource(value);
};

/** Undefined means "not loaded yet"; null means "loaded and not present". */
export const readRuntimeProxyConfig = (): ProxyRuntimeConfig | null | undefined => runtimeProxyConfig;

export interface ProxyActivation {
    active: boolean;
    endpoint: string;
}

const pageProtocol = (): string => (typeof window !== 'undefined' ? window.location.protocol : 'https:');

const schemeNormalized = (endpoint: string): string => {
    const withScheme = /^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`;
    return replaceUrlProtocol(withScheme, pageProtocol());
};

export const resolveProxyActivation = (): ProxyActivation => {
    if (!REQUEST_PROXY_BUILD_CONFIG.enabled) return {active: false, endpoint: ''};
    const runtime = readRuntimeProxyConfig();
    if (runtime?.enabled === false) return {active: false, endpoint: ''};
    if (!readAppPreferences().runnerProxyEnabled) return {active: false, endpoint: ''};
    return {active: true, endpoint: schemeNormalized(runtime?.url || REQUEST_PROXY_BUILD_CONFIG.endpointTemplate)};
};

export interface ProxiedResponseEnvelope {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    finalUrl: string;
    bodyText: string;
    bodyBytes: number;
    durationMs: number;
}

const PROXY_TIMEOUT_MS = 30000;

/**
 * Sends the compiled plan through the proxy: target URL, method and headers
 * travel as descriptor headers, the request body (including multipart and
 * binary streams) is forwarded exactly as the Runner built it.
 */
export const executeViaProxy = async (input: {
    endpoint: string;
    url: string;
    method: string;
    headers: Record<string, string>;
    body: BodyInit | null;
    cookies: Array<{name: string; value: string}>;
    signal?: AbortSignal;
}): Promise<ProxiedResponseEnvelope> => {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    input.signal?.addEventListener('abort', forwardAbort, {once: true});
    const timeout = globalThis.setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
    try {
        const targetHeaders = {...input.headers};
        if (input.cookies.length > 0)
            targetHeaders.Cookie = input.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
        const response = await fetch(input.endpoint, {
            method: 'POST',
            headers: {
                'X-OpenDoc-Target-Url': input.url,
                'X-OpenDoc-Target-Method': input.method,
                'X-OpenDoc-Target-Headers': JSON.stringify(targetHeaders),
            },
            body: input.body ?? undefined,
            signal: controller.signal,
        });
        const payload = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
            const error = (payload?.error as Record<string, unknown>) || {};
            throw new Error(String(error.message || `The request proxy answered ${response.status}.`));
        }
        const rawBody = String(payload.body || '');
        const bytes = new Uint8Array(
            atob(rawBody)
                .split('')
                .map(character => character.charCodeAt(0)),
        );
        return {
            status: Number(payload.status || 0),
            statusText: String(payload.statusText || ''),
            headers: (payload.headers as Record<string, string>) || {},
            finalUrl: String(payload.finalUrl || input.url),
            bodyText: new TextDecoder().decode(bytes),
            bodyBytes: bytes.byteLength,
            durationMs: Number(payload.durationMs || 0),
        };
    } finally {
        globalThis.clearTimeout(timeout);
        input.signal?.removeEventListener('abort', forwardAbort);
    }
};
