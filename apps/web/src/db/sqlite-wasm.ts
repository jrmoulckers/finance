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

/** Error codes for storage initialization failures. */
export type StorageErrorCode =
  | 'WASM_LOAD_FAILED'
  | 'OPFS_UNAVAILABLE'
  | 'OPFS_INIT_FAILED'
  | 'INDEXEDDB_FAILED'
  | 'QUOTA_EXCEEDED'
  | 'MIGRATION_FAILED'
  | 'UNKNOWN';

/**
 * Structured error for storage initialization failures.
 *
 * Provides an error code for programmatic handling and a user-friendly
 * message suitable for display in the UI.
 */
export class StorageError extends Error {
  /** Machine-readable error code for programmatic handling. */
  readonly code: StorageErrorCode;
  /** The storage backend that was being used when the error occurred. */
  readonly backend: StorageBackend | null;
  /** Whether a fallback to another backend was attempted. */
  readonly fallbackAttempted: boolean;

  constructor(
    code: StorageErrorCode,
    message: string,
    options?: {
      cause?: unknown;
      backend?: StorageBackend | null;
      fallbackAttempted?: boolean;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'StorageError';
    this.code = code;
    this.backend = options?.backend ?? null;
    this.fallbackAttempted = options?.fallbackAttempted ?? false;
  }
}

/** Diagnostic information about the storage initialization. */
export interface StorageDiagnostics {
  /** Which backend is active. */
  backend: StorageBackend;
  /** Whether OPFS was available during detection. */
  opfsAvailable: boolean;
  /** Whether a fallback from OPFS to IndexedDB occurred. */
  didFallback: boolean;
  /** Estimated storage quota in bytes, if available. */
  quotaBytes: number | null;
  /** Estimated storage usage in bytes, if available. */
  usageBytes: number | null;
}

/** Result of a successful database initialization. */
export interface StorageInitResult {
  /** The initialized database instance. */
  db: SqliteDb;
  /** Diagnostic information about the initialization. */
  diagnostics: StorageDiagnostics;
}

/** A single row returned by a query — column-name → value. */
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

/**
 * Module-level encryption secret.
 *
 * When set, IndexedDB-backed databases are encrypted at rest using
 * AES-256-GCM via the Web Crypto API.  Set via `setEncryptionSecret()`
 * before calling `initDatabase()`.
 */
let _encryptionSecret: string | null = null;

/**
 * Configure the encryption secret used to encrypt/decrypt the database
 * when using the IndexedDB fallback backend.
 *
 * Call this before `initDatabase()` — typically after the user authenticates.
 * Pass `null` to disable encryption (e.g. on logout).
 *
 * OPFS-backed databases use the browser's built-in OPFS security model
 * (origin-scoped, not readable by other origins).  For an additional
 * layer of defence, the encryption module can be used to encrypt OPFS
 * snapshots during export/backup operations.
 */
export function setEncryptionSecret(secret: string | null): void {
  _encryptionSecret = secret;
}

/** Check whether an encryption secret has been configured. */
export function hasEncryptionSecret(): boolean {
  return _encryptionSecret !== null;
}

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

