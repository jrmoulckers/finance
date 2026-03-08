// SPDX-License-Identifier: BUSL-1.1

/**
 * SQLite-WASM setup for the Finance PWA.
 *
 * Initialises a SQLite database backed by the Origin Private File System (OPFS)
 * for durable, high-performance persistence.  When the browser does not support
 * OPFS (or the required `createSyncAccessHandle` API), falls back gracefully to
 * an IndexedDB-backed VFS.
 *
 * The schema mirrors the KMP SQLDelight definitions in packages/models so that
 * the web client operates on the same tables, columns and indexes as native
 * platforms.
 *
 * References: issues #57, #95
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported SQLite VFS backends. */
export type StorageBackend = 'opfs' | 'indexeddb';

/** A single row returned by a query ΓÇö column-name ΓåÆ value. */
export type Row = Record<string, unknown>;

/** Typed query-result wrapper. */
export interface QueryResult<T = Row> {
  /** Column names in result order. */
  columns: string[];
  /** Typed row objects. */
  rows: T[];
}

/** Minimal interface exposed by the underlying WASM driver. */
export interface SqliteDb {
  exec(sql: string, params?: unknown[]): void;
  selectAll(sql: string, params?: unknown[]): Row[];
  selectOne(sql: string, params?: unknown[]): Row | null;
  close(): Promise<void>;
}

