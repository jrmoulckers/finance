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

import { extractTablesFromSql, isMutationSql, notifyDataChange } from '../lib/sync/crossTab';
import {
  clearSqliteAtRestEncryptionStores,
  hasEncryptedSqliteSnapshot,
  isSqliteAtRestEncryptionEnabled,
  isSqliteAtRestEncryptionSupported,
  loadEncryptedSqliteSnapshot,
  persistEncryptedSqliteSnapshot,
} from './sqlite-at-rest-encryption';

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
  /** Storage backend used by this connection, when known. */
  readonly backend?: StorageBackend;
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

function encryptionUnavailableError(): StorageError {
  return new StorageError(
    'INDEXEDDB_FAILED',
    'Encrypted SQLite storage requires IndexedDB and Web Crypto support.',
    { backend: 'indexeddb' },
  );
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Schema - matches packages/models SQLDelight .sq files
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
  {
    version: 6,
    label: 'add-description-to-goals',
    up: [`ALTER TABLE goal ADD COLUMN description TEXT;`],
  },
  {
    version: 7,
    label: 'add-goal-progress-contributions',
    up: [
      `CREATE TABLE IF NOT EXISTS goal_progress_contribution (
        id             TEXT    NOT NULL PRIMARY KEY,
        goal_id        TEXT    NOT NULL,
        household_id   TEXT    NOT NULL,
        amount         INTEGER NOT NULL,
        currency       TEXT    NOT NULL DEFAULT 'USD',
        note           TEXT,
        contributed_at TEXT    NOT NULL,
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL,
        deleted_at     TEXT,
        sync_version   INTEGER NOT NULL DEFAULT 0,
        is_synced      INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (goal_id)      REFERENCES goal(id),
        FOREIGN KEY (household_id) REFERENCES household(id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_goal_progress_contribution_goal ON goal_progress_contribution (goal_id);`,
      `CREATE INDEX IF NOT EXISTS idx_goal_progress_contribution_household ON goal_progress_contribution (household_id);`,
      `CREATE INDEX IF NOT EXISTS idx_goal_progress_contribution_sync ON goal_progress_contribution (is_synced);`,
    ],
  },
  {
    version: 8,
    label: 'add-sort-order-to-budget-and-goal',
    up: [
      `ALTER TABLE budget ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`,
      `WITH ordered_budget AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY start_date DESC, name ASC, id ASC) - 1 AS sort_order
          FROM budget
         WHERE deleted_at IS NULL
      )
      UPDATE budget
         SET sort_order = (
           SELECT ordered_budget.sort_order
             FROM ordered_budget
            WHERE ordered_budget.id = budget.id
         )
       WHERE id IN (SELECT id FROM ordered_budget);`,
      `ALTER TABLE goal ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`,
      `WITH ordered_goal AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 ORDER BY (target_date IS NULL) ASC, target_date ASC, name ASC, id ASC
               ) - 1 AS sort_order
          FROM goal
         WHERE deleted_at IS NULL
      )
      UPDATE goal
         SET sort_order = (
           SELECT ordered_goal.sort_order
             FROM ordered_goal
            WHERE ordered_goal.id = goal.id
         )
       WHERE id IN (SELECT id FROM ordered_goal);`,
    ],
  },
  {
    version: 9,
    label: 'add-account-purpose',
    up: [`ALTER TABLE account ADD COLUMN purpose TEXT NOT NULL DEFAULT 'personal';`],
  },
  {
    version: 10,
    label: 'add-account-reconciliation-history',
    up: [
      `CREATE TABLE IF NOT EXISTS account_reconciliation (
        id                        TEXT    NOT NULL PRIMARY KEY,
        account_id                TEXT    NOT NULL,
        household_id              TEXT    NOT NULL,
        statement_date            TEXT    NOT NULL,
        statement_balance         INTEGER NOT NULL,
        starting_balance          INTEGER NOT NULL,
        cleared_transaction_count INTEGER NOT NULL DEFAULT 0,
        transaction_ids           TEXT    NOT NULL DEFAULT '[]',
        created_by                TEXT    NOT NULL,
        created_at                TEXT    NOT NULL,
        updated_at                TEXT    NOT NULL,
        deleted_at                TEXT,
        sync_version              INTEGER NOT NULL DEFAULT 0,
        is_synced                 INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (account_id)   REFERENCES account(id),
        FOREIGN KEY (household_id) REFERENCES household(id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_account_reconciliation_account ON account_reconciliation (account_id);`,
      `CREATE INDEX IF NOT EXISTS idx_account_reconciliation_statement_date ON account_reconciliation (statement_date);`,
      `CREATE INDEX IF NOT EXISTS idx_account_reconciliation_sync ON account_reconciliation (is_synced);`,
    ],
  },
  {
    version: 11,
    label: 'add-transaction-splits',
    up: [`ALTER TABLE "transaction" ADD COLUMN splits TEXT;`],
  },
  {
    version: 12,
    label: 'add-retirement-contribution-metadata',
    up: [
      `ALTER TABLE account ADD COLUMN retirement_account_type TEXT;`,
      `ALTER TABLE account ADD COLUMN retirement_tax_treatment TEXT;`,
      `ALTER TABLE account ADD COLUMN hsa_coverage_level TEXT;`,
      `ALTER TABLE "transaction" ADD COLUMN retirement_contribution_year INTEGER;`,
      `ALTER TABLE "transaction" ADD COLUMN retirement_contribution_designation TEXT;`,
      `CREATE INDEX IF NOT EXISTS idx_account_retirement_type ON account (retirement_account_type);`,
      `CREATE INDEX IF NOT EXISTS idx_transaction_retirement_contribution_year ON "transaction" (retirement_contribution_year);`,
    ],
  },
  {
    version: 13,
    label: 'add-sort-order-to-category',
    up: [
      // The `category` table was created without a sort_order column, but the
      // categories repository (and seeding) order by / insert sort_order — so a
      // real (non-stub) database failed on first use with
      // "table category has no column named sort_order". Add it here, matching
      // the budget/goal sort_order migrations.
      `ALTER TABLE category ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`,
      `WITH ordered_category AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 ORDER BY (parent_id IS NOT NULL) ASC, parent_id ASC, name ASC, id ASC
               ) - 1 AS sort_order
          FROM category
         WHERE deleted_at IS NULL
      )
      UPDATE category
         SET sort_order = (
           SELECT ordered_category.sort_order
             FROM ordered_category
            WHERE ordered_category.id = category.id
         )
       WHERE id IN (SELECT id FROM ordered_category);`,
      `CREATE INDEX IF NOT EXISTS idx_category_sort ON category (sort_order);`,
    ],
  },
  {
    version: 14,
    label: 'add-invoices-and-remittances',
    up: [
      // Move the freelancer invoice pipeline and cross-border remittance history
      // off browser localStorage onto the encrypted SQLite/OPFS store so business
      // records are durable and ride the sync path like accounts/transactions
      // (#3273). These are web-first tables today; the durable model is expected
      // to land in the shared KMP/PowerSync schema next (note for @kmp-engineer /
      // @backend-engineer). `household_id` is nullable so a record created before
      // any household exists (e.g. a clean-slate workspace) still persists; it is
      // resolved to the primary household when one is present, mirroring the goal
      // onboarding pattern (getPrimaryHouseholdId, #3405).
      `CREATE TABLE IF NOT EXISTS invoice (
        id                     TEXT    NOT NULL PRIMARY KEY,
        household_id           TEXT,
        client_name            TEXT    NOT NULL,
        amount_cents           INTEGER NOT NULL,
        issue_date             TEXT    NOT NULL,
        payment_term           TEXT    NOT NULL,
        status                 TEXT    NOT NULL DEFAULT 'Sent',
        expected_pay_date      TEXT    NOT NULL,
        last_contacted_date    TEXT,
        amount_paid_cents      INTEGER NOT NULL DEFAULT 0,
        paid_date              TEXT,
        payment_account_id     TEXT,
        payment_transaction_id TEXT,
        created_at             TEXT    NOT NULL,
        updated_at             TEXT    NOT NULL,
        deleted_at             TEXT,
        sync_version           INTEGER NOT NULL DEFAULT 0,
        is_synced              INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (household_id)           REFERENCES household(id),
        FOREIGN KEY (payment_account_id)     REFERENCES account(id),
        FOREIGN KEY (payment_transaction_id) REFERENCES "transaction"(id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_invoice_household ON invoice (household_id);`,
      `CREATE INDEX IF NOT EXISTS idx_invoice_status    ON invoice (status);`,
      `CREATE INDEX IF NOT EXISTS idx_invoice_sync      ON invoice (is_synced);`,

      `CREATE TABLE IF NOT EXISTS remittance (
        id                TEXT    NOT NULL PRIMARY KEY,
        household_id      TEXT,
        date              TEXT    NOT NULL,
        source_currency   TEXT    NOT NULL,
        dest_currency     TEXT    NOT NULL,
        send_amount_minor INTEGER NOT NULL,
        fee_minor         INTEGER NOT NULL,
        fx_rate           REAL    NOT NULL,
        fee_model         TEXT    NOT NULL,
        reference_rate    REAL,
        recipient_name    TEXT    NOT NULL,
        recipient_country TEXT    NOT NULL,
        note              TEXT,
        created_at        TEXT    NOT NULL,
        updated_at        TEXT    NOT NULL,
        deleted_at        TEXT,
        sync_version      INTEGER NOT NULL DEFAULT 0,
        is_synced         INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (household_id) REFERENCES household(id)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_remittance_household ON remittance (household_id);`,
      `CREATE INDEX IF NOT EXISTS idx_remittance_date      ON remittance (date);`,
      `CREATE INDEX IF NOT EXISTS idx_remittance_sync      ON remittance (is_synced);`,
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
      locateFile: (file: string) => `${import.meta.env.BASE_URL}assets/sql-wasm/${file}`,
    });
  } catch (err) {
    throw new StorageError('WASM_LOAD_FAILED', getUserFriendlyStorageMessage('WASM_LOAD_FAILED'), {
      cause: err,
      backend: 'indexeddb',
    });
  }

  let savedBuffer: ArrayBuffer | null;
  try {
    savedBuffer = await loadFromIndexedDB(DB_NAME);
  } catch (err) {
    // Reading the persisted snapshot failed for a reason we cannot fix by
    // discarding data — IndexedDB is blocked/unavailable, or an encrypted
    // snapshot could not be decrypted. Surface it to the storage-error gate.
    const code = classifyError(err);
    throw new StorageError(
      code === 'UNKNOWN' ? 'INDEXEDDB_FAILED' : code,
      getUserFriendlyStorageMessage(code === 'UNKNOWN' ? 'INDEXEDDB_FAILED' : code),
      { cause: err, backend: 'indexeddb' },
    );
  }

  try {
    const db = await openSnapshotWithRecovery(SQL, savedBuffer, discardCorruptSnapshotStores);
    return { sqlite3: SQL, db };
  } catch (err) {
    // Reached only if even a fresh, empty database cannot be created.
    const code = classifyError(err);
    throw new StorageError(
      code === 'UNKNOWN' ? 'INDEXEDDB_FAILED' : code,
      getUserFriendlyStorageMessage(code === 'UNKNOWN' ? 'INDEXEDDB_FAILED' : code),
      { cause: err, backend: 'indexeddb' },
    );
  }
}