      `CREATE TABLE IF NOT EXISTS widget_privacy_config (
        widget_id    TEXT NOT NULL PRIMARY KEY,
        masking_mode TEXT NOT NULL DEFAULT 'Bucketed',
        updated_at   TEXT NOT NULL
      );`,
    ],
  },
  {
    version: 2,
    label: 'privacy-trio-foundation',
    up: [
      `ALTER TABLE category ADD COLUMN is_biometric_protected INTEGER NOT NULL DEFAULT 0;`,
      `CREATE INDEX IF NOT EXISTS idx_category_biometric ON category (is_biometric_protected);`,
      `CREATE TABLE IF NOT EXISTS widget_privacy_config (
        widget_id    TEXT NOT NULL PRIMARY KEY,
        masking_mode TEXT NOT NULL DEFAULT 'Bucketed',
        updated_at   TEXT NOT NULL
      );`,
    ],
  },
  {
    version: 3,
    label: 'add-mood-tag-to-transactions',
    up: ['ALTER TABLE "transaction" ADD COLUMN mood_tag TEXT;'],
  },
  {
    version: 4,
    label: 'add-merchant-and-extra-columns-to-transactions',
    up: [
      `ALTER TABLE "transaction" ADD COLUMN merchant_address       TEXT;`,
      `ALTER TABLE "transaction" ADD COLUMN merchant_city          TEXT;`,
      `ALTER TABLE "transaction" ADD COLUMN merchant_state         TEXT;`,
      `ALTER TABLE "transaction" ADD COLUMN merchant_zip           TEXT;`,
      `ALTER TABLE "transaction" ADD COLUMN merchant_country       TEXT;`,
      `ALTER TABLE "transaction" ADD COLUMN external_reference_id  TEXT;`,
      `ALTER TABLE "transaction" ADD COLUMN statement_description  TEXT;`,
      `ALTER TABLE "transaction" ADD COLUMN custom_fields          TEXT;`,
      `ALTER TABLE "transaction" ADD COLUMN extra_notes            TEXT;`,
      `ALTER TABLE "transaction" ADD COLUMN counterparty_name      TEXT;`,
      `ALTER TABLE "transaction" ADD COLUMN counterparty_account_id TEXT;`,
    ],
  },
  {
    version: 5,
    label: 'account-balance-recompute-triggers',
    up: [
      `CREATE TRIGGER IF NOT EXISTS trg_transaction_balance_insert
        AFTER INSERT ON "transaction"
        FOR EACH ROW
        BEGIN
          UPDATE account
          SET current_balance = (
            SELECT COALESCE(SUM(amount), 0)
            FROM "transaction"
            WHERE account_id = NEW.account_id
              AND deleted_at IS NULL
          )
          WHERE id = NEW.account_id
            AND deleted_at IS NULL;
        END;`,
      `CREATE TRIGGER IF NOT EXISTS trg_transaction_balance_update_new
        AFTER UPDATE ON "transaction"
        FOR EACH ROW
        BEGIN
          UPDATE account
          SET current_balance = (
            SELECT COALESCE(SUM(amount), 0)
            FROM "transaction"
            WHERE account_id = NEW.account_id
              AND deleted_at IS NULL
          )
          WHERE id = NEW.account_id
            AND deleted_at IS NULL;
        END;`,
      `CREATE TRIGGER IF NOT EXISTS trg_transaction_balance_update_old
        AFTER UPDATE OF account_id ON "transaction"
        FOR EACH ROW
        WHEN OLD.account_id IS NOT NEW.account_id
        BEGIN
          UPDATE account
          SET current_balance = (
            SELECT COALESCE(SUM(amount), 0)
            FROM "transaction"
            WHERE account_id = OLD.account_id
              AND deleted_at IS NULL
          )
          WHERE id = OLD.account_id
            AND deleted_at IS NULL;
        END;`,
      `CREATE TRIGGER IF NOT EXISTS trg_transaction_balance_delete
        AFTER DELETE ON "transaction"
        FOR EACH ROW
        BEGIN
          UPDATE account
          SET current_balance = (
            SELECT COALESCE(SUM(amount), 0)
            FROM "transaction"
            WHERE account_id = OLD.account_id
              AND deleted_at IS NULL
          )
          WHERE id = OLD.account_id
            AND deleted_at IS NULL;
        END;`,
      `UPDATE account
        SET current_balance = (
          SELECT COALESCE(SUM(amount), 0)
          FROM "transaction"
          WHERE account_id = account.id
            AND deleted_at IS NULL
        )
        WHERE deleted_at IS NULL;`,
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
    // OPFS not usable — fall through
  }
  return 'indexeddb';
}

/**
 * Query the browser's storage quota estimate.
 *
 * Returns `{ quota, usage }` in bytes, or `null` values when the
 * StorageManager API is unavailable.
 */
export async function getStorageEstimate(): Promise<{
  quotaBytes: number | null;
  usageBytes: number | null;
}> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        quotaBytes: estimate.quota ?? null,
        usageBytes: estimate.usage ?? null,
      };
    }
  } catch {
    // StorageManager not available
  }
  return { quotaBytes: null, usageBytes: null };
}

/**
 * Returns a user-friendly message for a given storage error code.
 */
