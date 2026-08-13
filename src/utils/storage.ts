import {idbClearPrefix, idbDelete, idbGetAll, idbSet} from './indexedDb';

const IDB_STORAGE_PREFIX = 'storage:';
const LOCAL_DELETE_MARKER = '__opendoc_ui_deleted_v1__';
const LOCAL_FALLBACK_PREFIX = '__opendoc_ui_idb_fallback_v2__:';
const TEST_KEY = '__opendoc_storage_test__';
const LOCAL_STORAGE_BUDGET_BYTES = 4500000;
const memoryStore = new Map<string, string>();
const pendingOperations = new Map<string, Promise<void>>();
let storageHydrated = false;
let hydrationPromise: Promise<boolean> | null = null;
let indexedDbEnabled = false;
let lastWriteError: string | null = null;

const LEGACY_EXACT_KEYS = new Set([
    'sidebar_collapsed',
    'sidebar_width',
    'collapsed_tags',
    'selected_parsable_key',
    'endpoint_split_docs_width',
]);
const LEGACY_KEY_PREFIXES = ['selected_theme_name_', 'theme_mode_', 'preferred_tab_', 'endpoint_tabs_'];
const isOpenDocOwnedKey = (key: string): boolean =>
    key.startsWith('opendoc') ||
    key.startsWith('__opendoc_') ||
    LEGACY_EXACT_KEYS.has(key) ||
    LEGACY_KEY_PREFIXES.some(prefix => key.startsWith(prefix));

const byteLength = (value: string): number => {
    try {
        return new TextEncoder().encode(value).byteLength;
    } catch {
        return value.length * 2;
    }
};

const decodeLocalValue = (value: string | null): string | null => {
    if (value === null || value === LOCAL_DELETE_MARKER) return null;
    return value.startsWith(LOCAL_FALLBACK_PREFIX) ? value.slice(LOCAL_FALLBACK_PREFIX.length) : value;
};

const localKeys = (): string[] => {
    try {
        return Object.keys(window.localStorage).filter(isOpenDocOwnedKey);
    } catch {
        return [];
    }
};

const readLocalRaw = (key: string): string | null => {
    try {
        return decodeLocalValue(window.localStorage.getItem(key));
    } catch {
        return null;
    }
};

const deleteLocalRaw = (key: string): void => {
    try {
        window.localStorage.removeItem(key);
    } catch {}
};

const currentLocalUsageBytes = (): number => {
    try {
        let total = 0;
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index) || '';
            if (!isOpenDocOwnedKey(key)) continue;
            total += byteLength(key) + byteLength(window.localStorage.getItem(key) || '');
        }
        return total;
    } catch {
        return 0;
    }
};

const writeLocalRaw = (key: string, value: string): boolean => {
    try {
        const previous = window.localStorage.getItem(key) || '';
        const projected = currentLocalUsageBytes() - byteLength(previous) + byteLength(value);
        if (projected > LOCAL_STORAGE_BUDGET_BYTES) {
            lastWriteError = `Fallback storage budget exceeded (${Math.round(projected / 1024)} KiB requested).`;
            console.warn(`localStorage fallback write skipped for "${key}": ${lastWriteError}`);
            return false;
        }
        window.localStorage.setItem(key, value);
        lastWriteError = null;
        return true;
    } catch (error) {
        lastWriteError = error instanceof Error ? error.message : 'The localStorage fallback is unavailable.';
        console.warn(`localStorage fallback write failed for "${key}"`, error);
        return false;
    }
};

const queueIndexedDbOperation = (
    key: string,
    operation: () => Promise<boolean>,
    onFailure: () => boolean,
): Promise<void> => {
    const previous = pendingOperations.get(key) || Promise.resolve();
    const next = previous
        .catch(() => undefined)
        .then(async () => {
            const succeeded = await operation();
            if (succeeded) {
                deleteLocalRaw(key);
                lastWriteError = null;
                return;
            }
            const fallbackWritten = onFailure();
            lastWriteError = fallbackWritten
                ? 'IndexedDB write failed; the emergency localStorage fallback is being used.'
                : 'IndexedDB write failed and the emergency localStorage fallback is unavailable.';
        });
    pendingOperations.set(key, next);
    void next.finally(() => {
        if (pendingOperations.get(key) === next) pendingOperations.delete(key);
    });
    return next;
};