/**
 * Discard every device-local SQLite snapshot store after corruption is
 * detected, so no unreadable snapshot survives to re-trigger recovery on the
 * next boot.
 *
 * A corrupt snapshot can live in EITHER the plaintext store ({@link IDB_STORE})
 * or the encrypted store: {@link loadFromIndexedDB} prefers the encrypted
 * snapshot whenever at-rest encryption is *supported* — even when the feature
 * flag is off — so the bytes we failed to open may have come from either place.
 * Clearing both (the durable copy lives on the sync server) is the only way to
 * guarantee the next boot starts clean.
 */
async function discardCorruptSnapshotStores(): Promise<void> {
  await deleteIndexedDbDatabase(IDB_STORE);
  await clearSqliteAtRestEncryptionStores();
}

/**
 * Open a persisted snapshot, automatically recovering from corruption.
 *
 * sql.js throws when handed bytes it cannot parse as a SQLite image (corrupt,
 * truncated, or written by an incompatible build). Because the durable copy of
 * the user's data lives on the sync server (local-first), an unreadable
 * snapshot is discarded and we start from an empty database that re-hydrates on
 * the next sync — rather than dead-ending the user at the storage-error gate
 * with no recovery (#3094).
 *
 * Recovery is intentionally narrow: it triggers only when a snapshot exists but
 * cannot be read. A missing snapshot is a normal first run, and a failure to
 * *load* the snapshot bytes (IndexedDB unavailable) is handled by the caller.
 */
