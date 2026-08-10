export type LocalHistoryEntry = {
    key: string;
    title: string;
    fileName: string;
    raw: string;
    bundle?: Record<string, string>;
    openedAt: number;
};
const STORAGE_KEY = 'opendoc_local_history';
const MAX_ENTRIES = 12;
const MAX_RAW_BYTES = 2000000;
import {storage} from './storage';

export const readLocalHistory = (): LocalHistoryEntry[] => {
    const parsed = storage.getJSON<LocalHistoryEntry[]>(
        STORAGE_KEY,
        [],
        v =>
            Array.isArray(v) &&
            v.every(
                e =>
                    e &&
                    typeof e === 'object' &&
                    typeof e.key === 'string' &&
                    typeof e.title === 'string' &&
                    typeof e.fileName === 'string' &&
                    typeof e.raw === 'string' &&
                    (e.bundle === undefined ||
                        (e.bundle &&
                            typeof e.bundle === 'object' &&
                            !Array.isArray(e.bundle) &&
                            Object.values(e.bundle).every(value => typeof value === 'string'))) &&
                    Number.isFinite(e.openedAt),
            ),
    );
    return parsed.slice(0, MAX_ENTRIES);
};
const writeLocalHistory = (list: LocalHistoryEntry[]): boolean => storage.setJSON(STORAGE_KEY, list);
export const upsertLocalHistory = (entry: LocalHistoryEntry) => {
    const bundleSize = Object.values(entry.bundle || {}).reduce((total, raw) => total + raw.length, 0);
    const safeEntry = bundleSize > MAX_RAW_BYTES ? {...entry, bundle: undefined} : entry;
    const list = readLocalHistory();
    const rest = list.filter(e => e.key !== safeEntry.key);
    let next = [safeEntry, ...rest].slice(0, MAX_ENTRIES);
    while (next.length > 1 && !writeLocalHistory(next)) next = next.slice(0, -1);
    if (next.length === 1) writeLocalHistory(next);
};
export const removeLocalHistoryEntry = (key: string) => {
    writeLocalHistory(readLocalHistory().filter(e => e.key !== key));
};
export const clearLocalHistory = () => {
    writeLocalHistory([]);
};
export const findLocalHistoryEntry = (key: string): LocalHistoryEntry | null =>
    readLocalHistory().find(e => e.key === key) || null;
export const shouldStoreRaw = (raw: string) => raw.length <= MAX_RAW_BYTES;
