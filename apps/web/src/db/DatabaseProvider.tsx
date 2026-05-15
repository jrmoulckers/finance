// SPDX-License-Identifier: BUSL-1.1

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ErrorBanner, LoadingSpinner } from '../components/common';
import { seedDatabase } from './seed';
import { initDatabase, type SqliteDb } from './sqlite-wasm';
import '../styles/pages.css';

/** React context that stores the shared SQLite-WASM database instance. */
export const DatabaseContext = createContext<SqliteDb | null>(null);
DatabaseContext.displayName = 'DatabaseContext';

interface DatabaseProviderProps {
  children: ReactNode;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to initialize the local database.';
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

/** Initialize SQLite-WASM and provide the database instance to descendants. */
export function DatabaseProvider({ children }: DatabaseProviderProps) {
  // Skip real DB init in E2E tests — WASM binaries aren't in the static
  // build output, so SQLiteESMFactory / initSqlJs would hang forever.
  const [isE2E] = useState(
    () => typeof window !== 'undefined' && window.__PLAYWRIGHT_E2E__ === true,
  );

  const [db, setDb] = useState<SqliteDb | null>(isE2E ? E2E_STUB_DB : null);
  const [isLoading, setIsLoading] = useState(!isE2E);
  const [error, setError] = useState<string | null>(null);
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
      setError(null);
      setDb(null);

      try {
        initializedDb = await initDatabase();
        await seedDatabase(initializedDb);

        if (isDisposed) {
          await initializedDb.close();
          initializedDb = null;
          return;
        }

        setDb(initializedDb);
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
          setError(getErrorMessage(initializationError));
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

  if (error || !db) {
    return (
      <div className="page-error-wrapper">
        <ErrorBanner
          message={error ?? 'The database is unavailable.'}
          onRetry={retryInitialization}
        />
      </div>
    );
  }

  return <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>;
}

/** Access the shared SQLite-WASM database instance from React context. */
export function useDatabase(): SqliteDb {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }

  return context;
}