async function openSnapshotWithRecovery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SQL: any,
  savedBuffer: ArrayBuffer | null,
  discardCorruptSnapshot: () => Promise<void>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (!savedBuffer) {
    return new SQL.Database();
  }

  try {
    const db = new SQL.Database(new Uint8Array(savedBuffer));
    assertSnapshotReadable(db);
    return db;
  } catch (corruptionError) {
    // eslint-disable-next-line no-console
    console.warn(
      '[sqlite-wasm] Persisted database snapshot is unreadable; discarding it and ' +
        'starting fresh. Local data will re-hydrate from the server on the next sync.',
      corruptionError,
    );
    await discardCorruptSnapshot();
    return new SQL.Database();
  }
}

/**
 * Force sql.js to read the database header and schema so a corrupt or truncated
 * snapshot fails fast here — where {@link openSnapshotWithRecovery} can recover
 * — instead of later during migrations or the first user query. Walking
 * `sqlite_master` is cheap and throws on a malformed database image.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assertSnapshotReadable(db: any): void {
  db.exec('SELECT count(*) FROM sqlite_master;');
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

type SavepointOperation = 'release' | 'rollback';
type SavepointLogBackend = StorageBackend | 'unknown';

const NO_ACTIVE_TRANSACTION_ERROR = 'no transaction is active';
const NO_SUCH_SAVEPOINT_ERROR = 'no such savepoint';

/**
 * Detect the benign "the savepoint/transaction is already gone" conditions.
 *
 * `RELEASE SAVEPOINT` / `ROLLBACK TO SAVEPOINT` are cleanup operations. They
 * are only ever issued to settle a savepoint we previously opened, so if
 * SQLite reports that the savepoint (or the enclosing transaction) no longer
 * exists, the work the savepoint guarded is already settled and the cleanup
 * is a no-op rather than a fatal error. Two distinct SQLite messages map to
 * this state:
 *
 *   - `cannot commit/rollback - no transaction is active` — the enclosing
 *     transaction already ended (e.g. a cold-start race finalised it first).
 *   - `no such savepoint: <name>` — the named savepoint was already released.
 *     This is the failure that surfaced demo-seeding's `no such savepoint:
 *     seed_init` on the real wa-sqlite/OPFS backend (#2797): that backend can
 *     implicitly release the seed savepoint before `seedDatabase()` reaches
 *     its explicit `RELEASE`, after the demo rows have already been written.
 *     The sql.js backend used by unit tests never reproduces this, which is
 *     why the bug slipped past CI.
 *
 * Suppressing both keeps savepoint cleanup idempotent so a benign
 * already-released savepoint never masks the real outcome (or aborts an
 * otherwise-successful seed).
 */
