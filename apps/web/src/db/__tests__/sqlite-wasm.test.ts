// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi } from 'vitest';
import {
  StorageError,
  getUserFriendlyStorageMessage,
  __sqliteRecoveryForTesting,
  type StorageErrorCode,
} from '../sqlite-wasm';

const { openSnapshotWithRecovery, deleteIndexedDbDatabase, discardCorruptSnapshotStores } =
  __sqliteRecoveryForTesting;

/** Open a database at version 1, creating `storeName`, and return its names. */
function idbPut(dbName: string, storeName: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(storeName)) {
        open.result.createObjectStore(storeName);
      }
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
    open.onerror = () => reject(open.error);
  });
}

/** Re-open a database and report its object-store names (empty if deleted). */
function idbStoreNames(dbName: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName);
    open.onsuccess = () => {
      const names = Array.from(open.result.objectStoreNames);
      open.result.close();
      resolve(names);
    };
    open.onerror = () => reject(open.error);
  });
}

/**
 * Minimal sql.js stand-in. `throwOnOpen` simulates a corrupt snapshot whose
 * bytes sql.js cannot parse; `throwOnProbe` simulates a snapshot that opens but
 * fails the integrity probe. The fresh (no-bytes) constructor never throws.
 */
function makeFakeSql(opts: { throwOnOpen?: boolean; throwOnProbe?: boolean } = {}) {
  const created: Array<{ fromBytes: boolean }> = [];
  class FakeDatabase {
    fromBytes: boolean;
    constructor(bytes?: Uint8Array) {
      this.fromBytes = bytes != null;
      if (this.fromBytes && opts.throwOnOpen) {
        throw new Error('file is not a database');
      }
      created.push({ fromBytes: this.fromBytes });
    }
    exec(_sql: string): unknown[] {
      if (this.fromBytes && opts.throwOnProbe) {
        throw new Error('database disk image is malformed');
      }
      return [];
    }
  }
  return { SQL: { Database: FakeDatabase }, created };
}

