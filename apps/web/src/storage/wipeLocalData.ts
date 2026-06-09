// SPDX-License-Identifier: BUSL-1.1

const INDEXED_DB_DATABASES = [
  'finance-sqlite',
  'finance-sqlite-encrypted',
  'finance-encryption',
  'finance-mutation-queue',
  'finance-sync-conflicts',
] as const;

const INDEXED_DB_STORES = [
  { database: 'finance-sqlite', store: 'finance-sqlite' },
  { database: 'finance-sqlite-encrypted', store: 'encrypted' },
  { database: 'finance-encryption', store: 'keys' },
  { database: 'finance-mutation-queue', store: 'mutations' },
  { database: 'finance-sync-conflicts', store: 'conflicts' },
] as const;

const OPFS_DATABASE_FILES = [
  'finance.db',
  'finance.db-wal',
  'finance.db-shm',
  'finance.db-journal',
] as const;

interface OpfsDirectoryHandle {
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

interface StorageWithDirectory {
  getDirectory?: () => Promise<OpfsDirectoryHandle>;
}

declare global {
  interface Window {
    __PLAYWRIGHT_E2E__?: boolean;
    __financeWipeLocalDataForE2E__?: () => Promise<void>;
  }
}

/**
 * Best-effort browser data wipe used after server-confirmed account deletion.
 */
export async function wipeLocalData(): Promise<void> {
  clearStorage(globalThis.localStorage);
  clearStorage(globalThis.sessionStorage);

  await Promise.allSettled([
    deleteIndexedDbDatabases(),
    deleteOpfsDatabaseFiles(),
    unregisterServiceWorkers(),
    deleteAllCaches(),
  ]);
}

function clearStorage(storage: Storage | undefined): void {
  try {
    storage?.clear();
  } catch {
    // Best-effort wipe: continue clearing other browser stores.
  }
}

async function deleteIndexedDbDatabases(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;

  await Promise.allSettled(
    INDEXED_DB_STORES.map(({ database, store }) => clearIndexedDbStore(database, store)),
  );
  await Promise.all(INDEXED_DB_DATABASES.map((name) => deleteIndexedDbDatabase(name)));
}

function clearIndexedDbStore(databaseName: string, storeName: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.close();
          resolve();
          return;
        }

        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          resolve();
        };
      };
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function deleteIndexedDbDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function deleteOpfsDatabaseFiles(): Promise<void> {
  const storage = globalThis.navigator?.storage as unknown as StorageWithDirectory | undefined;
  if (typeof storage?.getDirectory !== 'function') return;

  try {
    const root = await storage.getDirectory();
    await Promise.allSettled(
      OPFS_DATABASE_FILES.map((name) => root.removeEntry(name, { recursive: true })),
    );
  } catch {
    // OPFS is optional and unavailable in jsdom/private contexts.
  }
}

async function unregisterServiceWorkers(): Promise<void> {
  const serviceWorker = globalThis.navigator?.serviceWorker;
  if (typeof serviceWorker?.getRegistrations !== 'function') return;

  try {
    const registrations = await serviceWorker.getRegistrations();
    await Promise.allSettled(registrations.map((registration) => registration.unregister()));
  } catch {
    // Best-effort wipe: service worker APIs can be blocked by browser policy.
  }
}

async function deleteAllCaches(): Promise<void> {
  if (typeof globalThis.caches?.keys !== 'function') return;

  try {
    const cacheNames = await globalThis.caches.keys();
    await Promise.allSettled(cacheNames.map((name) => globalThis.caches.delete(name)));
  } catch {
    // Best-effort wipe: cache APIs can be blocked by browser policy.
  }
}

if (typeof window !== 'undefined' && window.__PLAYWRIGHT_E2E__ === true) {
  window.__financeWipeLocalDataForE2E__ = wipeLocalData;
}