function isBenignSavepointCleanupError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes(NO_ACTIVE_TRANSACTION_ERROR) || message.includes(NO_SUCH_SAVEPOINT_ERROR);
}

function getSavepointIdentifier(savepointName: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(savepointName)) {
    throw new Error(`Invalid SQLite savepoint name: ${savepointName}`);
  }
  return savepointName;
}

function logSuppressedSavepointCleanup(
  operation: SavepointOperation,
  backend: SavepointLogBackend,
  savepointName: string,
  error: unknown,
): void {
  // eslint-disable-next-line no-console
  console.warn(
    `[sqlite-wasm] Suppressed ${operation} for already-released savepoint "${savepointName}" on ${backend} backend.`,
    { backend, savepointName, error },
  );
}

function execSavepointControl(
  executor: () => void,
  operation: SavepointOperation,
  backend: SavepointLogBackend,
  savepointName: string,
): void {
  try {
    executor();
  } catch (error) {
    if (isBenignSavepointCleanupError(error)) {
      logSuppressedSavepointCleanup(operation, backend, savepointName, error);
      return;
    }
    throw error;
  }
}

type TransactionControlEffect = 'enter' | 'leave' | 'end' | 'rollbackTo' | null;

function getTransactionControlEffect(sql: string): TransactionControlEffect {
  const normalized = sql.trimStart();

  if (/^BEGIN\b/i.test(normalized) || /^SAVEPOINT\b/i.test(normalized)) {
    return 'enter';
  }
  if (/^RELEASE(?:\s+SAVEPOINT)?\b/i.test(normalized)) {
    return 'leave';
  }
  if (/^ROLLBACK\s+TO(?:\s+SAVEPOINT)?\b/i.test(normalized)) {
    return 'rollbackTo';
  }
  if (/^(?:COMMIT|END)\b/i.test(normalized) || /^ROLLBACK\b/i.test(normalized)) {
    return 'end';
  }

  return null;
}

