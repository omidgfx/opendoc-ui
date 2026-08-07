import {idbClearPrefix, idbDelete, idbGetAll, idbSet} from './indexedDb';

/**
 * IndexedDB-first synchronous facade. Existing callers can keep their simple
 * get/set API while browser persistence is moved to IndexedDB after the boot
 * hydration step; localStorage remains a compatibility fallback.
 */
const IDB_STORAGE_PREFIX = 'storage:';
const memoryStore = new Map<string, string>();
let storageHydrated = false;
let indexedDbEnabled = false;

export const hydrateStorageFromIndexedDb = async (): Promise<boolean> => {
    if (storageHydrated) return indexedDbEnabled;
    const records = await idbGetAll<string>(IDB_STORAGE_PREFIX);
    if (records === null) {
        storageHydrated = true;
        indexedDbEnabled = false;
        return false;
    }
    indexedDbEnabled = true;
    records.forEach(record => memoryStore.set(String(record.key).slice(IDB_STORAGE_PREFIX.length), record.value));
    // Migrate existing synchronous data once. IndexedDB wins when both stores
    // contain a key, and the local copy is removed only after it is represented
    // in the in-memory/IndexedDB store.
    try {
        const localKeys = Object.keys(window.localStorage);
        for (const key of localKeys) {
            if (key === '__opendoc_storage_test__' || memoryStore.has(key)) {
                try {
                    window.localStorage.removeItem(key);
                } catch { /* fallback */
                }
                continue;
            }
            const value = window.localStorage.getItem(key);
            if (value === null) continue;
            memoryStore.set(key, value);
            const written = await idbSet(`${IDB_STORAGE_PREFIX}${key}`, value);
            if (written) {
                try {
                    window.localStorage.removeItem(key);
                } catch { /* fallback */
                }
            }
        }
    } catch {
        // A blocked localStorage should not prevent the IndexedDB-backed app
        // from starting.
    }
    storageHydrated = true;
    return true;
};

/**
 * Safe browser persistence wrapper.
 *
 * Every read/write in the app goes through this module. After boot hydration,
 * IndexedDB is primary and localStorage is only a compatibility fallback. The
 * facade guarantees that storage failures do not crash the app, corrupt JSON is
 * self-repaired, and global/per-spec state remains namespaced.
 */

const TEST_KEY = '__opendoc_storage_test__';
/** Keep large raw documents out of localStorage. IndexedDB is used by the
 * specification cache; this guard protects the remaining synchronous state. */
const LOCAL_STORAGE_BUDGET_BYTES = 4_500_000;
let lastWriteError: string | null = null;

const byteLength = (value: string): number => {
    try {
        return new TextEncoder().encode(value).byteLength;
    } catch {
        return value.length * 2;
    }
};

const readRaw = (key: string): string | null => {
    if (memoryStore.has(key)) return memoryStore.get(key) || '';
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const currentUsageBytes = (): number => {
    try {
        let total = 0;
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index) || '';
            total += byteLength(key) + byteLength(window.localStorage.getItem(key) || '');
        }
        return total;
    } catch {
        return 0;
    }
};

const writeRaw = (key: string, value: string): boolean => {
    try {
        const previous = window.localStorage.getItem(key) || '';
        const projected = currentUsageBytes() - byteLength(previous) - byteLength(key) + byteLength(value) + byteLength(key);
        if (projected > LOCAL_STORAGE_BUDGET_BYTES) {
            lastWriteError = `Storage budget exceeded (${Math.round(projected / 1024)} KiB requested).`;
            console.warn(`localStorage write skipped for "${key}": ${lastWriteError}`);
            return false;
        }
        window.localStorage.setItem(key, value);
        lastWriteError = null;
        return true;
    } catch (e) {
        lastWriteError = e instanceof Error ? e.message : 'localStorage is unavailable.';
        console.warn(`localStorage write failed for "${key}"`, e);
        return false;
    }
};

const deleteRaw = (key: string) => {
    try {
        window.localStorage.removeItem(key);
    } catch {
        /* ignore */
    }
};

