// SPDX-License-Identifier: BUSL-1.1

/**
 * Low-level IndexedDB helpers for the mutation queue.
 *
 * Provides typed `open`, `getAll`, `put`, `delete`, and `clear` wrappers
 * around the raw IndexedDB API.  All operations return Promises so they
 * integrate cleanly with both the main thread and service worker contexts.
 *
 * References: issue #416
 */

import {
  MUTATION_QUEUE_DB_NAME,
  MUTATION_QUEUE_DB_VERSION,
  MUTATION_QUEUE_STORE_NAME,
  type QueuedMutation,
} from './types';

// ---------------------------------------------------------------------------
// Database lifecycle
// ---------------------------------------------------------------------------

/**
 * Open (or create) the IndexedDB database for the mutation queue.
 *
 * The database has a single object store keyed on the mutation `id` with an
 * index on `timestamp` for ordered retrieval.
 */
export function openMutationDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(MUTATION_QUEUE_DB_NAME, MUTATION_QUEUE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(MUTATION_QUEUE_STORE_NAME)) {
        const store = db.createObjectStore(MUTATION_QUEUE_STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_timestamp', 'timestamp', { unique: false });
        store.createIndex('by_table', 'tableName', { unique: false });
        store.createIndex('by_household', 'householdId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

/** Insert or update a mutation in the queue. */
export async function putMutation(mutation: QueuedMutation): Promise<void> {
  const db = await openMutationDb();
  try {
    await idbPut(db, mutation);
  } finally {
    db.close();
  }
}

/** Retrieve all queued mutations ordered by timestamp (oldest first). */
export async function getAllMutations(): Promise<QueuedMutation[]> {
  const db = await openMutationDb();
  try {
    return await idbGetAllByIndex(db);
  } finally {
    db.close();
  }
}

/** Retrieve a batch of the oldest queued mutations. */
export async function getMutationBatch(count: number): Promise<QueuedMutation[]> {
  const db = await openMutationDb();
  try {
    return await idbGetBatchByIndex(db, count);
  } finally {
    db.close();
  }
}

/** Delete specific mutations by their IDs. */
export async function deleteMutations(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;

  const db = await openMutationDb();
  try {
    await idbDeleteMany(db, ids);
  } finally {
    db.close();
  }
}

/** Return the total number of queued mutations. */
export async function countMutations(): Promise<number> {
  const db = await openMutationDb();
  try {
    return await idbCount(db);
  } finally {
    db.close();
  }
}

/** Remove all mutations from the queue. */
export async function clearMutations(): Promise<void> {
  const db = await openMutationDb();
  try {
    await idbClear(db);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Internal IndexedDB transaction wrappers
// ---------------------------------------------------------------------------

function idbPut(db: IDBDatabase, mutation: QueuedMutation): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MUTATION_QUEUE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(MUTATION_QUEUE_STORE_NAME);
    store.put(mutation);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

function idbGetAllByIndex(db: IDBDatabase): Promise<QueuedMutation[]> {
  return new Promise<QueuedMutation[]>((resolve, reject) => {
    const tx = db.transaction(MUTATION_QUEUE_STORE_NAME, 'readonly');
    const store = tx.objectStore(MUTATION_QUEUE_STORE_NAME);
    const index = store.index('by_timestamp');
    const request = index.getAll();
    request.onsuccess = () => resolve(request.result as QueuedMutation[]);
    request.onerror = () => reject(request.error);
  });
}

function idbGetBatchByIndex(db: IDBDatabase, count: number): Promise<QueuedMutation[]> {
  return new Promise<QueuedMutation[]>((resolve, reject) => {
    const results: QueuedMutation[] = [];
    const tx = db.transaction(MUTATION_QUEUE_STORE_NAME, 'readonly');
    const store = tx.objectStore(MUTATION_QUEUE_STORE_NAME);
    const index = store.index('by_timestamp');
    const request = index.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && results.length < count) {
        results.push(cursor.value as QueuedMutation);
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

function idbDeleteMany(db: IDBDatabase, ids: readonly string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MUTATION_QUEUE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(MUTATION_QUEUE_STORE_NAME);

    for (const id of ids) {
      store.delete(id);
    }

    // Resolve when the full transaction is committed -- not on individual
    // request success -- so that subsequent reads see the deletions.
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

function idbCount(db: IDBDatabase): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(MUTATION_QUEUE_STORE_NAME, 'readonly');
    const store = tx.objectStore(MUTATION_QUEUE_STORE_NAME);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbClear(db: IDBDatabase): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MUTATION_QUEUE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(MUTATION_QUEUE_STORE_NAME);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}