function createIndexedDbPersistenceGate(): (sql: string) => boolean {
  let transactionDepth = 0;

  return (sql: string): boolean => {
    const controlEffect = getTransactionControlEffect(sql);

    switch (controlEffect) {
      case 'enter':
        transactionDepth += 1;
        return false;
      case 'leave':
        transactionDepth = Math.max(0, transactionDepth - 1);
        return transactionDepth === 0;
      case 'end':
        transactionDepth = 0;
        return true;
      case 'rollbackTo':
        return false;
      default:
        return transactionDepth === 0;
    }
  };
}

export function _shouldPersistIndexedDbAfterExecForTesting(
  sqlStatements: readonly string[],
): boolean[] {
  const shouldPersist = createIndexedDbPersistenceGate();
  return sqlStatements.map((sql) => shouldPersist(sql));
}

function releaseSavepointRaw(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  driver: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  backend: StorageBackend,
  savepointName: string,
): void {
  const savepointIdentifier = getSavepointIdentifier(savepointName);
  execSavepointControl(
    () => execRaw(driver, db, `RELEASE SAVEPOINT ${savepointIdentifier};`, backend),
    'release',
    backend,
    savepointName,
  );
}

function rollbackToSavepointRaw(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  driver: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  backend: StorageBackend,
  savepointName: string,
): void {
  const savepointIdentifier = getSavepointIdentifier(savepointName);
  execSavepointControl(
    () => execRaw(driver, db, `ROLLBACK TO SAVEPOINT ${savepointIdentifier};`, backend),
    'rollback',
    backend,
    savepointName,
  );
}

export function releaseSavepoint(db: SqliteDb, savepointName: string): void {
  const savepointIdentifier = getSavepointIdentifier(savepointName);
  execSavepointControl(
    () => execute(db, `RELEASE SAVEPOINT ${savepointIdentifier};`),
    'release',
    db.backend ?? 'unknown',
    savepointName,
  );
}