export const storage = {
    /** True when IndexedDB or the localStorage fallback is usable. */
    available(): boolean {
        if (indexedDbEnabled) return true;
        try {
            window.localStorage.setItem(TEST_KEY, '1');
            window.localStorage.removeItem(TEST_KEY);
            return true;
        } catch {
            return false;
        }
    },

    isUsingIndexedDb(): boolean {
        return indexedDbEnabled;
    },

    get(key: string, fallback = ''): string {
        const value = readRaw(key);
        return value === null ? fallback : value;
    },

    set(key: string, value: string): boolean {
        const normalized = String(value);
        if (indexedDbEnabled) {
            memoryStore.set(key, normalized);
            void idbSet(`${IDB_STORAGE_PREFIX}${key}`, normalized).then(written => {
                if (!written) {
                    lastWriteError = 'IndexedDB write failed; using the localStorage fallback.';
                    writeRaw(key, normalized);
                } else {
                    deleteRaw(key);
                }
            });
            return true;
        }
        return writeRaw(key, normalized);
    },

    remove(key: string) {
        void this.removeAsync(key);
    },

    async removeAsync(key: string): Promise<void> {
        memoryStore.delete(key);
        deleteRaw(key);
        if (indexedDbEnabled) await idbDelete(`${IDB_STORAGE_PREFIX}${key}`);
    },

    usageBytes(): number {
        return currentUsageBytes();
    },

    budgetBytes(): number {
        return LOCAL_STORAGE_BUDGET_BYTES;
    },

    lastError(): string | null {
        return lastWriteError;
    },

    /**
     * Read and parse JSON. On any failure (missing, invalid JSON, failed
     * validation) the bad entry is removed and the fallback is returned —
     * this is the self-repair path.
     */
    getJSON<T>(key: string, fallback: T, validate?: (value: any) => boolean): T {
        const raw = readRaw(key);
        if (raw === null) return fallback;
        try {
            const parsed = JSON.parse(raw);
            if (validate && !validate(parsed)) {
                this.remove(key);
                return fallback;
            }
            return parsed as T;
        } catch {
            this.remove(key);
            return fallback;
        }
    },

    setJSON(key: string, value: unknown): boolean {
        try {
            return this.set(key, JSON.stringify(value));
        } catch {
            lastWriteError = 'Unable to serialize value for persistent storage.';
            return false;
        }
    },

    keys(prefix: string): string[] {
        const keys = new Set<string>(memoryStore.keys());
        try {
            Object.keys(window.localStorage).forEach(key => keys.add(key));
        } catch {
            // IndexedDB-backed sessions can work without localStorage.
        }
        return Array.from(keys).filter(key => key.startsWith(prefix));
    },

    async clearPrefix(prefix: string): Promise<void> {
        const keys = this.keys(prefix);
        await Promise.all(keys.map(key => this.removeAsync(key)));
        if (indexedDbEnabled) await idbClearPrefix(`${IDB_STORAGE_PREFIX}${prefix}`);
    },
};

/** Session-only storage for secrets. Unlike localStorage, this is cleared when
 * the browser session ends and is never included in persisted AI profiles. */
export const sessionStore = {
    get(key: string, fallback = ''): string {
        try {
            return window.sessionStorage.getItem(key) ?? fallback;
        } catch {
            return fallback;
        }
    },
    set(key: string, value: string): boolean {
        try {
            window.sessionStorage.setItem(key, value);
            return true;
        } catch {
            return false;
        }
    },
    remove(key: string) {
        try {
            window.sessionStorage.removeItem(key);
        } catch { /* private mode */
        }
    },
    getJSON<T>(key: string, fallback: T): T {
        const raw = this.get(key, '');
        if (!raw) return fallback;
        try {
            return JSON.parse(raw) as T;
        } catch {
            this.remove(key);
            return fallback;
        }
    },
    setJSON(key: string, value: unknown): boolean {
        try {
            return this.set(key, JSON.stringify(value));
        } catch {
            return false;
        }
    },
};

/* ------------------------------------------------------------------ *
 *  Global UI state (not tied to any spec): sidebar, layout, last spec
 * ------------------------------------------------------------------ */

const UI_PREFIX = 'opendoc:ui:';

export const uiStorage = {
    key(name: string) {
        return `${UI_PREFIX}${name}`;
    },
    get(name: string, fallback = ''): string {
        return storage.get(this.key(name), fallback);
    },
    set(name: string, value: string): boolean {
        return storage.set(this.key(name), value);
    },
    getJSON<T>(name: string, fallback: T, validate?: (value: any) => boolean): T {
        return storage.getJSON(this.key(name), fallback, validate);
    },
    setJSON(name: string, value: unknown): boolean {
        return storage.setJSON(this.key(name), value);
    },
    remove(name: string) {
        storage.remove(this.key(name));
    },
    clear(): Promise<void> {
        return storage.clearPrefix(UI_PREFIX);
    },
};

/* ------------------------------------------------------------------ *
 *  Per-spec state: everything that belongs to one spec lives under
 *  `opendoc:spec:<encoded spec key>:<encoded name>` so specs never clash
 *  and orphaned specs can be pruned in one sweep.
 * ------------------------------------------------------------------ */

const SPEC_PREFIX = 'opendoc:spec:';

const encodePart = (value: string) => encodeURIComponent(value);

