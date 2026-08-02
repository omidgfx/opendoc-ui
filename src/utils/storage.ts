/**
 * Safe localStorage wrapper.
 *
 * Every read/write in the app should go through this module instead of touching
 * localStorage directly. It guarantees:
 *   - nothing ever throws (storage can be blocked, full, or disabled in private
 *     mode — a raw getItem/setItem call there crashes the whole app),
 *   - corrupt JSON entries are detected, removed and replaced by a fallback
 *     (self-repair), optionally validated against an expected shape,
 *   - global UI state and per-spec state live under their own namespaces so a
 *     spec's data never collides with another's.
 */

const TEST_KEY = '__opendoc_storage_test__';

const readRaw = (key: string): string | null => {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const writeRaw = (key: string, value: string) => {
    try {
        window.localStorage.setItem(key, value);
    } catch (e) {
        console.warn(`localStorage write failed for "${key}"`, e);
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
    /** True when localStorage is actually usable in this browser session. */
    available(): boolean {
        try {
            window.localStorage.setItem(TEST_KEY, '1');
            window.localStorage.removeItem(TEST_KEY);
            return true;
        } catch {
            return false;
        }
    },

    get(key: string, fallback = ''): string {
        const value = readRaw(key);
        return value === null ? fallback : value;
    },

    set(key: string, value: string) {
        writeRaw(key, String(value));
    },

    remove(key: string) {
        deleteRaw(key);
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
                deleteRaw(key);
                return fallback;
            }
            return parsed as T;
        } catch {
            deleteRaw(key);
            return fallback;
        }
    },

    setJSON(key: string, value: unknown) {
        writeRaw(key, JSON.stringify(value));
    },

    keys(prefix: string): string[] {
        try {
            return Object.keys(window.localStorage).filter((k) => k.startsWith(prefix));
        } catch {
            return [];
        }
    },

    clearPrefix(prefix: string) {
        this.keys(prefix).forEach((k) => deleteRaw(k));
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
    set(name: string, value: string) {
        storage.set(this.key(name), value);
    },
    getJSON<T>(name: string, fallback: T, validate?: (value: any) => boolean): T {
        return storage.getJSON(this.key(name), fallback, validate);
    },
    setJSON(name: string, value: unknown) {
        storage.setJSON(this.key(name), value);
    },
    remove(name: string) {
        storage.remove(this.key(name));
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
    set(specKey: string, name: string, value: string) {
        storage.set(this.key(specKey, name), value);
    },
    getJSON<T>(specKey: string, name: string, fallback: T, validate?: (value: any) => boolean): T {
        return storage.getJSON(this.key(specKey, name), fallback, validate);
    },
    setJSON(specKey: string, name: string, value: unknown) {
        storage.setJSON(this.key(specKey, name), value);
    },
    remove(specKey: string, name: string) {
        storage.remove(this.key(specKey, name));
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
        { prefix: 'selected_theme_name_', name: 'theme' },
        { prefix: 'theme_mode_', name: 'theme_mode' },
        { prefix: 'preferred_tab_', name: 'tab_mode' },
        { prefix: 'endpoint_tabs_', name: 'tabs' },
    ];
    storage.keys('').forEach((legacyKey) => {
        for (const { prefix, name } of patterns) {
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
