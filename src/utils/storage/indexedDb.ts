const DB_NAME = 'opendoc-ui';
const DB_VERSION = 1;
const STORE_NAME = 'records';

export interface StoredRecord<T> {
    key: string;
    value: T;
    updatedAt: number;
}

const canUseIndexedDb = () => typeof indexedDB !== 'undefined';
let databasePromise: Promise<IDBDatabase | null> | null = null;

const openDatabase = (): Promise<IDBDatabase | null> => {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise(resolve => {
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
            request.onsuccess = () => {
                const database = request.result;
                database.onversionchange = () => {
                    database.close();
                    databasePromise = null;
                };
                resolve(database);
            };
            request.onerror = () => {
                databasePromise = null;
                resolve(null);
            };
            request.onblocked = () => {
                databasePromise = null;
                resolve(null);
            };
        } catch {
            databasePromise = null;
            resolve(null);
        }
    });
    return databasePromise;
};

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
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
};

export const idbSet = async <T>(key: string, value: T): Promise<boolean> => {
    const db = await openDatabase();
    if (!db) return false;
    return new Promise(resolve => {
        try {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).put({
                key,
                value,
                updatedAt: Date.now(),
            } satisfies StoredRecord<T>);
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => resolve(false);
            transaction.onabort = () => resolve(false);
        } catch {
            resolve(false);
        }
    });
};

export const idbDelete = async (key: string): Promise<boolean> => {
    const db = await openDatabase();
    if (!db) return false;
    return new Promise(resolve => {
        try {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).delete(key);
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => resolve(false);
            transaction.onabort = () => resolve(false);
        } catch {
            resolve(false);
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
            transaction.onabort = () => resolve();
        } catch {
            resolve();
        }
    });
};