export const specStorage = {
    key(specKey: string, name: string) {
        return `${SPEC_PREFIX}${encodePart(specKey)}:${encodePart(name)}`;
    },
    get(specKey: string, name: string, fallback = ''): string {
        return storage.get(this.key(specKey, name), fallback);
    },
    set(specKey: string, name: string, value: string): boolean {
        return storage.set(this.key(specKey, name), value);
    },
    getJSON<T>(specKey: string, name: string, fallback: T, validate?: (value: any) => boolean): T {
        return storage.getJSON(this.key(specKey, name), fallback, validate);
    },
    setJSON(specKey: string, name: string, value: unknown): boolean {
        return storage.setJSON(this.key(specKey, name), value);
    },
    remove(specKey: string, name: string): Promise<void> {
        return storage.removeAsync(this.key(specKey, name));
    },
    async clear(specKey: string): Promise<void> {
        const keys = storage.keys(SPEC_PREFIX).filter(key => this.specKeyOf(key) === specKey);
        await Promise.all(keys.map(key => storage.removeAsync(key)));
    },
    clearAll(): Promise<void> {
        return storage.clearPrefix(SPEC_PREFIX);
    },

    /** Encoded spec key stored inside a `opendoc:spec:` key, or null. */
    specKeyOf(storageKey: string): string | null {
        if (!storageKey.startsWith(SPEC_PREFIX)) return null;
        const rest = storageKey.slice(SPEC_PREFIX.length);
        const sep = rest.lastIndexOf(':');
        if (sep <= 0) return null;
        try {
            return decodeURIComponent(rest.slice(0, sep));
        } catch {
            return null;
        }
    },

    /**
     * Self-repair sweep: remove every per-spec entry whose spec no longer
     * exists in the given set of valid keys.
     */
    prune(validSpecKeys: string[]) {
        // specKeyOf() returns decoded keys, so compare against the raw list.
        const valid = new Set(validSpecKeys);
        storage.keys(SPEC_PREFIX).forEach((key) => {
            const specKey = this.specKeyOf(key);
            if (specKey !== null && !valid.has(specKey)) storage.remove(key);
        });
        // Conversation history has a dedicated IndexedDB namespace and is not
        // visible through the synchronous per-spec key sweep.
        void idbGetAll<unknown>('conversations:').then(records => {
            if (!records) return;
            records.forEach(record => {
                const specKey = String(record.key).slice('conversations:'.length);
                if (!valid.has(specKey)) void idbDelete(String(record.key));
            });
        });
    },
};

/* ------------------------------------------------------------------ *
 *  One-time migration from the pre-namespace keys (v0.1.0 era)
 * ------------------------------------------------------------------ */

const MIGRATED_FLAG = 'opendoc:ui:migration_v1_done';

const moveKey = (from: string, to: string) => {
    if (storage.get(to) !== '') return;
    const value = readRaw(from);
    if (value === null) return;
    writeRaw(to, value);
    deleteRaw(from);
};

const migrateSpecKeys = () => {
    // legacy: selected_theme_name_<key>, theme_mode_<key>, preferred_tab_<key>, endpoint_tabs_<key>
    const patterns: Array<{ prefix: string; name: string }> = [
        {prefix: 'selected_theme_name_', name: 'theme'},
        {prefix: 'theme_mode_', name: 'theme_mode'},
        {prefix: 'preferred_tab_', name: 'tab_mode'},
        {prefix: 'endpoint_tabs_', name: 'tabs'},
    ];
    storage.keys('').forEach((legacyKey) => {
        for (const {prefix, name} of patterns) {
            if (!legacyKey.startsWith(prefix)) continue;
            const specKey = legacyKey.slice(prefix.length);
            if (!specKey) continue;
            const target = specStorage.key(specKey, name);
            if (storage.get(target) === '') {
                const value = readRaw(legacyKey);
                if (value !== null) writeRaw(target, value);
            }
            deleteRaw(legacyKey);
            break;
        }
    });
};

/** Run once per browser session; moves legacy keys into the namespaces. */
export const migrateLegacyStorage = () => {
    if (storage.get(MIGRATED_FLAG) === '1') return;
    moveKey('sidebar_collapsed', uiStorage.key('sidebar_collapsed'));
    moveKey('sidebar_width', uiStorage.key('sidebar_width'));
    moveKey('collapsed_tags', uiStorage.key('collapsed_tags'));
    moveKey('selected_parsable_key', uiStorage.key('last_parsable'));
    moveKey('endpoint_split_docs_width', uiStorage.key('endpoint_split_width'));
    migrateSpecKeys();
    storage.set(MIGRATED_FLAG, '1');
};
