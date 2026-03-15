// SPDX-License-Identifier: BUSL-1.1

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { ErrorBanner, LoadingSpinner } from '../components/common';
import { seedDatabase } from './seed';
import { initDatabase, type SqliteDb } from './sqlite-wasm';

const DatabaseContext = createContext<SqliteDb | null>(null);
DatabaseContext.displayName = 'DatabaseContext';

interface DatabaseProviderProps {
  children: ReactNode;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to initialize the local database.';
}

/** Initialize SQLite-WASM and provide the database instance to descendants. */
export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [db, setDb] = useState<SqliteDb | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const retryInitialization = useCallback(() => {
    setReloadToken((currentValue) => currentValue + 1);
  }, []);

  useEffect(() => {
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
  }, [reloadToken]);

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--spacing-6)',
        }}
      >
        <LoadingSpinner label="Initializing database" />
      </div>
    );
  }

  if (error || !db) {
    return (
      <div style={{ padding: 'var(--spacing-6)' }}>
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
