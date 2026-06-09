// SPDX-License-Identifier: BUSL-1.1

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ErrorBanner, LoadingSpinner } from '../components/common';
import { seedDatabase } from './seed';
import {
  initDatabaseWithDiagnostics,
  getUserFriendlyStorageMessage,
  StorageError,
  _resetInitSingletonForTesting,
  type SqliteDb,
  type StorageDiagnostics,
  type StorageErrorCode,
} from './sqlite-wasm';
import '../styles/pages.css';

/** Context value providing the database instance and diagnostics. */
export interface DatabaseContextValue {
  /** The initialised SQLite-WASM database instance. */
  db: SqliteDb;
  /** Storage diagnostics from initialisation. */
  diagnostics: StorageDiagnostics;
}

/** React context that stores the shared SQLite-WASM database instance. */
export const DatabaseContext = createContext<DatabaseContextValue | null>(null);
DatabaseContext.displayName = 'DatabaseContext';

interface DatabaseProviderProps {
  children: ReactNode;
}

/** Structured error state for the provider UI. */
interface InitError {
  /** Machine-readable error code. */
  code: StorageErrorCode;
  /** User-friendly error message. */
  message: string;
  /** Technical detail for diagnostics (not shown to users by default). */
  detail: string | null;
}

function toInitError(error: unknown): InitError {
  if (error instanceof StorageError) {
    return {
      code: error.code,
      message: error.message,
      detail: error.cause instanceof Error ? error.cause.message : null,
    };
  }
  const message =
    error instanceof Error ? error.message : 'Failed to initialize the local database.';
  return {
    code: 'UNKNOWN',
    message,
    detail: null,
  };
}

// ---------------------------------------------------------------------------
// E2E stub — Playwright sets window.__PLAYWRIGHT_E2E__ via addInitScript()
// so the real SQLite-WASM init (which requires WASM binaries not present in
// the production build's static assets) is skipped entirely.
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __PLAYWRIGHT_E2E__?: boolean;
  }
}

/** Minimal in-memory database stub used during E2E tests. */
function createE2eTableData(): Record<string, Array<Record<string, unknown>>> {
  const now = new Date('2026-05-26T12:00:00.000Z').toISOString();
  return {
    user: [
      {
        id: 'e2e-user-1',
        email: 'demo@finance.local',
        display_name: 'E2E User',
        avatar_url: null,
        default_currency: 'USD',
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      },
    ],
    household: [
      {
        id: 'e2e-household-1',
        name: 'E2E Household',
        owner_id: 'e2e-user-1',
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      },
    ],
    household_member: [
      {
        id: 'e2e-member-1',
        household_id: 'e2e-household-1',
        user_id: 'e2e-user-1',
        role: 'OWNER',
        joined_at: now,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      },
    ],
    account: [
      {
        id: 'e2e-account-1',
        household_id: 'e2e-household-1',
        name: 'Checking',
        type: 'CHECKING',
        currency: 'USD',
        current_balance: 250000,
        is_archived: 0,
        sort_order: 1,
        icon: 'bank',
        color: '#2563EB',
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      },
    ],
    category: [
      {
        id: 'e2e-category-1',
        household_id: 'e2e-household-1',
        name: 'Food',
        icon: 'utensils',
        color: '#16A34A',
        parent_id: null,
        is_income: 0,
        is_system: 0,
        sort_order: 1,
        is_biometric_protected: 0,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      },
    ],
    budget: [
      {
        id: 'e2e-budget-1',
        household_id: 'e2e-household-1',
        category_id: 'e2e-category-1',
        name: 'Groceries',
        amount: 50000,
        currency: 'USD',
        period: 'MONTHLY',
        start_date: '2026-05-01',
        end_date: null,
        is_rollover: 0,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      },
    ],
    goal: [
      {
        id: 'e2e-goal-1',
        household_id: 'e2e-household-1',
        name: 'Emergency fund',
        description: 'Three months expenses',
        target_amount: 1000000,
        current_amount: 250000,
        currency: 'USD',
        target_date: '2026-12-31',
        status: 'ACTIVE',
        icon: 'piggy-bank',
        color: '#059669',
        account_id: 'e2e-account-1',
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      },
    ],
    transaction: [
      {
        id: 'e2e-transaction-1',
        household_id: 'e2e-household-1',
        account_id: 'e2e-account-1',
        category_id: 'e2e-category-1',
        type: 'EXPENSE',
        status: 'CLEARED',
        amount: -6742,
        currency: 'USD',
        payee: 'Grocery Store',
        note: 'Weekly shop',
        date: '2026-05-25',
        transfer_account_id: null,
        transfer_transaction_id: null,
        is_recurring: 0,
        recurring_rule_id: null,
        tags: '[]',
        mood_tag: null,
        merchant_address: null,
        merchant_city: null,
        merchant_state: null,
        merchant_zip: null,
        merchant_country: null,
        external_reference_id: null,
        statement_description: null,
        custom_fields: null,
        extra_notes: null,
        counterparty_name: null,
        counterparty_account_id: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        sync_version: 1,
        is_synced: 0,
      },
    ],
    goal_progress_contribution: [],
  };
}

function tableNameFromSql(sql: string): string | null {
  return /(?:FROM|INTO|DELETE FROM)\s+"?([a-zA-Z_][\w]*)"?/i.exec(sql)?.[1] ?? null;
}

