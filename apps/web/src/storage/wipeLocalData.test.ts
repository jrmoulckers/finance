// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { wipeLocalData } from './wipeLocalData';

const INDEXED_DB_DATABASES = [
  'finance-sqlite',
  'finance-sqlite-encrypted',
  'finance-encryption',
  'finance-mutation-queue',
  'finance-sync-conflicts',
] as const;

function openDatabase(name: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function hasObjectStore(name: string, storeName: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onsuccess = () => {
      const db = request.result;
      const hasStore = db.objectStoreNames.contains(storeName);
      db.close();
      resolve(hasStore);
    };
    request.onerror = () => reject(request.error);
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

describe('wipeLocalData', () => {
  beforeEach(async () => {
    localStorage.setItem('finance:test', 'local');
    sessionStorage.setItem('finance:test', 'session');

    await Promise.all(
      INDEXED_DB_DATABASES.map(async (name) => {
        const db = await openDatabase(name, `${name}-store`);
        db.close();
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    localStorage.clear();
    sessionStorage.clear();
    await Promise.all(INDEXED_DB_DATABASES.map((name) => deleteDatabase(name)));
  });

  it('clears browser storage, IndexedDB stores, service workers, and caches', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi.fn().mockResolvedValue([{ unregister }]);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations },
    });

    const cachesDelete = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['app-cache', 'assets-cache']),
      delete: cachesDelete,
    });

    const outcomes = await wipeLocalData();

    expect(outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ area: 'local-storage', status: 'deleted' }),
        expect.objectContaining({ area: 'session-storage', status: 'deleted' }),
        expect.objectContaining({ area: 'indexeddb', status: 'deleted' }),
        expect.objectContaining({ area: 'service-workers', status: 'deleted' }),
        expect.objectContaining({ area: 'caches', status: 'deleted' }),
      ]),
    );
    expect(localStorage.getItem('finance:test')).toBeNull();
    expect(sessionStorage.getItem('finance:test')).toBeNull();
    expect(getRegistrations).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(cachesDelete).toHaveBeenCalledWith('app-cache');
    expect(cachesDelete).toHaveBeenCalledWith('assets-cache');

    for (const name of INDEXED_DB_DATABASES) {
      await expect(hasObjectStore(name, `${name}-store`)).resolves.toBe(false);
    }
  });
});