describe('StorageError', () => {
  it('creates an error with a code, message, and backend', () => {
    const error = new StorageError('WASM_LOAD_FAILED', 'WASM failed', {
      backend: 'opfs',
      fallbackAttempted: false,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(StorageError);
    expect(error.name).toBe('StorageError');
    expect(error.code).toBe('WASM_LOAD_FAILED');
    expect(error.message).toBe('WASM failed');
    expect(error.backend).toBe('opfs');
    expect(error.fallbackAttempted).toBe(false);
  });

  it('preserves the cause chain', () => {
    const rootCause = new TypeError('WebAssembly.instantiate failed');
    const error = new StorageError('WASM_LOAD_FAILED', 'Failed to load', {
      cause: rootCause,
      backend: 'opfs',
    });

    expect(error.cause).toBe(rootCause);
  });

  it('defaults backend to null and fallbackAttempted to false', () => {
    const error = new StorageError('UNKNOWN', 'Something broke');

    expect(error.backend).toBeNull();
    expect(error.fallbackAttempted).toBe(false);
  });

  it('tracks when a fallback was attempted', () => {
    const error = new StorageError('INDEXEDDB_FAILED', 'IndexedDB failed', {
      backend: 'indexeddb',
      fallbackAttempted: true,
    });

    expect(error.fallbackAttempted).toBe(true);
    expect(error.backend).toBe('indexeddb');
  });
});

describe('getUserFriendlyStorageMessage', () => {
  const codes: StorageErrorCode[] = [
    'WASM_LOAD_FAILED',
    'OPFS_UNAVAILABLE',
    'OPFS_INIT_FAILED',
    'INDEXEDDB_FAILED',
    'QUOTA_EXCEEDED',
    'MIGRATION_FAILED',
    'UNKNOWN',
  ];

  it.each(codes)('returns a non-empty string for code "%s"', (code) => {
    const message = getUserFriendlyStorageMessage(code);
    expect(message).toBeTruthy();
    expect(typeof message).toBe('string');
    expect(message.length).toBeGreaterThan(10);
  });

  it('returns a message that does not expose technical jargon for WASM_LOAD_FAILED', () => {
    const message = getUserFriendlyStorageMessage('WASM_LOAD_FAILED');
    expect(message).toContain('database engine');
    expect(message).not.toContain('WebAssembly');
    expect(message).not.toContain('WASM');
  });

  it('mentions storage for QUOTA_EXCEEDED', () => {
    const message = getUserFriendlyStorageMessage('QUOTA_EXCEEDED');
    expect(message.toLowerCase()).toContain('storage');
    expect(message.toLowerCase()).toContain('full');
  });

  it('provides actionable guidance for INDEXEDDB_FAILED', () => {
    const message = getUserFriendlyStorageMessage('INDEXEDDB_FAILED');
    expect(message.toLowerCase()).toContain('browser');
  });
});

describe('openSnapshotWithRecovery (self-healing DB init, #3094)', () => {
  it('returns a fresh database when there is no saved snapshot', async () => {
    const { SQL, created } = makeFakeSql();
    const discard = vi.fn().mockResolvedValue(undefined);

    const db = await openSnapshotWithRecovery(SQL, null, discard);

    expect(db).toBeInstanceOf(SQL.Database);
    expect(discard).not.toHaveBeenCalled();
    expect(created).toEqual([{ fromBytes: false }]);
  });

  it('opens a healthy snapshot without discarding it', async () => {
    const { SQL, created } = makeFakeSql();
    const discard = vi.fn().mockResolvedValue(undefined);
    const snapshot = new Uint8Array([1, 2, 3]).buffer;

    const db = await openSnapshotWithRecovery(SQL, snapshot, discard);

    expect(db.fromBytes).toBe(true);
    expect(discard).not.toHaveBeenCalled();
    expect(created).toEqual([{ fromBytes: true }]);
  });

  it('discards an unparseable snapshot and recovers with a fresh database', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { SQL, created } = makeFakeSql({ throwOnOpen: true });
    const discard = vi.fn().mockResolvedValue(undefined);
    const snapshot = new Uint8Array([9, 9, 9]).buffer;

    const db = await openSnapshotWithRecovery(SQL, snapshot, discard);

    expect(discard).toHaveBeenCalledTimes(1);
    expect(db.fromBytes).toBe(false);
    // Only the fresh, empty database survives — the corrupt open is discarded.
    expect(created).toEqual([{ fromBytes: false }]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('discards a snapshot that opens but fails the integrity probe', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { SQL } = makeFakeSql({ throwOnProbe: true });
    const discard = vi.fn().mockResolvedValue(undefined);
    const snapshot = new Uint8Array([4, 5, 6]).buffer;

    const db = await openSnapshotWithRecovery(SQL, snapshot, discard);

    expect(discard).toHaveBeenCalledTimes(1);
    expect(db.fromBytes).toBe(false);
    warn.mockRestore();
  });
});

describe('deleteIndexedDbDatabase (self-healing DB init, #3094)', () => {
  it('resolves after deleting an IndexedDB database', async () => {
    await expect(deleteIndexedDbDatabase('finance-sqlite-recovery-test')).resolves.toBeUndefined();
  });

  it('resolves even when deleting a database that does not exist', async () => {
    await expect(
      deleteIndexedDbDatabase('finance-nonexistent-db-' + Date.now()),
    ).resolves.toBeUndefined();
  });
});

describe('discardCorruptSnapshotStores (self-healing DB init, #3094)', () => {
  it('clears both the plaintext and encrypted snapshot databases', async () => {
    // A corrupt snapshot may live in either store, so recovery must clear both
    // — `loadFromIndexedDB` prefers the encrypted snapshot whenever at-rest
    // encryption is supported, even with the flag off.
    await idbPut('finance-sqlite', 'finance-sqlite', 'finance.db:db', new Uint8Array([1, 2, 3]));
    await idbPut('finance-sqlite-encrypted', 'encrypted', 'db', { magic: 'corrupt' });

    expect(await idbStoreNames('finance-sqlite')).toContain('finance-sqlite');
    expect(await idbStoreNames('finance-sqlite-encrypted')).toContain('encrypted');

    await discardCorruptSnapshotStores();

    expect(await idbStoreNames('finance-sqlite')).not.toContain('finance-sqlite');
    expect(await idbStoreNames('finance-sqlite-encrypted')).not.toContain('encrypted');
  });
});
