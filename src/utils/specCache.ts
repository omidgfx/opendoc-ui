/**
 * Persistent cache for remotely fetched specification files.
 *
 * Every parsed spec source (a URL from config.json or window.INITIAL_CONFIG)
 * is cached in localStorage under a key derived from its URL, so revisiting
 * the same spec does not hit the network again. The refresh button in the
 * navbar wipes the cache before forcing a re-fetch.
 */

import { storage } from './storage';

const PREFIX = 'opendoc_spec_cache_v1:';

type CacheEntry = {
    raw: string;
    fetchedAt: number;
};

const cacheKeyFor = (url: string) => `${PREFIX}${url}`;

export const readCachedSpec = (url: string): string | null => {
    const entry = storage.getJSON<CacheEntry | null>(cacheKeyFor(url), null,
        (v) => !!v && typeof v.raw === 'string');
    return entry?.raw ?? null;
};

export const writeCachedSpec = (url: string, raw: string) => {
    const entry: CacheEntry = { raw, fetchedAt: Date.now() };
    storage.setJSON(cacheKeyFor(url), entry);
};

export const clearCachedSpec = (url: string) => {
    storage.remove(cacheKeyFor(url));
};

export const clearAllCachedSpecs = () => {
    storage.clearPrefix(PREFIX);
};

export const getCachedSpecAge = (url: string): number | null => {
    const entry = storage.getJSON<CacheEntry | null>(cacheKeyFor(url), null,
        (v) => !!v && typeof v.raw === 'string');
    return entry?.fetchedAt ?? null;
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
