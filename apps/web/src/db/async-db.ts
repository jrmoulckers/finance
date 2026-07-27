// SPDX-License-Identifier: BUSL-1.1

/**
 * Async database abstraction for the Finance PWA.
 *
 * The web client is migrating from a self-managed, synchronous SQLite-WASM
 * store to the real PowerSync SDK, whose query API is asynchronous. To perform
 * that cut-over without rippling `async` through every call site inconsistently,
 * all repositories, hooks and components target this single {@link AsyncDb}
 * interface. Two adapters implement it:
 *
 *   - {@link createSqliteAsyncDb} wraps today's synchronous {@link SqliteDb}
 *     (Promise-wrapped). Selected when PowerSync is disabled, so existing
 *     behaviour, tests and the E2E stub keep working unchanged.
 *   - `createPowerSyncAsyncDb` (see `sync/powersync/async-adapter.ts`) wraps the
 *     real `PowerSyncDatabase`. Selected when `VITE_POWERSYNC_ENABLED=true`.
 *
 * Reactivity is unified through {@link AsyncDb.onChange}: the SQLite adapter
 * routes it through the existing cross-tab change bus, while the PowerSync
 * adapter routes it through the SDK's `onChangeWithCallback`.
 *
 * References: issues #3943, #3935
 */

import {
  extractTablesFromSql,
  isMutationSql,
  notifyDataChange,
  subscribeToDataChanges,
} from '../lib/sync/crossTab';
import type { QueryResult, Row, SqliteDb } from './sqlite-wasm';

export type { QueryResult, Row } from './sqlite-wasm';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Minimal asynchronous database surface shared by the SQLite-WASM and PowerSync
 * backends. Intentionally mirrors the subset of PowerSync's `DBAdapter` the app
 * relies on so the PowerSync adapter is a thin pass-through.
 */
export interface AsyncDb {
  /** Storage backend identifier, when known (diagnostics only). */
  readonly backend?: string;
  /**
   * The underlying synchronous SQLite handle, present ONLY when this `AsyncDb`
   * is backed by the local SQLite-WASM store (flag OFF). The PowerSync adapter
   * omits it. Local-only utilities — full-store backup/export, restore, and
   * account wipe — read every row (including soft-deleted) or drive raw
   * `BEGIN`/`COMMIT` transactions through this escape hatch; those operations
   * have no PowerSync equivalent, so callers must handle its absence.
   */
  readonly sqlite?: SqliteDb;
  /** Run a read query and return every matching row. */
  getAll<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run a read query and return the first row, or `null` when empty. */
  getOptional<T = Row>(sql: string, params?: unknown[]): Promise<T | null>;
  /** Run a write statement (INSERT / UPDATE / DELETE / DDL). */
  execute(sql: string, params?: unknown[]): Promise<void>;
  /**
   * Subscribe to changes affecting any of `tables`. Returns an unsubscribe
   * function. An empty `tables` list subscribes to all changes.
   */
  onChange(tables: readonly string[], callback: () => void): () => void;
  /** Close the underlying database connection. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Query helpers (async equivalents of the synchronous sqlite-wasm helpers)
// ---------------------------------------------------------------------------

/**
 * Execute a read query and return typed results.
 *
 * ```ts
 * const { rows } = await query<Account>(db, 'SELECT id, name FROM accounts');
 * ```
 */
export async function query<T = Row>(
  db: AsyncDb,
  sql: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const rows = await db.getAll<T>(sql, params);
  return {
    columns: rows.length > 0 ? Object.keys(rows[0] as object) : [],
    rows,
  };
}

/** Execute a read query and return the first row or `null`. */
export async function queryOne<T = Row>(
  db: AsyncDb,
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  return db.getOptional<T>(sql, params);
}

/**
 * Execute a write statement and broadcast a data-change notification for the
 * affected tables so live queries in this and other tabs refresh.
 */
export async function execute(db: AsyncDb, sql: string, params?: unknown[]): Promise<void> {
  await db.execute(sql, params);

  if (isMutationSql(sql)) {
    notifyDataChange(extractTablesFromSql(sql));
  }
}

// ---------------------------------------------------------------------------
// Savepoint helpers (atomic multi-statement writes)
// ---------------------------------------------------------------------------

const NO_ACTIVE_TRANSACTION_ERROR = 'no transaction is active';
const NO_SUCH_SAVEPOINT_ERROR = 'no such savepoint';

function assertSavepointName(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQLite savepoint name: ${name}`);
  }
  return name;
}

function isBenignSavepointCleanupError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes(NO_ACTIVE_TRANSACTION_ERROR) || message.includes(NO_SUCH_SAVEPOINT_ERROR);
}

/** Open a named savepoint for an atomic multi-statement write. */
export async function beginSavepoint(db: AsyncDb, name: string): Promise<void> {
  await db.execute(`SAVEPOINT ${assertSavepointName(name)};`);
}

/**
 * Release (commit) a named savepoint. A benign "no active transaction" / "no
 * such savepoint" error (the savepoint was already closed) is suppressed, so
 * cleanup on both the success and error paths is idempotent.
 */
export async function releaseSavepoint(db: AsyncDb, name: string): Promise<void> {
  const identifier = assertSavepointName(name);
  try {
    await db.execute(`RELEASE SAVEPOINT ${identifier};`);
  } catch (error) {
    if (isBenignSavepointCleanupError(error)) {
      // eslint-disable-next-line no-console
      console.warn(`[async-db] Suppressed release for already-closed savepoint "${name}".`, error);
      return;
    }
    throw error;
  }
}

/** Roll back to a named savepoint, suppressing benign already-closed errors. */
export async function rollbackToSavepoint(db: AsyncDb, name: string): Promise<void> {
  const identifier = assertSavepointName(name);
  try {
    await db.execute(`ROLLBACK TO SAVEPOINT ${identifier};`);
  } catch (error) {
    if (isBenignSavepointCleanupError(error)) {
      // eslint-disable-next-line no-console
      console.warn(`[async-db] Suppressed rollback for already-closed savepoint "${name}".`, error);
      return;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Table-change filtering helpers (shared by adapters and live queries)
// ---------------------------------------------------------------------------

/** Normalize a list of table names for case-insensitive comparison. */
export function normalizeTableNames(tables: readonly string[]): string[] {
  return Array.from(
    new Set(
      tables.map((table) =>
        table
          .replace(/["'`[\]]/g, '')
          .trim()
          .toLowerCase(),
      ),
    ),
  ).filter((table) => table.length > 0);
}