export function rollbackToSavepoint(db: SqliteDb, savepointName: string): void {
  const savepointIdentifier = getSavepointIdentifier(savepointName);
  execSavepointControl(
    () => execute(db, `ROLLBACK TO SAVEPOINT ${savepointIdentifier};`),
    'rollback',
    db.backend ?? 'unknown',
    savepointName,
  );
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

    const savepointName = `migration_${migration.version}`;
    const savepointIdentifier = getSavepointIdentifier(savepointName);
    execRaw(driver, db, `SAVEPOINT ${savepointIdentifier};`, backend);
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

      releaseSavepointRaw(driver, db, backend, savepointName);
    } catch (err) {
      try {
        rollbackToSavepointRaw(driver, db, backend, savepointName);
        releaseSavepointRaw(driver, db, backend, savepointName);
      } catch {
        // Preserve the original migration error if SQLite already ended the savepoint.
      }
      throw new Error(
        `Migration v${migration.version} (${migration.label}) failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }
}

export async function _runMigrationsForTesting(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  driver: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  backend: StorageBackend = 'indexeddb',
): Promise<void> {
  await runMigrations(driver, db, backend);
}

export function _createDbWrapperForTesting(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  driver: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  backend: StorageBackend = 'indexeddb',
): SqliteDb {
  return createDbWrapper(driver, db, backend);
}

// ---------------------------------------------------------------------------
// IndexedDB persistence helpers (fallback only)
// ---------------------------------------------------------------------------

const IDB_STORE = 'finance-sqlite';
const IDB_KEY = 'db';

/** Upper bound on how long {@link deleteIndexedDbDatabase} waits before giving up. */
const IDB_DELETE_TIMEOUT_MS = 3_000;

/**
 * Delete an IndexedDB database by name, resolving even when the delete is
 * blocked by another open connection or the environment has no IndexedDB.
 *
 * Self-healing must never hang on a stuck delete (e.g. a second tab still
 * holding the database open), so a timeout guarantees the promise settles.
 */
function deleteIndexedDbDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, IDB_DELETE_TIMEOUT_MS);

    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = finish;
      request.onerror = finish;
      // Another open connection blocks deletion; don't wait on it forever.
      request.onblocked = finish;
    } catch {
      finish();
    }
  });
}

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
  if (!isSqliteAtRestEncryptionEnabled()) {
    if (isSqliteAtRestEncryptionSupported()) {
      try {
        const decrypted = await loadEncryptedSqliteSnapshot(key);
        if (decrypted) {
          return toExactArrayBuffer(decrypted);
        }
      } catch (error) {
        const plaintext = await loadPlaintextFromIndexedDB(key);
        if (plaintext) {
          return plaintext;
        }
        throw error;
      }
    } else if (await hasEncryptedSqliteSnapshot()) {
      throw encryptionUnavailableError();
    }

    return loadPlaintextFromIndexedDB(key);
  }

  if (!isSqliteAtRestEncryptionSupported()) {
    throw encryptionUnavailableError();
  }

  const decrypted = await loadEncryptedSqliteSnapshot(key);
  if (decrypted) {
    return toExactArrayBuffer(decrypted);
  }

  return loadPlaintextFromIndexedDB(key);
}

async function loadPlaintextFromIndexedDB(key: string): Promise<ArrayBuffer | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(key + ':' + IDB_KEY);
    req.onsuccess = () => {
      idb.close();
      resolve(req.result ?? null);
    };
    req.onerror = () => {
      idb.close();
      reject(req.error);
    };
  });
}

async function persistToIndexedDB(key: string, data: Uint8Array): Promise<void> {
  if (!isSqliteAtRestEncryptionEnabled()) {
    return persistPlaintextToIndexedDB(key, data);
  }

  if (!isSqliteAtRestEncryptionSupported()) {
    throw encryptionUnavailableError();
  }

  await persistEncryptedSqliteSnapshot(key, data);
  await deletePlaintextFromIndexedDB(key);
}

async function persistPlaintextToIndexedDB(key: string, data: Uint8Array): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put(toExactArrayBuffer(data), key + ':' + IDB_KEY);
    tx.oncomplete = () => {
      idb.close();
      resolve();
    };
    tx.onerror = () => {
      idb.close();
      reject(tx.error);
    };
  });
}

async function deletePlaintextFromIndexedDB(key: string): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key + ':' + IDB_KEY);
    tx.oncomplete = () => {
      idb.close();
      resolve();
    };
    tx.onerror = () => {
      idb.close();
      resolve();
    };
  });
}

export const __sqliteIndexedDbPersistenceForTesting = {
  loadFromIndexedDB,
  loadPlaintextFromIndexedDB,
  persistToIndexedDB,
  persistPlaintextToIndexedDB,
  deletePlaintextFromIndexedDB,
};

/** @internal Test seam for the corrupt-snapshot self-healing path (#3094). */
export const __sqliteRecoveryForTesting = {
  openSnapshotWithRecovery,
  deleteIndexedDbDatabase,
  discardCorruptSnapshotStores,
};

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
  const shouldPersistAfterExec = backend === 'indexeddb' ? createIndexedDbPersistenceGate() : null;

  return {
    backend,

    exec(sql: string, params?: unknown[]): void {
      execRaw(driver, db, sql, backend, params);
      if (backend === 'indexeddb' && shouldPersistAfterExec?.(sql) === true) {
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

  if (isMutationSql(sql)) {
    notifyDataChange(extractTablesFromSql(sql));
  }
}