const hydrate = async (): Promise<boolean> => {
    const records = await idbGetAll<string>(IDB_STORAGE_PREFIX);
    if (records === null) {
        storageHydrated = true;
        indexedDbEnabled = false;
        return false;
    }

    indexedDbEnabled = true;
    records.forEach(record => memoryStore.set(String(record.key).slice(IDB_STORAGE_PREFIX.length), record.value));

    // One-time migration from older builds. Their localStorage mirror was
    // synchronous, so migrate its latest value before removing that mirror.
    for (const key of localKeys()) {
        let stored: string | null = null;
        try {
            stored = window.localStorage.getItem(key);
        } catch {
            continue;
        }
        if (stored === LOCAL_DELETE_MARKER) {
            memoryStore.delete(key);
            if (await idbDelete(`${IDB_STORAGE_PREFIX}${key}`)) deleteLocalRaw(key);
            continue;
        }
        if (stored === null) continue;
        const value = decodeLocalValue(stored);
        if (value === null) continue;
        memoryStore.set(key, value);
        if (await idbSet(`${IDB_STORAGE_PREFIX}${key}`, value)) deleteLocalRaw(key);
    }

    storageHydrated = true;
    return true;
};

export const hydrateStorageFromIndexedDb = (): Promise<boolean> => {
    if (storageHydrated) return Promise.resolve(indexedDbEnabled);
    if (!hydrationPromise) hydrationPromise = hydrate().finally(() => (hydrationPromise = null));
    return hydrationPromise;
};

const readRaw = (key: string): string | null => {
    if (memoryStore.has(key)) return memoryStore.get(key) ?? '';
    if (indexedDbEnabled) return null;
    return readLocalRaw(key);
};

const currentUsageBytes = (): number => {
    if (!indexedDbEnabled) return currentLocalUsageBytes();
    let total = 0;
    memoryStore.forEach((value, key) => {
        total += byteLength(key) + byteLength(value);
    });
    return total;
};

export const storage = {
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
        if (!indexedDbEnabled) return writeLocalRaw(key, normalized);
        memoryStore.set(key, normalized);
        void queueIndexedDbOperation(
            key,
            () => idbSet(`${IDB_STORAGE_PREFIX}${key}`, normalized),
            () => writeLocalRaw(key, `${LOCAL_FALLBACK_PREFIX}${normalized}`),
        );
        return true;
    },
    remove(key: string) {
        void this.removeAsync(key);
    },
    async removeAsync(key: string): Promise<void> {
        memoryStore.delete(key);
        if (!indexedDbEnabled) {
            deleteLocalRaw(key);
            return;
        }
        await queueIndexedDbOperation(
            key,
            () => idbDelete(`${IDB_STORAGE_PREFIX}${key}`),
            () => writeLocalRaw(key, LOCAL_DELETE_MARKER),
        );
    },
    usageBytes(): number {
        return currentUsageBytes();
    },
    budgetBytes(): number {
        return indexedDbEnabled ? Number.MAX_SAFE_INTEGER : LOCAL_STORAGE_BUDGET_BYTES;
    },
    lastError(): string | null {
        return lastWriteError;
    },
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
        if (!indexedDbEnabled) localKeys().forEach(key => keys.add(key));
        return Array.from(keys).filter(key => key.startsWith(prefix) && readRaw(key) !== null);
    },
    async clearPrefix(prefix: string): Promise<void> {
        const keys = this.keys(prefix);
        await Promise.all(keys.map(key => this.removeAsync(key)));
        if (indexedDbEnabled) await idbClearPrefix(`${IDB_STORAGE_PREFIX}${prefix}`);
    },
};

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
        } catch {}
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
    prune(validSpecKeys: string[]) {
        const valid = new Set(validSpecKeys);
        storage.keys(SPEC_PREFIX).forEach(key => {
            const specKey = this.specKeyOf(key);
            if (specKey !== null && !valid.has(specKey)) storage.remove(key);
        });
        void idbGetAll<unknown>('conversations:').then(records => {
            if (!records) return;
            records.forEach(record => {
                const specKey = String(record.key).slice('conversations:'.length);
                if (!valid.has(specKey)) void idbDelete(String(record.key));
            });
        });
    },
};
const MIGRATED_FLAG = 'opendoc:ui:migration_v1_done';
const moveKey = (from: string, to: string) => {
    if (storage.get(to) !== '') return;
    const value = readRaw(from);
    if (value === null) return;
    storage.set(to, value);
    storage.remove(from);
};
const migrateSpecKeys = () => {
    const patterns: Array<{
        prefix: string;
        name: string;
    }> = [
        {prefix: 'selected_theme_name_', name: 'theme'},
        {prefix: 'theme_mode_', name: 'theme_mode'},
        {prefix: 'preferred_tab_', name: 'tab_mode'},
        {prefix: 'endpoint_tabs_', name: 'tabs'},
    ];
    storage.keys('').forEach(legacyKey => {
        for (const {prefix, name} of patterns) {
            if (!legacyKey.startsWith(prefix)) continue;
            const specKey = legacyKey.slice(prefix.length);
            if (!specKey) continue;
            const target = specStorage.key(specKey, name);
            if (storage.get(target) === '') {
                const value = readRaw(legacyKey);
                if (value !== null) storage.set(target, value);
            }
            storage.remove(legacyKey);
            break;
        }
    });
};
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