export function getUserFriendlyStorageMessage(code: StorageErrorCode): string {
  switch (code) {
    case 'WASM_LOAD_FAILED':
      return 'Failed to load the database engine. Please check your network connection and reload the page.';
    case 'OPFS_UNAVAILABLE':
      return 'Your browser does not support the required storage features. The app will use a fallback storage method.';
    case 'OPFS_INIT_FAILED':
      return 'Failed to initialize persistent storage. Falling back to alternative storage.';
    case 'INDEXEDDB_FAILED':
      return 'Browser storage is unavailable. Please check that your browser allows site data and that storage is not full.';
    case 'QUOTA_EXCEEDED':
      return 'Storage space is full. Please free up space by clearing unused site data in your browser settings.';
    case 'MIGRATION_FAILED':
      return 'Failed to update the database schema. Please try clearing site data and reloading.';
    case 'UNKNOWN':
    default:
      return 'An unexpected error occurred while setting up local storage. Please reload the page.';
  }
}

/** Classify an unknown error into a StorageErrorCode. */
function classifyError(err: unknown): StorageErrorCode {
  if (err instanceof StorageError) {
    return err.code;
  }
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';

  if (name === 'QuotaExceededError' || message.includes('quota')) {
    return 'QUOTA_EXCEEDED';
  }
  if (
    message.includes('OPFS') ||
    message.includes('createSyncAccessHandle') ||
    message.includes('OriginPrivateFileSystem')
  ) {
    return 'OPFS_INIT_FAILED';
  }
  if (
    message.includes('IndexedDB') ||
    message.includes('indexedDB') ||
    name === 'InvalidStateError'
  ) {
    return 'INDEXEDDB_FAILED';
  }
  if (
    message.includes('WebAssembly') ||
    message.includes('wasm') ||
    message.includes('WASM') ||
    message.includes('CompileError') ||
    message.includes('instantiate')
  ) {
    return 'WASM_LOAD_FAILED';
  }
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// Database initialisation
// ---------------------------------------------------------------------------

/**
 * Module-level singleton promise (#1909).
 *
 * Under React 19 StrictMode (dev), the {@link DatabaseProvider} effect
 * mounts twice — back-to-back — which previously launched two concurrent
 * `initDatabaseInternal()` calls against the same OPFS file.  The second
 * call's `BEGIN TRANSACTION` would auto-commit/rollback the first call's
 * still-open transaction, and the first call's subsequent `COMMIT;` would
 * throw "Cannot commit: no transaction is active".
 *
 * We dedupe by caching the in-flight promise.  Both StrictMode mounts now
 * share the same database instance and the same migration sequence runs
 * exactly once.
 *
 * On rejection we clear the cache so that {@link retryInitialization} from
 * the provider UI can recover from transient failures (e.g. flaky OPFS
 * handle, quota exhausted then freed).
 */
let _initPromise: Promise<StorageInitResult> | null = null;

/**
 * Reset the cached init promise.
 *
 * Intended ONLY for the Vitest test suite where module-level state from
 * one test can otherwise leak into the next.  Production code should
 * never need to call this — the singleton is designed to last for the
 * lifetime of the page.
 *
 * @internal
 */
export function _resetInitSingletonForTesting(): void {
  _initPromise = null;
}

/**
 * Initialises (or opens) the Finance SQLite database.
 *
 * 1. Detects the best storage backend (OPFS preferred, IndexedDB fallback).
 * 2. Loads the wa-sqlite or sql.js WASM module.
 * 3. Opens or creates the database file.
 * 4. Runs any pending migrations.
 * 5. Returns the database wrapper and diagnostic information.
 *
 * If OPFS initialization fails at runtime (even after detection succeeds),
 * the function automatically falls back to IndexedDB before giving up.
 *
 * Throws {@link StorageError} with a machine-readable `code` on failure.
 *
 * Concurrent callers (e.g. React 19 StrictMode's double-mounted effect)
 * receive the same in-flight promise — the database is opened and
 * migrations are executed exactly once per page load (#1909).
 *
 * Usage:
 * ```ts
 * const { db, diagnostics } = await initDatabaseWithDiagnostics();
 * ```
 */
export function initDatabaseWithDiagnostics(): Promise<StorageInitResult> {
  if (!_initPromise) {
    _initPromise = initDatabaseInternal().catch((error) => {
      // Allow the caller to retry after a failure (e.g. via the
      // ErrorBanner retry button in DatabaseProvider).
      _initPromise = null;
      throw error;
    });
  }
  return _initPromise;
}

async function initDatabaseInternal(): Promise<StorageInitResult> {
  const detectedBackend = await detectBackend();
  const opfsAvailable = detectedBackend === 'opfs';
  let didFallback = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sqlite3: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  let activeBackend: StorageBackend = detectedBackend;

  // --- Phase 1: Try the detected backend ---
  if (detectedBackend === 'opfs') {
    try {
      ({ sqlite3, db } = await initOpfsBackend());
    } catch {
      // OPFS detected but failed at runtime — try IndexedDB fallback
      didFallback = true;
      activeBackend = 'indexeddb';
      try {
        ({ sqlite3, db } = await initIndexedDbBackend());
      } catch (idbError) {
        const code = classifyError(idbError);
        throw new StorageError(code, getUserFriendlyStorageMessage(code), {
          cause: idbError,
          backend: 'indexeddb',
          fallbackAttempted: true,
        });
      }
    }
  } else {
    try {
      ({ sqlite3, db } = await initIndexedDbBackend());
    } catch (idbError) {
      const code = classifyError(idbError);
      throw new StorageError(code, getUserFriendlyStorageMessage(code), {
        cause: idbError,
        backend: 'indexeddb',
        fallbackAttempted: false,
      });
    }
  }

  // --- Phase 2: Configure pragmas ---
  try {
    execRaw(sqlite3, db, 'PRAGMA journal_mode = WAL;', activeBackend);
    execRaw(sqlite3, db, 'PRAGMA foreign_keys = ON;', activeBackend);
  } catch (pragmaError) {
    throw new StorageError('UNKNOWN', 'Failed to configure the database engine.', {
      cause: pragmaError,
      backend: activeBackend,
      fallbackAttempted: didFallback,
    });
  }

  // --- Phase 3: Run migrations ---
  try {
    await runMigrations(sqlite3, db, activeBackend);
  } catch (migrationError) {
    const code = migrationError instanceof StorageError ? migrationError.code : 'MIGRATION_FAILED';
    throw new StorageError(code, getUserFriendlyStorageMessage('MIGRATION_FAILED'), {
      cause: migrationError,
      backend: activeBackend,
      fallbackAttempted: didFallback,
    });
  }

  // --- Phase 4: Persist IndexedDB if needed ---
  if (activeBackend === 'indexeddb') {
    try {
      await persistToIndexedDB(DB_NAME, exportDatabase(sqlite3, db, activeBackend));
    } catch (persistError) {
      const code = classifyError(persistError);
      throw new StorageError(code, getUserFriendlyStorageMessage(code), {
        cause: persistError,
        backend: 'indexeddb',
        fallbackAttempted: didFallback,
      });
    }
  }

  // --- Phase 5: Gather diagnostics ---
  const storageEstimate = await getStorageEstimate();

  const wrapper = createDbWrapper(sqlite3, db, activeBackend);
  return {
    db: wrapper,
    diagnostics: {
      backend: activeBackend,
      opfsAvailable,
      didFallback,
      quotaBytes: storageEstimate.quotaBytes,
      usageBytes: storageEstimate.usageBytes,
    },
  };
}

/**
 * Initialises the Finance SQLite database (legacy convenience wrapper).
 *
 * Returns only the {@link SqliteDb} instance.  Use
 * {@link initDatabaseWithDiagnostics} when you need storage diagnostics.
 */
export async function initDatabase(): Promise<SqliteDb> {
  const { db } = await initDatabaseWithDiagnostics();
  return db;
}

// ---------------------------------------------------------------------------
// Backend-specific initializers
// ---------------------------------------------------------------------------

/** Initialise wa-sqlite with OPFS VFS. */
async function initOpfsBackend(): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sqlite3: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let wasmModule: any;
  try {
    const { default: SQLiteESMFactory } = await import(
      /* webpackChunkName: "wa-sqlite" */ 'wa-sqlite'
    );
    wasmModule = await SQLiteESMFactory();
  } catch (err) {
    throw new StorageError('WASM_LOAD_FAILED', getUserFriendlyStorageMessage('WASM_LOAD_FAILED'), {
      cause: err,
      backend: 'opfs',
    });
  }

  try {
    const { OriginPrivateFileSystemVFS } = await import(
      /* webpackChunkName: "wa-sqlite-vfs" */ 'wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js'
    );
    const vfs = await OriginPrivateFileSystemVFS.create(DB_NAME, wasmModule);
    wasmModule.vfs_register(vfs, /* makeDefault */ true);
    const dbHandle = await wasmModule.open_v2(DB_NAME);
    return { sqlite3: wasmModule, db: dbHandle };
  } catch (err) {
    const code = classifyError(err);
    throw new StorageError(
      code === 'UNKNOWN' ? 'OPFS_INIT_FAILED' : code,
      getUserFriendlyStorageMessage('OPFS_INIT_FAILED'),
      { cause: err, backend: 'opfs' },
    );
  }
}