/**
 * Whether a change touching `changedTables` should wake a watcher interested in
 * `watchedTables`. An empty watched set matches everything.
 */
export function tablesIntersect(
  watchedTables: ReadonlySet<string>,
  changedTables: readonly string[],
): boolean {
  if (watchedTables.size === 0 || changedTables.length === 0) {
    return true;
  }
  return changedTables.some((table) =>
    watchedTables.has(
      table
        .replace(/["'`[\]]/g, '')
        .trim()
        .toLowerCase(),
    ),
  );
}

// ---------------------------------------------------------------------------
// SQLite adapter (flag OFF — preserves the current synchronous store)
// ---------------------------------------------------------------------------

/**
 * Wrap a synchronous {@link SqliteDb} as an {@link AsyncDb}. Reads and writes
 * resolve immediately; change notifications flow through the existing cross-tab
 * data-change bus so `useLiveQuery` refreshes exactly as it does today.
 */
export function createSqliteAsyncDb(db: SqliteDb): AsyncDb {
  return {
    backend: db.backend,
    sqlite: db,
    getAll<T = Row>(sql: string, params?: unknown[]): Promise<T[]> {
      return Promise.resolve(db.selectAll(sql, params) as T[]);
    },
    getOptional<T = Row>(sql: string, params?: unknown[]): Promise<T | null> {
      return Promise.resolve((db.selectOne(sql, params) ?? null) as T | null);
    },
    execute(sql: string, params?: unknown[]): Promise<void> {
      db.exec(sql, params);
      return Promise.resolve();
    },
    onChange(tables: readonly string[], callback: () => void): () => void {
      const watched = new Set(normalizeTableNames(tables));
      return subscribeToDataChanges((event) => {
        if (tablesIntersect(watched, event.tables)) {
          callback();
        }
      });
    },
    close(): Promise<void> {
      return db.close();
    },
  };
}