/** Migration descriptor. */
export interface Migration {
  /** Monotonically increasing version number (1-based). */
  version: number;
  /** Human-readable label for logging. */
  label: string;
  /** SQL statements to execute (each is a complete statement). */
  up: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_NAME = 'finance.db';
const MIGRATIONS_TABLE = '_migrations';

// ---------------------------------------------------------------------------
// Schema ΓÇö matches packages/models SQLDelight .sq files
// ---------------------------------------------------------------------------

/**
 * Ordered list of migrations that replicate the KMP schema exactly.
 *
 * Version 1 creates the initial schema corresponding to the eight .sq files
 * under packages/models/src/commonMain/sqldelight/com/finance/db/.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    label: 'initial-schema',
    up: [
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        version INTEGER NOT NULL PRIMARY KEY,
        label   TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS user (
        id               TEXT    NOT NULL PRIMARY KEY,
        email            TEXT    NOT NULL,
        display_name     TEXT    NOT NULL,
        avatar_url       TEXT,
        default_currency TEXT    NOT NULL DEFAULT 'USD',
        created_at       TEXT    NOT NULL,
        updated_at       TEXT    NOT NULL,
        deleted_at       TEXT,
        sync_version     INTEGER NOT NULL DEFAULT 0,
        is_synced        INTEGER NOT NULL DEFAULT 0
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email ON user (email);`,
      `CREATE INDEX IF NOT EXISTS idx_user_sync ON user (is_synced);`,

      `CREATE TABLE IF NOT EXISTS household (
        id           TEXT    NOT NULL PRIMARY KEY,
        name         TEXT    NOT NULL,
        owner_id     TEXT    NOT NULL,
        created_at   TEXT    NOT NULL,
        updated_at   TEXT    NOT NULL,
        deleted_at   TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        is_synced    INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (owner_id) REFERENCES user(id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_household_owner ON household (owner_id);`,
      `CREATE INDEX IF NOT EXISTS idx_household_sync  ON household (is_synced);`,

      `CREATE TABLE IF NOT EXISTS household_member (
        id           TEXT    NOT NULL PRIMARY KEY,
        household_id TEXT    NOT NULL,
        user_id      TEXT    NOT NULL,
        role         TEXT    NOT NULL,
        joined_at    TEXT    NOT NULL,
        created_at   TEXT    NOT NULL,
        updated_at   TEXT    NOT NULL,
        deleted_at   TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        is_synced    INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (household_id) REFERENCES household(id),
        FOREIGN KEY (user_id) REFERENCES user(id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_household_member_household ON household_member (household_id);`,
      `CREATE INDEX IF NOT EXISTS idx_household_member_user      ON household_member (user_id);`,
      `CREATE INDEX IF NOT EXISTS idx_household_member_sync      ON household_member (is_synced);`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_household_member_unique ON household_member (household_id, user_id);`,

      `CREATE TABLE IF NOT EXISTS account (
        id              TEXT    NOT NULL PRIMARY KEY,
        household_id    TEXT    NOT NULL,
        name            TEXT    NOT NULL,
        type            TEXT    NOT NULL,
        currency        TEXT    NOT NULL DEFAULT 'USD',
        current_balance INTEGER NOT NULL DEFAULT 0,
        is_archived     INTEGER NOT NULL DEFAULT 0,
        sort_order      INTEGER NOT NULL DEFAULT 0,
        icon            TEXT,
        color           TEXT,
        created_at      TEXT    NOT NULL,
        updated_at      TEXT    NOT NULL,
        deleted_at      TEXT,
        sync_version    INTEGER NOT NULL DEFAULT 0,
        is_synced       INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (household_id) REFERENCES household(id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_account_household ON account (household_id);`,
      `CREATE INDEX IF NOT EXISTS idx_account_type      ON account (type);`,
      `CREATE INDEX IF NOT EXISTS idx_account_sync      ON account (is_synced);`,

      `CREATE TABLE IF NOT EXISTS category (
        id           TEXT    NOT NULL PRIMARY KEY,
        household_id TEXT    NOT NULL,
        name         TEXT    NOT NULL,
        icon         TEXT,
        color        TEXT,
        parent_id    TEXT,
        is_income    INTEGER NOT NULL DEFAULT 0,
        is_system    INTEGER NOT NULL DEFAULT 0,
        sort_order   INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL,
        updated_at   TEXT    NOT NULL,
        deleted_at   TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        is_synced    INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (household_id) REFERENCES household(id),
        FOREIGN KEY (parent_id)    REFERENCES category(id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_category_household ON category (household_id);`,
      `CREATE INDEX IF NOT EXISTS idx_category_parent    ON category (parent_id);`,
      `CREATE INDEX IF NOT EXISTS idx_category_sync      ON category (is_synced);`,

      `CREATE TABLE IF NOT EXISTS "transaction" (
        id                      TEXT    NOT NULL PRIMARY KEY,
        household_id            TEXT    NOT NULL,
        account_id              TEXT    NOT NULL,
        category_id             TEXT,
        type                    TEXT    NOT NULL,
        status                  TEXT    NOT NULL DEFAULT 'CLEARED',
        amount                  INTEGER NOT NULL,
        currency                TEXT    NOT NULL DEFAULT 'USD',
        payee                   TEXT,
        note                    TEXT,
        date                    TEXT    NOT NULL,
        transfer_account_id     TEXT,
        transfer_transaction_id TEXT,
        is_recurring            INTEGER NOT NULL DEFAULT 0,
        recurring_rule_id       TEXT,
        tags                    TEXT    NOT NULL DEFAULT '[]',
        created_at              TEXT    NOT NULL,
        updated_at              TEXT    NOT NULL,
        deleted_at              TEXT,
        sync_version            INTEGER NOT NULL DEFAULT 0,
        is_synced               INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (household_id)        REFERENCES household(id),
        FOREIGN KEY (account_id)          REFERENCES account(id),
        FOREIGN KEY (category_id)         REFERENCES category(id),
        FOREIGN KEY (transfer_account_id) REFERENCES account(id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_transaction_household ON "transaction" (household_id);`,
      `CREATE INDEX IF NOT EXISTS idx_transaction_account   ON "transaction" (account_id);`,
      `CREATE INDEX IF NOT EXISTS idx_transaction_category  ON "transaction" (category_id);`,
      `CREATE INDEX IF NOT EXISTS idx_transaction_date      ON "transaction" (date);`,
      `CREATE INDEX IF NOT EXISTS idx_transaction_sync      ON "transaction" (is_synced);`,
      `CREATE INDEX IF NOT EXISTS idx_transaction_type      ON "transaction" (type);`,
      `CREATE INDEX IF NOT EXISTS idx_transaction_status    ON "transaction" (status);`,

      `CREATE TABLE IF NOT EXISTS budget (
        id           TEXT    NOT NULL PRIMARY KEY,
        household_id TEXT    NOT NULL,
        category_id  TEXT    NOT NULL,
        name         TEXT    NOT NULL,
        amount       INTEGER NOT NULL,
        currency     TEXT    NOT NULL DEFAULT 'USD',
        period       TEXT    NOT NULL,
        start_date   TEXT    NOT NULL,
        end_date     TEXT,
        is_rollover  INTEGER NOT NULL DEFAULT 0,
        created_at   TEXT    NOT NULL,
        updated_at   TEXT    NOT NULL,
        deleted_at   TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        is_synced    INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (household_id) REFERENCES household(id),
        FOREIGN KEY (category_id)  REFERENCES category(id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_budget_household ON budget (household_id);`,
      `CREATE INDEX IF NOT EXISTS idx_budget_category  ON budget (category_id);`,
      `CREATE INDEX IF NOT EXISTS idx_budget_period    ON budget (period);`,
      `CREATE INDEX IF NOT EXISTS idx_budget_sync      ON budget (is_synced);`,

      `CREATE TABLE IF NOT EXISTS goal (
        id             TEXT    NOT NULL PRIMARY KEY,
        household_id   TEXT    NOT NULL,
        name           TEXT    NOT NULL,
        target_amount  INTEGER NOT NULL,
        current_amount INTEGER NOT NULL DEFAULT 0,
        currency       TEXT    NOT NULL DEFAULT 'USD',
        target_date    TEXT,
        status         TEXT    NOT NULL DEFAULT 'ACTIVE',
        icon           TEXT,
        color          TEXT,
        account_id     TEXT,
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL,
        deleted_at     TEXT,
        sync_version   INTEGER NOT NULL DEFAULT 0,
        is_synced      INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (household_id) REFERENCES household(id),
        FOREIGN KEY (account_id)   REFERENCES account(id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_goal_household ON goal (household_id);`,
      `CREATE INDEX IF NOT EXISTS idx_goal_status    ON goal (status);`,
      `CREATE INDEX IF NOT EXISTS idx_goal_account   ON goal (account_id);`,
      `CREATE INDEX IF NOT EXISTS idx_goal_sync      ON goal (is_synced);`,
    ],
  },
];
// ---------------------------------------------------------------------------
// OPFS / IndexedDB feature detection
// ---------------------------------------------------------------------------

/**
 * Detects the best available storage backend.
 *
 * OPFS with synchronous access handles is the preferred path.  When
 * unavailable (e.g. Firefox < 124, Safari < 17.4, or non-secure contexts)
 * we fall back to IndexedDB.
 */
export async function detectBackend(): Promise<StorageBackend> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      'getDirectory' in navigator.storage
    ) {
      const root = await navigator.storage.getDirectory();
      const probe = await root.getFileHandle('.__opfs_probe', { create: true });
      const handle = await probe.createSyncAccessHandle();
      handle.close();
      await root.removeEntry('.__opfs_probe');
      return 'opfs';
    }
  } catch {
    // OPFS not usable ΓÇö fall through
  }
  return 'indexeddb';
}

