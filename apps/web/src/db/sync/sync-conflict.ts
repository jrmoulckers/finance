// SPDX-License-Identifier: BUSL-1.1

/**
 * Sync conflict storage and resolution.
 *
 * When the server returns 409 Conflict responses during mutation replay,
 * the conflict details are stored in IndexedDB so the UI can present
 * resolution options to the user.
 *
 * References: issue #416
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A conflict detected by the server during sync push. */
export interface SyncConflict {
  /** Unique identifier (matches the mutation ID that caused the conflict). */
  readonly mutationId: string;
  /** Database table the conflict affects. */
  readonly tableName: string;
  /** Primary key of the conflicting row. */
  readonly recordId: string;
  /** The client's version of the data. */
  readonly clientData: Record<string, unknown>;
  /** The server's current version of the data. */
  readonly serverData: Record<string, unknown>;
  /** Timestamp when the conflict was resolved, or `null` if unresolved. */
  resolvedAt: number | null;
  /** How the conflict was resolved, or `null` if unresolved. */
  resolution: 'client' | 'server' | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** IndexedDB database name for sync conflicts. */
export const CONFLICT_DB_NAME = 'finance-sync-conflicts';

/** IndexedDB object store name. */
const CONFLICT_STORE_NAME = 'conflicts';

/** IndexedDB database version. */
const CONFLICT_DB_VERSION = 1;

// ---------------------------------------------------------------------------
// Database lifecycle
// ---------------------------------------------------------------------------

/**
 * Open (or create) the IndexedDB database for sync conflict storage.
 *
 * The database has a single object store keyed on `mutationId` with
 * indexes for querying by resolution status and table name.
 */
function openConflictDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CONFLICT_DB_NAME, CONFLICT_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(CONFLICT_STORE_NAME)) {
        const store = db.createObjectStore(CONFLICT_STORE_NAME, {
          keyPath: 'mutationId',
        });
        store.createIndex('by_table', 'tableName', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Store sync conflicts in IndexedDB for UI access.
 *
 * Uses `put` semantics so re-storing a conflict with the same
 * `mutationId` overwrites the previous entry.
 */
export async function storeConflicts(conflicts: SyncConflict[]): Promise<void> {
  if (conflicts.length === 0) return;

  const db = await openConflictDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CONFLICT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CONFLICT_STORE_NAME);

      for (const conflict of conflicts) {
        store.put(conflict);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  } finally {
    db.close();
  }
}

/**
 * Retrieve all unresolved sync conflicts.
 *
 * IndexedDB does not index `null` key values, so we retrieve all
 * conflicts and filter in memory.  This is acceptable because the
 * conflict set is expected to be small (typically < 100 entries).
 */
export async function getUnresolvedConflicts(): Promise<SyncConflict[]> {
  const db = await openConflictDb();
  try {
    return await new Promise<SyncConflict[]>((resolve, reject) => {
      const tx = db.transaction(CONFLICT_STORE_NAME, 'readonly');
      const store = tx.objectStore(CONFLICT_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const all = request.result as SyncConflict[];
        resolve(all.filter((c) => c.resolvedAt === null));
      };

      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Resolve a conflict by choosing client or server data.
 *
 * Sets the `resolution` field and records the `resolvedAt` timestamp.
 * If the conflict does not exist, this is a no-op.
 */
export async function resolveConflict(
  mutationId: string,
  resolution: 'client' | 'server',
): Promise<void> {
  const db = await openConflictDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CONFLICT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CONFLICT_STORE_NAME);
      const getRequest = store.get(mutationId);

      getRequest.onsuccess = () => {
        const conflict = getRequest.result as SyncConflict | undefined;
        if (!conflict) {
          // Conflict not found — nothing to resolve.
          return;
        }

        const updated: SyncConflict = {
          ...conflict,
          resolution,
          resolvedAt: Date.now(),
        };
        store.put(updated);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  } finally {
    db.close();
  }
}

/**
 * Remove all resolved conflicts from storage.
 *
 * Unresolved conflicts are retained for the user to address.
 */
export async function clearResolvedConflicts(): Promise<void> {
  const db = await openConflictDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CONFLICT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CONFLICT_STORE_NAME);
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const conflict = cursor.value as SyncConflict;
          if (conflict.resolvedAt !== null) {
            cursor.delete();
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  } finally {
    db.close();
  }
}

/**
 * Retrieve all conflicts (both resolved and unresolved).
 *
 * Primarily useful for testing and administrative views.
 */
export async function getAllConflicts(): Promise<SyncConflict[]> {
  const db = await openConflictDb();
  try {
    return await new Promise<SyncConflict[]>((resolve, reject) => {
      const tx = db.transaction(CONFLICT_STORE_NAME, 'readonly');
      const store = tx.objectStore(CONFLICT_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as SyncConflict[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
