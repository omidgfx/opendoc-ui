export type RemoteRequestMode = 'downloader' | 'direct' | 'direct-scheme-retry';
export type RemoteAttemptState = 'requesting' | 'response' | 'failed';

export interface RemoteRequestAttempt {
    mode: RemoteRequestMode;
    state: RemoteAttemptState;
    url: string;
    status?: number;
    message?: string;
}

export interface RemoteRequesterOptions {
    downloaderTemplate?: string;
    pageProtocol?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    onAttempt?: (attempt: RemoteRequestAttempt) => void;
}

export class RemoteSpecRequestError extends Error {
    readonly code = 'REMOTE_SPEC_TRANSPORT_FAILED';
    readonly attempts: RemoteRequestAttempt[];

    constructor(message: string, attempts: RemoteRequestAttempt[], options?: {cause?: unknown}) {
        super(message, options);
        this.name = 'RemoteSpecRequestError';
        this.attempts = attempts;
    }
}

const normalizeHttpProtocol = (protocol?: string): 'http:' | 'https:' =>
    String(protocol || '').toLowerCase() === 'http:' ? 'http:' : 'https:';

export const normalizeRemoteSpecUrl = (input: string): string => {
    const value = input.trim();
    if (!value) throw new Error('Enter an OpenAPI or Swagger URL.');
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error('Enter a complete URL beginning with http:// or https://.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol))
        throw new Error('Only HTTP and HTTPS specification URLs are supported.');
    if (parsed.username || parsed.password)
        throw new Error('URLs containing embedded usernames or passwords are not supported.');
    parsed.hash = '';
    return parsed.href;
};

export const normalizeDownloaderTemplate = (template: string): string => {
    const normalized = template
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/^\/+/, '');
    if (!normalized) throw new Error('The specification downloader URL is empty.');
    if (!normalized.includes('{URL}'))
        throw new Error('The specification downloader URL must contain the exact {URL} placeholder.');
    return normalized;
};

export const buildDownloaderUrl = (template: string, targetUrl: string, pageProtocol?: string): string => {
    const normalizedTarget = normalizeRemoteSpecUrl(targetUrl);
    const normalizedTemplate = normalizeDownloaderTemplate(template);
    const protocol = normalizeHttpProtocol(pageProtocol);
    const replaced = normalizedTemplate.split('{URL}').join(encodeURIComponent(normalizedTarget));
    let parsed: URL;
    try {
        parsed = new URL(`${protocol}//${replaced}`);
    } catch {
        throw new Error('The specification downloader template does not produce a valid URL.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol))
        throw new Error('The specification downloader must resolve to an HTTP or HTTPS URL.');
    if (parsed.username || parsed.password)
        throw new Error('The specification downloader URL cannot contain embedded credentials.');
    return parsed.href;
};

export const replaceUrlProtocol = (targetUrl: string, pageProtocol?: string): string => {
    const parsed = new URL(normalizeRemoteSpecUrl(targetUrl));
    parsed.protocol = normalizeHttpProtocol(pageProtocol);
    return parsed.href;
};

const errorText = (error: unknown): string =>
    error instanceof DOMException && error.name === 'AbortError'
        ? 'The request timed out or was cancelled.'
        : error instanceof Error
          ? error.message
          : String(error || 'Network request failed.');

/**
 * Create a browser requester with the configured downloader/direct fallback chain.
 * Downloader 4xx responses are deliberate policy failures and are never bypassed.
 */
export const createRemoteSpecRequester = (options: RemoteRequesterOptions = {}) => {
    const fetchImpl = options.fetchImpl || fetch;
    const pageProtocol = normalizeHttpProtocol(options.pageProtocol);
    return async (targetInput: string, init: RequestInit = {}): Promise<Response> => {
        const targetUrl = normalizeRemoteSpecUrl(targetInput);
        const attempts: RemoteRequestAttempt[] = [];
        const attempt = async (mode: RemoteRequestMode, requestUrl: string): Promise<Response> => {
            const start: RemoteRequestAttempt = {mode, state: 'requesting', url: requestUrl};
            attempts.push(start);
            options.onAttempt?.(start);
            const controller = new AbortController();
            const relayAbort = () => controller.abort(init.signal?.reason);
            if (init.signal?.aborted) relayAbort();
            else init.signal?.addEventListener('abort', relayAbort, {once: true});
            const timeout = globalThis.setTimeout(
                () => controller.abort(new DOMException('Remote specification request timed out.', 'TimeoutError')),
                options.timeoutMs || 15_000,
            );
            try {
                const response = await fetchImpl(requestUrl, {
                    ...init,
                    signal: controller.signal,
                    cache: 'no-store',
                    credentials: 'omit',
                    redirect: 'follow',
                });
                const completed: RemoteRequestAttempt = {
                    mode,
                    state: 'response',
                    url: requestUrl,
                    status: response.status,
                };
                attempts.push(completed);
                options.onAttempt?.(completed);
                return response;
            } catch (error) {
                const failed: RemoteRequestAttempt = {
                    mode,
                    state: 'failed',
                    url: requestUrl,
                    message: errorText(error),
                };
                attempts.push(failed);
                options.onAttempt?.(failed);
                throw error;
            } finally {
                globalThis.clearTimeout(timeout);
                init.signal?.removeEventListener('abort', relayAbort);
            }
        };

        if (options.downloaderTemplate?.trim()) {
            const downloaderUrl = buildDownloaderUrl(options.downloaderTemplate, targetUrl, pageProtocol);
            try {
                const response = await attempt('downloader', downloaderUrl);
                if (response.status < 500) return response;
                await response.body?.cancel();
            } catch {
                // Transport failures intentionally continue to the direct fallback.
            }
        }

        try {
            return await attempt('direct', targetUrl);
        } catch (directError) {
            const schemeAdjusted = replaceUrlProtocol(targetUrl, pageProtocol);
            if (schemeAdjusted !== targetUrl) {
                try {
                    return await attempt('direct-scheme-retry', schemeAdjusted);
                } catch (retryError) {
                    throw new RemoteSpecRequestError(
                        'The specification could not be downloaded through the configured attempts.',
                        attempts,
                        {cause: retryError},
                    );
                }
            }
            throw new RemoteSpecRequestError(
                'The specification could not be downloaded through the configured attempts.',
                attempts,
                {cause: directError},
            );
        }
    };
};

export const remoteRequestModeLabel = (mode: RemoteRequestMode): string => {
    if (mode === 'downloader') return 'downloader proxy';
    if (mode === 'direct-scheme-retry') return 'scheme-adjusted direct request';
    return 'direct browser request';
};

export const stableRemoteSpecHash = (text: string): string => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
};

export const remoteSpecKey = (url: string): string => `remote:${stableRemoteSpecHash(normalizeRemoteSpecUrl(url))}`;
