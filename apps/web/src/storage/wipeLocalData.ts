// SPDX-License-Identifier: BUSL-1.1

import {
  localWipeOutcome,
  type LocalWipeOutcome,
  type LocalWipeStatus,
} from '../lib/security/local-wipe-verification';

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
    __financeWipeLocalDataForE2E__?: () => Promise<LocalWipeOutcome[]>;
  }
}

/**
 * Best-effort browser data wipe used after server-confirmed account deletion.
 */
export async function wipeLocalData(): Promise<LocalWipeOutcome[]> {
  const localStorageOutcome = clearStorage(globalThis.localStorage, 'local-storage');
  const sessionStorageOutcome = clearStorage(globalThis.sessionStorage, 'session-storage');
  const [indexedDbOutcome, opfsOutcome, serviceWorkersOutcome, cachesOutcome] = await Promise.all([
    deleteIndexedDbDatabases(),
    deleteOpfsDatabaseFiles(),
    unregisterServiceWorkers(),
    deleteAllCaches(),
  ]);

  return [
    opfsOutcome,
    indexedDbOutcome,
    cachesOutcome,
    serviceWorkersOutcome,
    localStorageOutcome,
    sessionStorageOutcome,
    deriveLocalWipeOutcome('sync-queues', indexedDbOutcome),
    deriveLocalWipeOutcome('audit-log', localStorageOutcome),
    deriveLocalWipeOutcome('consent-records', localStorageOutcome),
  ];
}

function clearStorage(
  storage: Storage | undefined,
  area: LocalWipeOutcome['area'],
): LocalWipeOutcome {
  if (!storage) return localWipeOutcome(area, 'not_applicable');
  try {
    storage.clear();
    return localWipeOutcome(area, 'deleted');
  } catch (error) {
    return localWipeOutcome(
      area,
      'failed',
      error instanceof Error ? error.message : 'Storage clear failed.',
    );
  }
}

function deriveLocalWipeOutcome(
  area: LocalWipeOutcome['area'],
  source: LocalWipeOutcome,
): LocalWipeOutcome {
  const status: LocalWipeStatus = source.status === 'failed' ? 'failed' : source.status;
  return localWipeOutcome(area, status, source.status === 'failed' ? source.detail : undefined);
}

async function deleteIndexedDbDatabases(): Promise<LocalWipeOutcome> {
  if (typeof indexedDB === 'undefined') return localWipeOutcome('indexeddb', 'not_applicable');

  try {
    await Promise.allSettled(
      INDEXED_DB_STORES.map(({ database, store }) =>
        resolveAfterTimeout(clearIndexedDbStore(database, store)),
      ),
    );
    await Promise.all(
      INDEXED_DB_DATABASES.map((name) => resolveAfterTimeout(deleteIndexedDbDatabase(name))),
    );
    return localWipeOutcome('indexeddb', 'deleted');
  } catch (error) {
    return localWipeOutcome(
      'indexeddb',
      'failed',
      error instanceof Error ? error.message : 'IndexedDB wipe failed.',
    );
  }
}

function resolveAfterTimeout(promise: Promise<void>, timeoutMs = 2_000): Promise<void> {
  return new Promise((resolve) => {
    const timeoutId = globalThis.setTimeout(resolve, timeoutMs);
    promise.then(resolve, resolve).finally(() => {
      globalThis.clearTimeout(timeoutId);
    });
  });
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

async function deleteOpfsDatabaseFiles(): Promise<LocalWipeOutcome> {
  const storage = globalThis.navigator?.storage as unknown as StorageWithDirectory | undefined;
  if (typeof storage?.getDirectory !== 'function')
    return localWipeOutcome('opfs', 'not_applicable');

  try {
    const root = await storage.getDirectory();
    await Promise.allSettled(
      OPFS_DATABASE_FILES.map((name) => root.removeEntry(name, { recursive: true })),
    );
    return localWipeOutcome('opfs', 'deleted');
  } catch (error) {
    return localWipeOutcome(
      'opfs',
      'failed',
      error instanceof Error ? error.message : 'OPFS wipe failed.',
    );
  }
}

async function unregisterServiceWorkers(): Promise<LocalWipeOutcome> {
  const serviceWorker = globalThis.navigator?.serviceWorker;
  if (typeof serviceWorker?.getRegistrations !== 'function')
    return localWipeOutcome('service-workers', 'not_applicable');

  try {
    const registrations = await serviceWorker.getRegistrations();
    const results = await Promise.allSettled(
      registrations.map((registration) => registration.unregister()),
    );
    const failed = results.some((result) => result.status === 'rejected' || result.value === false);
    return localWipeOutcome(
      'service-workers',
      failed ? 'failed' : 'deleted',
      failed ? 'One or more service workers could not be unregistered.' : undefined,
    );
  } catch (error) {
    return localWipeOutcome(
      'service-workers',
      'failed',
      error instanceof Error ? error.message : 'Service worker wipe failed.',
    );
  }
}

async function deleteAllCaches(): Promise<LocalWipeOutcome> {
  if (
    typeof globalThis.caches?.keys !== 'function' ||
    typeof globalThis.caches.delete !== 'function'
  ) {
    return localWipeOutcome('caches', 'not_applicable');
  }

  try {
    const cacheNames = await globalThis.caches.keys();
    const results = await Promise.allSettled(
      cacheNames.map((name) => globalThis.caches.delete(name)),
    );
    const failed = results.some((result) => result.status === 'rejected' || result.value === false);
    return localWipeOutcome(
      'caches',
      failed ? 'failed' : 'deleted',
      failed ? 'One or more browser caches could not be deleted.' : undefined,
    );
  } catch (error) {
    return localWipeOutcome(
      'caches',
      'failed',
      error instanceof Error ? error.message : 'Cache wipe failed.',
    );
  }
}

if (typeof window !== 'undefined' && window.__PLAYWRIGHT_E2E__ === true) {
  window.__financeWipeLocalDataForE2E__ = wipeLocalData;
}