// ---------------------------------------------------------------------------
// Database initialisation
// ---------------------------------------------------------------------------

/**
 * Initialises (or opens) the Finance SQLite database.
 *
 * 1. Detects the best storage backend (OPFS preferred, IndexedDB fallback).
 * 2. Loads the wa-sqlite or sql.js WASM module.
 * 3. Opens or creates the database file.
 * 4. Runs any pending migrations.
 * 5. Returns a thin wrapper implementing {@link SqliteDb}.
 *
 * Usage:
 * ```ts
 * const db = await initDatabase();
 * const accounts = query<Account>(db, 'SELECT * FROM account WHERE deleted_at IS NULL');
 * ```
 */
export async function initDatabase(): Promise<SqliteDb> {
  const backend = await detectBackend();

  // Dynamic import ΓÇö keeps wa-sqlite out of the main bundle
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sqlite3: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  if (backend === 'opfs') {
    const { default: SQLiteESMFactory } = await import(
      /* webpackChunkName: "wa-sqlite" */ 'wa-sqlite'
    );
    const { OriginPrivateFileSystemVFS } = await import(
      /* webpackChunkName: "wa-sqlite-vfs" */ 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js'
    );

    const module = await SQLiteESMFactory();
    sqlite3 = module;

    const vfs = await OriginPrivateFileSystemVFS.create(DB_NAME, module);
    module.vfs_register(vfs, /* makeDefault */ true);
    db = await module.open_v2(DB_NAME);
  } else {
    const initSqlJs = (await import(/* webpackChunkName: "sql-js" */ 'sql.js'))
      .default;

    const SQL = await initSqlJs({
      locateFile: (file: string) => `/assets/sql-wasm/${file}`,
    });

    const savedBuffer = await loadFromIndexedDB(DB_NAME);
    db = savedBuffer ? new SQL.Database(new Uint8Array(savedBuffer)) : new SQL.Database();
    sqlite3 = SQL;
  }

  execRaw(sqlite3, db, 'PRAGMA journal_mode = WAL;', backend);
  execRaw(sqlite3, db, 'PRAGMA foreign_keys = ON;', backend);

  await runMigrations(sqlite3, db, backend);

  if (backend === 'indexeddb') {
    await persistToIndexedDB(DB_NAME, exportDatabase(sqlite3, db, backend));
  }

  return createDbWrapper(sqlite3, db, backend);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function execRaw(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  driver: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  sql: string,
  backend: StorageBackend,
  params?: unknown[],
): void {
  if (backend === 'opfs') {
    if (params && params.length > 0) {
      const stmt = driver.prepare(db, sql);
      try {
        driver.bind(stmt, params);
        driver.step(stmt);
      } finally {
        driver.finalize(stmt);
      }
    } else {
      driver.exec(db, sql);
    }
  } else {
    if (params && params.length > 0) {
      db.run(sql, params);
    } else {
      db.run(sql);
    }
  }
}

function selectRaw(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  driver: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  sql: string,
  backend: StorageBackend,
  params?: unknown[],
): QueryResult {
  if (backend === 'opfs') {
    const rows: Row[] = [];
    let columns: string[] = [];
    const stmt = driver.prepare(db, sql);
    try {
      if (params && params.length > 0) {
        driver.bind(stmt, params);
      }
      const colCount: number = driver.column_count(stmt);
      columns = Array.from({ length: colCount }, (_, i) =>
        driver.column_name(stmt, i),
      ) as string[];
      while (driver.step(stmt) === /* SQLITE_ROW */ 100) {
        const row: Row = {};
        for (let i = 0; i < colCount; i++) {
          const col = columns[i];
          if (col !== undefined) {
            row[col] = driver.column(stmt, i);
          }
        }
        rows.push(row);
      }
    } finally {
      driver.finalize(stmt);
    }
    return { columns, rows };
  }

  const result = db.exec(sql, params);
  if (!result || result.length === 0) {
    return { columns: [], rows: [] };
  }
  const { columns, values } = result[0];
  const rows: Row[] = values.map((vals: unknown[]) => {
    const row: Row = {};
    columns.forEach((col: string, i: number) => {
      row[col] = vals[i];
    });
    return row;
  });
  return { columns, rows };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function exportDatabase(driver: any, db: any, backend: StorageBackend): Uint8Array {
  if (backend === 'indexeddb') {
    return db.export();
  }
  void driver;
  return new Uint8Array();
}

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

async function runMigrations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  driver: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  backend: StorageBackend,
): Promise<void> {
  execRaw(
    driver,
    db,
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
       version    INTEGER NOT NULL PRIMARY KEY,
       label      TEXT    NOT NULL,
       applied_at TEXT    NOT NULL
    );`,
    backend,
  );

  const result = selectRaw(
    driver,
    db,
    `SELECT COALESCE(MAX(version), 0) AS current_version FROM ${MIGRATIONS_TABLE};`,
    backend,
  );
  const currentVersion = (result.rows[0]?.current_version as number) ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    execRaw(driver, db, 'BEGIN TRANSACTION;', backend);
    try {
      for (const stmt of migration.up) {
        if (stmt.includes(MIGRATIONS_TABLE) && stmt.trimStart().startsWith('CREATE TABLE')) {
          continue;
        }
        execRaw(driver, db, stmt, backend);
      }

      execRaw(
        driver,
        db,
        `INSERT INTO ${MIGRATIONS_TABLE} (version, label, applied_at) VALUES (?, ?, ?);`,
        backend,
        [migration.version, migration.label, new Date().toISOString()],
      );

      execRaw(driver, db, 'COMMIT;', backend);
    } catch (err) {
      execRaw(driver, db, 'ROLLBACK;', backend);
      throw new Error(
        `Migration v${migration.version} (${migration.label}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// IndexedDB persistence helpers (fallback only)
// ---------------------------------------------------------------------------

const IDB_STORE = 'finance-sqlite';
const IDB_KEY = 'db';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_STORE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadFromIndexedDB(key: string): Promise<ArrayBuffer | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(`${key}:${IDB_KEY}`);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function persistToIndexedDB(
  key: string,
  data: Uint8Array,
): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put(data.buffer, `${key}:${IDB_KEY}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Db wrapper factory
// ---------------------------------------------------------------------------

function createDbWrapper(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  driver: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  backend: StorageBackend,
): SqliteDb {
  return {
    exec(sql: string, params?: unknown[]): void {
      execRaw(driver, db, sql, backend, params);
      if (backend === 'indexeddb') {
        void persistToIndexedDB(DB_NAME, exportDatabase(driver, db, backend));
      }
    },

    selectAll(sql: string, params?: unknown[]): Row[] {
      return selectRaw(driver, db, sql, backend, params).rows;
    },

    selectOne(sql: string, params?: unknown[]): Row | null {
      const rows = selectRaw(driver, db, sql, backend, params).rows;
      return rows[0] ?? null;
    },

    async close(): Promise<void> {
      if (backend === 'indexeddb') {
        await persistToIndexedDB(DB_NAME, exportDatabase(driver, db, backend));
        db.close();
      } else {
        driver.close(db);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Public query helpers
// ---------------------------------------------------------------------------

/**
 * Execute a read query and return typed results.
 *
 * ```ts
 * interface Account { id: string; name: string; }
 * const accounts = query<Account>(db, 'SELECT id, name FROM account');
 * ```
 */
export function query<T = Row>(
  db: SqliteDb,
  sql: string,
  params?: unknown[],
): QueryResult<T> {
  const rows = db.selectAll(sql, params) as T[];
  return {
    columns: rows.length > 0 ? Object.keys(rows[0] as object) : [],
    rows,
  };
}

/**
 * Execute a read query and return the first row or `null`.
 */
export function queryOne<T = Row>(
  db: SqliteDb,
  sql: string,
  params?: unknown[],
): T | null {
  return db.selectOne(sql, params) as T | null;
}

/**
 * Execute a write statement (INSERT / UPDATE / DELETE).
 */
export function execute(
  db: SqliteDb,
  sql: string,
  params?: unknown[],
): void {
  db.exec(sql, params);
}