/** Initialise sql.js with IndexedDB persistence. */
async function initIndexedDbBackend(): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sqlite3: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let SQL: any;
  try {
    const initSqlJs = (await import(/* webpackChunkName: "sql-js" */ 'sql.js')).default;
    SQL = await initSqlJs({
      locateFile: (file: string) => `/assets/sql-wasm/${file}`,
    });
  } catch (err) {
    throw new StorageError('WASM_LOAD_FAILED', getUserFriendlyStorageMessage('WASM_LOAD_FAILED'), {
      cause: err,
      backend: 'indexeddb',
    });
  }

  try {
    const savedBuffer = await loadFromIndexedDB(DB_NAME);
    const db = savedBuffer ? new SQL.Database(new Uint8Array(savedBuffer)) : new SQL.Database();
    return { sqlite3: SQL, db };
  } catch (err) {
    const code = classifyError(err);
    throw new StorageError(
      code === 'UNKNOWN' ? 'INDEXEDDB_FAILED' : code,
      getUserFriendlyStorageMessage(code === 'UNKNOWN' ? 'INDEXEDDB_FAILED' : code),
      { cause: err, backend: 'indexeddb' },
    );
  }
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
    let columns: string[];
    const stmt = driver.prepare(db, sql);
    try {
      if (params && params.length > 0) {
        driver.bind(stmt, params);
      }
      const colCount: number = driver.column_count(stmt);
      columns = Array.from({ length: colCount }, (_, i) => driver.column_name(stmt, i)) as string[];
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
      try {
        execRaw(driver, db, 'ROLLBACK;', backend);
      } catch {
        // ROLLBACK may fail if SQLite already auto-rolled back the transaction.
      }
      throw new Error(
        `Migration v${migration.version} (${migration.label}) failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
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
  // Try encrypted storage first when a secret is available
  if (_encryptionSecret) {
    try {
      const { loadEncryptedDatabase } = await import('./encryption');
      const decrypted = await loadEncryptedDatabase(_encryptionSecret);
      if (decrypted) {
        return decrypted.buffer as ArrayBuffer;
      }
    } catch {
      // Fall through to unencrypted load — first use or migration
    }
  }

  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(`${key}:${IDB_KEY}`);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function persistToIndexedDB(key: string, data: Uint8Array): Promise<void> {
  // Encrypt when a secret is available
  if (_encryptionSecret) {
    try {
      const { saveEncryptedDatabase } = await import('./encryption');
      await saveEncryptedDatabase(data, _encryptionSecret);
      return;
    } catch {
      // Fall through to unencrypted save as safety net
    }
  }

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
export function query<T = Row>(db: SqliteDb, sql: string, params?: unknown[]): QueryResult<T> {
  const rows = db.selectAll(sql, params) as T[];
  return {
    columns: rows.length > 0 ? Object.keys(rows[0] as object) : [],
    rows,
  };
}

/**
 * Execute a read query and return the first row or `null`.
 */
export function queryOne<T = Row>(db: SqliteDb, sql: string, params?: unknown[]): T | null {
  return db.selectOne(sql, params) as T | null;
}

/**
 * Execute a write statement (INSERT / UPDATE / DELETE).
 */
export function execute(db: SqliteDb, sql: string, params?: unknown[]): void {
  db.exec(sql, params);
}
