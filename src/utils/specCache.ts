/**
 * Persistent cache for remotely fetched specification files.
 *
 * Every parsed spec source (a URL from config.json or window.INITIAL_CONFIG)
 * is cached in localStorage under a key derived from its URL, so revisiting
 * the same spec does not hit the network again. The refresh button in the
 * navbar wipes the cache before forcing a re-fetch.
 */

const PREFIX = 'opendoc_spec_cache_v1:';

type CacheEntry = {
    raw: string;
    fetchedAt: number;
};

const cacheKeyFor = (url: string) => `${PREFIX}${url}`;

export const readCachedSpec = (url: string): string | null => {
    try {
        const entry = localStorage.getItem(cacheKeyFor(url));
        if (!entry) return null;
        const parsed = JSON.parse(entry) as CacheEntry;
        if (typeof parsed?.raw !== 'string') return null;
        return parsed.raw;
    } catch {
        return null;
    }
};

export const writeCachedSpec = (url: string, raw: string) => {
    const entry: CacheEntry = { raw, fetchedAt: Date.now() };
    try {
        localStorage.setItem(cacheKeyFor(url), JSON.stringify(entry));
    } catch (e) {
        // Storage might be full or unavailable; a cache miss is never fatal.
        console.warn('Could not cache spec, storage unavailable.', e);
    }
};

export const clearCachedSpec = (url: string) => {
    try {
        localStorage.removeItem(cacheKeyFor(url));
    } catch {
        /* noop */
    }
};

export const clearAllCachedSpecs = () => {
    try {
        Object.keys(localStorage)
            .filter((k) => k.startsWith(PREFIX))
            .forEach((k) => localStorage.removeItem(k));
    } catch {
        /* noop */
    }
};

export const getCachedSpecAge = (url: string): number | null => {
    try {
        const entry = localStorage.getItem(cacheKeyFor(url));
        if (!entry) return null;
        const parsed = JSON.parse(entry) as CacheEntry;
        return typeof parsed?.fetchedAt === 'number' ? parsed.fetchedAt : null;
    } catch {
        return null;
    }
};

/**
 * Fetch a spec file's raw text, preferring the localStorage cache.
 * Pass `force: true` to bypass the cache (used by the refresh button).
 */
export const fetchSpecText = async (url: string, opts: { force?: boolean } = {}): Promise<string> => {
    if (!opts.force) {
        const cached = readCachedSpec(url);
        if (cached != null) return cached;
    }

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to fetch ${url} (${response.status})`);
    const raw = await response.text();
    writeCachedSpec(url, raw);
    return raw;
};