function createE2eStubDb(): SqliteDb {
  const tables = createE2eTableData();
  return {
    exec: (sql, params) => {
      const deleteTable = /^DELETE FROM\s+"?([a-zA-Z_][\w]*)"?/i.exec(sql)?.[1];
      if (deleteTable) {
        tables[deleteTable] = [];
        return;
      }
      const insert = /^INSERT INTO\s+"?([a-zA-Z_][\w]*)"?\s+\((.+)\)\s+VALUES/i.exec(sql);
      if (insert) {
        const columns = [...insert[2].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
        const row = Object.fromEntries(columns.map((column, index) => [column, params?.[index]]));
        tables[insert[1]] = [...(tables[insert[1]] ?? []), row];
      }
    },
    selectAll: (sql) => {
      const table = tableNameFromSql(sql);
      if (!table) return [];
      const rows = (tables[table] ?? []).filter((row) => row.deleted_at == null);
      if (/SELECT\s+id\s+FROM/i.test(sql)) return rows.map((row) => ({ id: row.id }));
      return rows;
    },
    selectOne: (sql) => {
      const rows = E2E_STUB_DB.selectAll(sql);
      return rows[0] ?? null;
    },
    close: async () => {},
  };
}

const E2E_STUB_DB: SqliteDb = createE2eStubDb();

const E2E_STUB_DIAGNOSTICS: StorageDiagnostics = {
  backend: 'indexeddb',
  opfsAvailable: false,
  didFallback: false,
  quotaBytes: null,
  usageBytes: null,
};

/** Initialize SQLite-WASM and provide the database instance to descendants. */
export function DatabaseProvider({ children }: DatabaseProviderProps) {
  // Skip real DB init in E2E tests — WASM binaries aren't in the static
  // build output, so SQLiteESMFactory / initSqlJs would hang forever.
  const [isE2E] = useState(
    () => typeof window !== 'undefined' && window.__PLAYWRIGHT_E2E__ === true,
  );

  const [ctxValue, setCtxValue] = useState<DatabaseContextValue | null>(
    isE2E ? { db: E2E_STUB_DB, diagnostics: E2E_STUB_DIAGNOSTICS } : null,
  );
  const [isLoading, setIsLoading] = useState(!isE2E);
  const [initError, setInitError] = useState<InitError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const retryInitialization = useCallback(() => {
    // Clear the cached singleton so the next init call actually retries
    // (the singleton clears itself on rejection, but explicit reset is
    // safer if the retry button is somehow pressed during a success).
    _resetInitSingletonForTesting();
    setReloadToken((currentValue) => currentValue + 1);
  }, []);

  useEffect(() => {
    // In E2E mode the stub DB is already set — skip real WASM init.
    if (isE2E) return;

    // React 19 StrictMode double-mounts the provider in dev.  We rely on
    // the module-level singleton in `initDatabaseWithDiagnostics()` so
    // both mounts converge on the SAME init promise — running the
    // migration sequence exactly once (#1909).
    //
    // We intentionally DO NOT call `db.close()` in the cleanup function.
    // The database is a process-wide singleton that lives for the page
    // lifetime.  Closing it during StrictMode's synthetic unmount would
    // hand the second mount a dead instance and cause "Cannot commit:
    // no transaction is active" or "database is closed" errors.
    let isDisposed = false;

    const initializeDatabase = async () => {
      setIsLoading(true);
      setInitError(null);
      setCtxValue(null);

      try {
        const result = await initDatabaseWithDiagnostics();

        await seedDatabase(result.db);

        if (isDisposed) {
          // Provider truly unmounted (not just StrictMode replay) — leave
          // the cached DB in place; the next provider mount will pick it
          // up via the singleton promise.
          return;
        }

        setCtxValue({ db: result.db, diagnostics: result.diagnostics });
      } catch (initializationError) {
        if (!isDisposed) {
          setInitError(toInitError(initializationError));
        }
      } finally {
        if (!isDisposed) {
          setIsLoading(false);
        }
      }
    };

    void initializeDatabase();

    return () => {
      isDisposed = true;
    };
  }, [isE2E, reloadToken]);

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" className="page-loading--fullscreen">
        <LoadingSpinner label="Initializing database" />
      </div>
    );
  }

  if (initError || !ctxValue) {
    const errorCode = initError?.code ?? 'UNKNOWN';
    const errorMessage = initError?.message ?? getUserFriendlyStorageMessage('UNKNOWN');

    return (
      <div className="page-error-wrapper page-error-wrapper--centered" role="alert">
        <ErrorBanner message={errorMessage} onRetry={retryInitialization} />
        {initError?.detail && (
          <details className="db-error-details">
            <summary className="db-error-details__summary">Technical details</summary>
            <p className="db-error-details__code">Error code: {errorCode}</p>
            <p className="db-error-details__code">{initError.detail}</p>
          </details>
        )}
      </div>
    );
  }

  return <DatabaseContext.Provider value={ctxValue}>{children}</DatabaseContext.Provider>;
}

/** Access the shared SQLite-WASM database instance from React context. */
export function useDatabase(): SqliteDb {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }

  return context.db;
}

/** Access storage diagnostics from the initialization. */
export function useStorageDiagnostics(): StorageDiagnostics | null {
  const context = useContext(DatabaseContext);
  return context?.diagnostics ?? null;
}
