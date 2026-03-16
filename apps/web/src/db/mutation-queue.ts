// SPDX-License-Identifier: BUSL-1.1

/** Supported mutation operations in the offline queue. */
export type QueuedMutationType = 'create' | 'update' | 'delete';

/** Supported synced entities in the offline queue. */
export type QueuedMutationEntity = 'account' | 'transaction' | 'budget' | 'goal' | 'category';

/** A single queued offline mutation stored in IndexedDB for service-worker replay. */
export interface QueuedMutation {
  id: string;
  type: QueuedMutationType;
  entity: QueuedMutationEntity;
  payload: Record<string, unknown>;
  timestamp: string;
  retryCount: number;
}

const DB_NAME = 'finance-mutation-queue';
const DB_VERSION = 1;
const STORE_NAME = 'mutations';
const TIMESTAMP_INDEX = 'timestamp';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
  });
}

async function withMutationStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const database = await openMutationQueue();

  try {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = await operation(store);
    await transactionToPromise(transaction);
    return result;
  } finally {
    database.close();
  }
}

/** Open the IndexedDB database that stores queued offline mutations. */
export function openMutationQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction?.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: 'id' });

      if (store && !store.indexNames.contains(TIMESTAMP_INDEX)) {
        store.createIndex(TIMESTAMP_INDEX, 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open mutation queue.'));
  });
}

/** Enqueue a new offline mutation for later replay by the service worker. */
export async function enqueueMutation(
  mutation: Omit<QueuedMutation, 'id' | 'timestamp' | 'retryCount'>,
): Promise<void> {
  const queuedMutation: QueuedMutation = {
    ...mutation,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    retryCount: 0,
  };

  await withMutationStore('readwrite', async (store) => {
    await requestToPromise(store.put(queuedMutation));
  });
}

/** Return all queued mutations ordered oldest-first without removing them. */
export async function dequeueMutations(): Promise<QueuedMutation[]> {
  return withMutationStore('readonly', async (store) => {
    const request = store.index(TIMESTAMP_INDEX).getAll();
    const queuedMutations = await requestToPromise(request);
    return queuedMutations as QueuedMutation[];
  });
}

/** Remove a queued mutation after it has replayed successfully. */
export async function removeMutation(id: string): Promise<void> {
  await withMutationStore('readwrite', async (store) => {
    await requestToPromise(store.delete(id));
  });
}

/** Clear every queued mutation from IndexedDB. */
export async function clearQueue(): Promise<void> {
  await withMutationStore('readwrite', async (store) => {
    await requestToPromise(store.clear());
  });
}

/** Return the current number of queued offline mutations. */
export async function getQueueSize(): Promise<number> {
  return withMutationStore('readonly', async (store) => requestToPromise(store.count()));
}

/** Update the retry count for a queued mutation after a failed replay attempt. */
export async function updateMutationRetryCount(id: string, retryCount: number): Promise<void> {
  await withMutationStore('readwrite', async (store) => {
    const existingMutation = (await requestToPromise(store.get(id))) as QueuedMutation | undefined;
    if (!existingMutation) {
      return;
    }

    await requestToPromise(
      store.put({
        ...existingMutation,
        retryCount,
      }),
    );
  });
}
