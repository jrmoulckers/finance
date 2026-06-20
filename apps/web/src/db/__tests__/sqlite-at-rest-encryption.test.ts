// SPDX-License-Identifier: BUSL-1.1

import { afterEach, describe, expect, it } from 'vitest';

import {
  __sqliteAtRestEncryptionForTesting,
  clearSqliteAtRestEncryptionStores,
  isSqliteAtRestEncryptionEnabled,
} from '../sqlite-at-rest-encryption';
import { __sqliteIndexedDbPersistenceForTesting } from '../sqlite-wasm';

const DB_NAME = 'finance.db';
const PLAINTEXT_DB_NAME = 'finance-sqlite';
const PLAINTEXT_STORE_NAME = 'finance-sqlite';
const PLAINTEXT_KEY = `${DB_NAME}:db`;

const sampleDbBytes = new TextEncoder().encode('SQLite format 3\0\naccounts: checking=12345');

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function readPlaintextSnapshot(): Promise<ArrayBuffer | undefined> {
  const db = await openDatabase(PLAINTEXT_DB_NAME, PLAINTEXT_STORE_NAME);
  try {
    return readStoreValue<ArrayBuffer>(db, PLAINTEXT_STORE_NAME, PLAINTEXT_KEY);
  } finally {
    db.close();
  }
}

async function readEncryptedSnapshot(): Promise<unknown> {
  const { encryptedDbName, encryptedStoreName, encryptedDbKey } =
    __sqliteAtRestEncryptionForTesting;
  const db = await openDatabase(encryptedDbName, encryptedStoreName);
  try {
    return readStoreValue(db, encryptedStoreName, encryptedDbKey);
  } finally {
    db.close();
  }
}

async function openDatabase(databaseName: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readStoreValue<T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error);
  });
}

describe('SQLite IndexedDB encryption-at-rest wiring', () => {
  afterEach(async () => {
    localStorage.removeItem(__sqliteAtRestEncryptionForTesting.flagOverrideKey);
    await clearSqliteAtRestEncryptionStores();
    await deleteDatabase(PLAINTEXT_DB_NAME);
  });

  it('keeps the opt-in feature flag off by default', async () => {
    expect(isSqliteAtRestEncryptionEnabled()).toBe(false);

    await __sqliteIndexedDbPersistenceForTesting.persistToIndexedDB(DB_NAME, sampleDbBytes);

    expect(await readEncryptedSnapshot()).toBeUndefined();
    const plaintext = await readPlaintextSnapshot();
    expect(Array.from(new Uint8Array(plaintext ?? new ArrayBuffer(0)))).toEqual(
      Array.from(sampleDbBytes),
    );
  });

  it('encrypts persisted SQLite bytes and reloads them across calls when enabled', async () => {
    localStorage.setItem(__sqliteAtRestEncryptionForTesting.flagOverrideKey, 'true');

    await __sqliteIndexedDbPersistenceForTesting.persistToIndexedDB(DB_NAME, sampleDbBytes);

    expect(await readPlaintextSnapshot()).toBeUndefined();
    const rawEncrypted = JSON.stringify(await readEncryptedSnapshot());
    expect(rawEncrypted).toContain('finance.sqlite.snapshot.encrypted');
    expect(rawEncrypted).not.toContain('checking=12345');

    const restored = await __sqliteIndexedDbPersistenceForTesting.loadFromIndexedDB(DB_NAME);
    expect(Array.from(new Uint8Array(restored ?? new ArrayBuffer(0)))).toEqual(
      Array.from(sampleDbBytes),
    );
  });

  it('loads legacy plaintext snapshots under the flag so migration can persist safely', async () => {
    await __sqliteIndexedDbPersistenceForTesting.persistPlaintextToIndexedDB(
      DB_NAME,
      sampleDbBytes,
    );
    localStorage.setItem(__sqliteAtRestEncryptionForTesting.flagOverrideKey, 'true');

    const restored = await __sqliteIndexedDbPersistenceForTesting.loadFromIndexedDB(DB_NAME);

    expect(Array.from(new Uint8Array(restored ?? new ArrayBuffer(0)))).toEqual(
      Array.from(sampleDbBytes),
    );
    expect(await readPlaintextSnapshot()).toBeDefined();
  });

  it('migrates plaintext to verified encrypted storage before deleting the legacy copy', async () => {
    await __sqliteIndexedDbPersistenceForTesting.persistPlaintextToIndexedDB(
      DB_NAME,
      sampleDbBytes,
    );
    localStorage.setItem(__sqliteAtRestEncryptionForTesting.flagOverrideKey, 'true');

    await __sqliteIndexedDbPersistenceForTesting.persistToIndexedDB(DB_NAME, sampleDbBytes);

    expect(await readPlaintextSnapshot()).toBeUndefined();
    expect(await readEncryptedSnapshot()).toBeDefined();
    const restored = await __sqliteIndexedDbPersistenceForTesting.loadFromIndexedDB(DB_NAME);
    expect(Array.from(new Uint8Array(restored ?? new ArrayBuffer(0)))).toEqual(
      Array.from(sampleDbBytes),
    );
  });

  it('still loads encrypted snapshots when the flag is later off to avoid lockout', async () => {
    localStorage.setItem(__sqliteAtRestEncryptionForTesting.flagOverrideKey, 'true');
    await __sqliteIndexedDbPersistenceForTesting.persistToIndexedDB(DB_NAME, sampleDbBytes);
    localStorage.removeItem(__sqliteAtRestEncryptionForTesting.flagOverrideKey);

    const restored = await __sqliteIndexedDbPersistenceForTesting.loadFromIndexedDB(DB_NAME);

    expect(Array.from(new Uint8Array(restored ?? new ArrayBuffer(0)))).toEqual(
      Array.from(sampleDbBytes),
    );
  });

  it('fails closed when the encrypted snapshot cannot be unlocked with the device key', async () => {
    localStorage.setItem(__sqliteAtRestEncryptionForTesting.flagOverrideKey, 'true');
    await __sqliteIndexedDbPersistenceForTesting.persistToIndexedDB(DB_NAME, sampleDbBytes);
    await deleteDatabase(__sqliteAtRestEncryptionForTesting.keyDbName);

    await expect(
      __sqliteIndexedDbPersistenceForTesting.loadFromIndexedDB(DB_NAME),
    ).rejects.toThrow();
  });
});
