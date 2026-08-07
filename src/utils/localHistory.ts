/**
 * History of specifications opened from the local disk (local mode only).
 *
 * When the app is running without a config.json / window.INITIAL_CONFIG the
 * user can open JSON or YAML files from their machine. Everything opened this
 * way is recorded here so it can be re-opened later from the specification
 * selector modal, even after a page reload. The storage facade uses IndexedDB
 * first and falls back to localStorage when necessary.
 */

export type LocalHistoryEntry = {
    key: string;
    title: string;
    fileName: string;
    raw: string;
    openedAt: number;
};

const STORAGE_KEY = 'opendoc_local_history';
const MAX_ENTRIES = 12;
const MAX_RAW_BYTES = 2_000_000;

import {storage} from './storage';

export const readLocalHistory = (): LocalHistoryEntry[] => {
    const parsed = storage.getJSON<LocalHistoryEntry[]>(STORAGE_KEY, [],
        (v) => Array.isArray(v) && v.every((e) =>
            e
            && typeof e === 'object'
            && typeof e.key === 'string'
            && typeof e.title === 'string'
            && typeof e.fileName === 'string'
            && typeof e.raw === 'string'
            && Number.isFinite(e.openedAt)
        ));
    return parsed.slice(0, MAX_ENTRIES);
};

const writeLocalHistory = (list: LocalHistoryEntry[]): boolean => storage.setJSON(STORAGE_KEY, list);

export const upsertLocalHistory = (entry: LocalHistoryEntry) => {
    const list = readLocalHistory();
    const rest = list.filter((e) => e.key !== entry.key);
    let next = [entry, ...rest].slice(0, MAX_ENTRIES);
    // If quota is tight, progressively discard the oldest history entries and
    // report the failure instead of pretending the write succeeded.
    while (next.length > 1 && !writeLocalHistory(next)) next = next.slice(0, -1);
    if (next.length === 1) writeLocalHistory(next);
};

export const removeLocalHistoryEntry = (key: string) => {
    writeLocalHistory(readLocalHistory().filter((e) => e.key !== key));
};

export const clearLocalHistory = () => {
    writeLocalHistory([]);
};

export const findLocalHistoryEntry = (key: string): LocalHistoryEntry | null =>
    readLocalHistory().find((e) => e.key === key) || null;

export const shouldStoreRaw = (raw: string) => raw.length <= MAX_RAW_BYTES;
