/**
 * Persistent cache for remote specifications.
 *
 * Freshness is bounded and stale entries are revalidated with ETag or
 * Last-Modified when the server provides either header. Large raw documents
 * are stored in IndexedDB instead of localStorage; localStorage remains a
 * small synchronous fallback for older browsers and first paint.
 */

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

const cacheKeyFor = (url: string) => `${PREFIX}${url}`;
const idbKeyFor = (url: string) => `${IDB_PREFIX}${url}`;
const isEntry = (value: any): value is CacheEntry => !!value && typeof value.raw === 'string' && Number.isFinite(value.fetchedAt);

const readLocalEntry = (url: string): CacheEntry | null => storage.getJSON<CacheEntry | null>(cacheKeyFor(url), null, isEntry);
const writeLocalEntry = (url: string, entry: CacheEntry) => {
    if (new TextEncoder().encode(entry.raw).byteLength <= LOCAL_COPY_LIMIT_BYTES) storage.setJSON(cacheKeyFor(url), entry);
    else storage.remove(cacheKeyFor(url));
};

export const readCachedSpec = (url: string): string | null => readLocalEntry(url)?.raw ?? null;

export const writeCachedSpec = (url: string, raw: string, metadata: Partial<CacheEntry> = {}) => {
    const entry: CacheEntry = {raw, fetchedAt: Date.now(), ...metadata};
    writeLocalEntry(url, entry);
    void idbSet(idbKeyFor(url), entry);
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

/** Fetch with a finite TTL and conditional revalidation. Stale data is used as
 * an offline fallback only after a network failure, never indefinitely without
 * attempting a refresh. */
export const fetchSpecText = async (
    url: string,
    opts: { force?: boolean; maxAgeMs?: number } = {},
): Promise<string> => {
    const maxAgeMs = opts.maxAgeMs ?? DEFAULT_SPEC_CACHE_TTL_MS;
    const local = opts.force ? null : readLocalEntry(url);
    const indexed = opts.force ? null : await idbGet<CacheEntry>(idbKeyFor(url));
    const cached = chooseEntry(local, isEntry(indexed) ? indexed : null);
    if (cached && Date.now() - cached.fetchedAt <= maxAgeMs) return cached.raw;

    const headers: Record<string, string> = {};
    if (cached?.etag) headers['If-None-Match'] = cached.etag;
    if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

    try {
        const response = await fetch(url, {cache: 'no-store', headers});
        if (response.status === 304 && cached) {
            writeCachedSpec(url, cached.raw, {
                etag: response.headers.get('etag') || cached.etag,
                lastModified: response.headers.get('last-modified') || cached.lastModified,
            });
            return cached.raw;
        }
        if (!response.ok) throw new Error(`Failed to fetch ${url} (${response.status})`);
        const raw = await response.text();
        writeCachedSpec(url, raw, {
            etag: response.headers.get('etag') || undefined,
            lastModified: response.headers.get('last-modified') || undefined,
        });
        return raw;
    } catch (error) {
        if (cached) {
            console.warn(`Using stale cached specification for ${url} after revalidation failed.`, error);
            return cached.raw;
        }
        throw error;
    }
};
