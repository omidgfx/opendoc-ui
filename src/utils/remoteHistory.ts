import {storage} from './storage';
import {normalizeRemoteSpecUrl, remoteSpecKey, type RemoteRequestMode} from './remoteSpec';

export interface RemoteHistoryEntry {
    key: string;
    title: string;
    url: string;
    openedAt: number;
    requestMode?: RemoteRequestMode | 'cache';
}

const STORAGE_KEY = 'opendoc_remote_spec_history';
const MAX_ENTRIES = 12;

const isRemoteHistory = (value: unknown): value is RemoteHistoryEntry[] =>
    Array.isArray(value) &&
    value.every(
        entry =>
            !!entry &&
            typeof entry === 'object' &&
            typeof entry.key === 'string' &&
            entry.key.startsWith('remote:') &&
            typeof entry.title === 'string' &&
            typeof entry.url === 'string' &&
            Number.isFinite(entry.openedAt) &&
            (entry.requestMode === undefined ||
                entry.requestMode === 'downloader' ||
                entry.requestMode === 'direct' ||
                entry.requestMode === 'direct-scheme-retry' ||
                entry.requestMode === 'cache'),
    );

const writeRemoteHistory = (entries: RemoteHistoryEntry[]): boolean => storage.setJSON(STORAGE_KEY, entries);

export const readRemoteHistory = (): RemoteHistoryEntry[] => {
    const entries = storage.getJSON<RemoteHistoryEntry[]>(STORAGE_KEY, [], isRemoteHistory);
    const valid: RemoteHistoryEntry[] = [];
    for (const entry of entries) {
        try {
            const url = normalizeRemoteSpecUrl(entry.url);
            valid.push({...entry, key: remoteSpecKey(url), url});
        } catch {
            // Ignore legacy or malformed URLs rather than retaining unusable history.
        }
    }
    return valid.slice(0, MAX_ENTRIES);
};

export const upsertRemoteHistory = (entry: RemoteHistoryEntry): void => {
    const normalized = {...entry, key: remoteSpecKey(entry.url), url: normalizeRemoteSpecUrl(entry.url)};
    const next = [normalized, ...readRemoteHistory().filter(item => item.key !== normalized.key)].slice(0, MAX_ENTRIES);
    writeRemoteHistory(next);
};

export const removeRemoteHistoryEntry = (key: string): void => {
    writeRemoteHistory(readRemoteHistory().filter(entry => entry.key !== key));
};

export const clearRemoteHistory = (): void => {
    writeRemoteHistory([]);
};

export const findRemoteHistoryEntry = (key: string): RemoteHistoryEntry | null =>
    readRemoteHistory().find(entry => entry.key === key) || null;
