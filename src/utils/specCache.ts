import {storage} from './storage';
import {idbClearPrefix, idbDelete, idbGet, idbSet} from './indexedDb';

const PREFIX = 'opendoc_spec_cache_v2:';
const IDB_PREFIX = 'spec:';
export const DEFAULT_SPEC_CACHE_TTL_MS = 5 * 60 * 1000;
const LOCAL_COPY_LIMIT_BYTES = 256 * 1024;

type CacheEntry = {
    raw: string;
    fetchedAt: number;
    etag?: string;
    lastModified?: string;
};

export type SpecFreshness = 'network' | 'cache' | 'revalidated' | 'stale';

export interface FetchSpecResult<T = undefined> {
    raw: string;
    parsed?: T;
    sourceUri: string;
    fetchedAt: number;
    freshness: SpecFreshness;
    refreshError?: string;
    etag?: string;
    lastModified?: string;
}

const cacheKeyFor = (url: string) => `${PREFIX}${url}`;
const idbKeyFor = (url: string) => `${IDB_PREFIX}${url}`;
const isEntry = (value: any): value is CacheEntry =>
    !!value && typeof value.raw === 'string' && Number.isFinite(value.fetchedAt);
const readLocalEntry = (url: string): CacheEntry | null =>
    storage.getJSON<CacheEntry | null>(cacheKeyFor(url), null, isEntry);
const writeLocalEntry = (url: string, entry: CacheEntry) => {
    if (new TextEncoder().encode(entry.raw).byteLength <= LOCAL_COPY_LIMIT_BYTES)
        storage.setJSON(cacheKeyFor(url), entry);
    else storage.remove(cacheKeyFor(url));
};
const commitValidatedEntry = (url: string, entry: CacheEntry) => {
    writeLocalEntry(url, entry);
    void idbSet(idbKeyFor(url), entry);
};

export const readCachedSpec = (url: string): string | null => readLocalEntry(url)?.raw ?? null;
export const writeCachedSpec = (url: string, raw: string, metadata: Partial<CacheEntry> = {}) => {
    const entry: CacheEntry = {raw, fetchedAt: Date.now(), ...metadata};
    commitValidatedEntry(url, entry);
};
export const clearCachedSpec = async (url: string): Promise<void> => {
    await storage.removeAsync(cacheKeyFor(url));
    await idbDelete(idbKeyFor(url));
};
export const clearAllCachedSpecs = async (): Promise<void> => {
    await storage.clearPrefix(PREFIX);
    await idbClearPrefix(IDB_PREFIX);
};
export const getCachedSpecAge = (url: string): number | null => readLocalEntry(url)?.fetchedAt ?? null;

const chooseEntry = (local: CacheEntry | null, indexed: CacheEntry | null): CacheEntry | null => {
    if (!local) return indexed;
    if (!indexed) return local;
    return indexed.fetchedAt >= local.fetchedAt ? indexed : local;
};

const resultFromEntry = <T>(
    url: string,
    entry: CacheEntry,
    freshness: SpecFreshness,
    parsed?: T,
    refreshError?: string,
): FetchSpecResult<T> => ({
    raw: entry.raw,
    parsed,
    sourceUri: url,
    fetchedAt: entry.fetchedAt,
    freshness,
    refreshError,
    etag: entry.etag,
    lastModified: entry.lastModified,
});

/**
 * Fetch and optionally parse/validate before committing a new last-known-good
 * cache entry. If validation or revalidation fails, a previous validated entry
 * remains available and is returned as stale.
 */
export const fetchSpec = async <T = undefined>(
    url: string,
    opts: {
        force?: boolean;
        maxAgeMs?: number;
        validate?: (raw: string) => T | Promise<T>;
    } = {},
): Promise<FetchSpecResult<T>> => {
    const maxAgeMs = opts.maxAgeMs ?? DEFAULT_SPEC_CACHE_TTL_MS;
    // Even a forced request may fall back to the previous entry. `force`
    // bypasses freshness and validators, but does not discard resilience.
    const local = readLocalEntry(url);
    const indexed = await idbGet<CacheEntry>(idbKeyFor(url));
    const cached = chooseEntry(local, isEntry(indexed) ? indexed : null);

    if (!opts.force && cached && Date.now() - cached.fetchedAt <= maxAgeMs) {
        try {
            const parsed = opts.validate ? await opts.validate(cached.raw) : undefined;
            return resultFromEntry(url, cached, 'cache', parsed as T | undefined);
        } catch {
            // A legacy/unvalidated cache entry must not become the active spec.
            await clearCachedSpec(url);
        }
    }

    const headers: Record<string, string> = {};
    if (!opts.force && cached?.etag) headers['If-None-Match'] = cached.etag;
    if (!opts.force && cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

    try {
        const response = await fetch(url, {cache: 'no-store', headers});
        if (response.status === 304 && cached) {
            const parsed = opts.validate ? await opts.validate(cached.raw) : undefined;
            const entry: CacheEntry = {
                ...cached,
                fetchedAt: Date.now(),
                etag: response.headers.get('etag') || cached.etag,
                lastModified: response.headers.get('last-modified') || cached.lastModified,
            };
            commitValidatedEntry(url, entry);
            return resultFromEntry(url, entry, 'revalidated', parsed as T | undefined);
        }
        if (!response.ok) throw new Error(`Failed to fetch ${url} (${response.status})`);
        const raw = await response.text();
        // Parse and validate before replacing the last-known-good entry.
        const parsed = opts.validate ? await opts.validate(raw) : undefined;
        const entry: CacheEntry = {
            raw,
            fetchedAt: Date.now(),
            etag: response.headers.get('etag') || undefined,
            lastModified: response.headers.get('last-modified') || undefined,
        };
        commitValidatedEntry(url, entry);
        return resultFromEntry(url, entry, 'network', parsed as T | undefined);
    } catch (error) {
        if (cached) {
            // Validate the fallback too. If it is corrupt, expose the original
            // failure rather than pretending stale data is safe.
            const parsed = opts.validate ? await opts.validate(cached.raw) : undefined;
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`Using stale cached specification for ${url} after refresh failed.`, error);
            return resultFromEntry(url, cached, 'stale', parsed as T | undefined, message);
        }
        throw error;
    }
};

/** Backward-compatible text API. New loaders should use `fetchSpec`. */
export const fetchSpecText = async (
    url: string,
    opts: {
        force?: boolean;
        maxAgeMs?: number;
    } = {},
): Promise<string> => (await fetchSpec(url, opts)).raw;
