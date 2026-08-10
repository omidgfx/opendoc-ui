const DB_NAME = 'opendoc-ui';
const DB_VERSION = 1;
const STORE_NAME = 'records';

interface StoredRecord<T> {
    key: string;
    value: T;
    updatedAt: number;
}

const canUseIndexedDb = () => typeof indexedDB !== 'undefined';
const openDatabase = (): Promise<IDBDatabase | null> =>
    new Promise(resolve => {
        if (!canUseIndexedDb()) {
            resolve(null);
            return;
        }
        try {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(STORE_NAME))
                    request.result.createObjectStore(STORE_NAME, {keyPath: 'key'});
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
export const idbGet = async <T>(key: string): Promise<T | null> => {
    const db = await openDatabase();
    if (!db) return null;
    return new Promise(resolve => {
        try {
            const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
            request.onsuccess = () => resolve((request.result as StoredRecord<T> | undefined)?.value ?? null);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
};
export const idbGetAll = async <T = unknown>(prefix = ''): Promise<Array<StoredRecord<T>> | null> => {
    const db = await openDatabase();
    if (!db) return null;
    return new Promise(resolve => {
        try {
            const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
            request.onsuccess = () =>
                resolve((request.result as StoredRecord<T>[]).filter(record => String(record.key).startsWith(prefix)));
            request.onerror = () => resolve([]);
        } catch {
            resolve([]);
        }
    });
};
export const idbSet = async <T>(key: string, value: T): Promise<boolean> => {
    const db = await openDatabase();
    if (!db) return false;
    return new Promise(resolve => {
        try {
            const request = db
                .transaction(STORE_NAME, 'readwrite')
                .objectStore(STORE_NAME)
                .put({
                    key,
                    value,
                    updatedAt: Date.now(),
                } satisfies StoredRecord<T>);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        } catch {
            resolve(false);
        }
    });
};
export const idbDelete = async (key: string): Promise<void> => {
    const db = await openDatabase();
    if (!db) return;
    await new Promise<void>(resolve => {
        try {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).delete(key);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => resolve();
            transaction.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
};
export const idbClearPrefix = async (prefix: string): Promise<void> => {
    const db = await openDatabase();
    if (!db) return;
    await new Promise<void>(resolve => {
        try {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.openCursor();
            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) return;
                if (String(cursor.key).startsWith(prefix)) cursor.delete();
                cursor.continue();
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => resolve();
        } catch {
            resolve();
        }
    });
};
