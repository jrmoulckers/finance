// SPDX-License-Identifier: BUSL-1.1

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ErrorBanner, LoadingSpinner } from '../components/common';
import { seedDatabase } from './seed';
import {
  initDatabaseWithDiagnostics,
  getUserFriendlyStorageMessage,
  StorageError,
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

/**
 * Minimal in-memory database stub used during E2E tests.
 *
 * Returns empty results for all queries.  Page components render their
 * "no data" / empty states, which is sufficient for E2E structural and
 * navigation tests that don't depend on seed data.
 */
const E2E_STUB_DB: SqliteDb = {
  exec: () => {},
  selectAll: () => [],
  selectOne: () => null,
  close: async () => {},
};

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
    setReloadToken((currentValue) => currentValue + 1);
  }, []);

  useEffect(() => {
    // In E2E mode the stub DB is already set — skip real WASM init.
    if (isE2E) return;

    let isDisposed = false;
    let initializedDb: SqliteDb | null = null;

    const initializeDatabase = async () => {
      setIsLoading(true);
      setInitError(null);
      setCtxValue(null);

      try {
        const result = await initDatabaseWithDiagnostics();
        initializedDb = result.db;

        await seedDatabase(initializedDb);

        if (isDisposed) {
          await initializedDb.close();
          initializedDb = null;
          return;
        }

        setCtxValue({ db: initializedDb, diagnostics: result.diagnostics });
      } catch (initializationError) {
        if (initializedDb) {
          try {
            await initializedDb.close();
          } catch {
            // Ignore cleanup failures after an init error.
          }
          initializedDb = null;
        }

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
      if (initializedDb) {
        void initializedDb.close();
        initializedDb = null;
      }
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
