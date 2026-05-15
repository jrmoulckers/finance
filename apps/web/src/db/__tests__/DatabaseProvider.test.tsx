// SPDX-License-Identifier: BUSL-1.1

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DatabaseProvider, useDatabase, useStorageDiagnostics } from '../DatabaseProvider';
import { StorageError, type StorageDiagnostics, type SqliteDb } from '../sqlite-wasm';

// Mock the sqlite-wasm module — we test provider behavior, not real WASM
vi.mock('../sqlite-wasm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sqlite-wasm')>();
  return {
    ...actual,
    initDatabaseWithDiagnostics: vi.fn(),
  };
});

// Mock seed to avoid actual DB operations
vi.mock('../seed', () => ({
  seedDatabase: vi.fn().mockResolvedValue(undefined),
}));

const { initDatabaseWithDiagnostics } = await import('../sqlite-wasm');

const mockDb: SqliteDb = {
  exec: vi.fn(),
  selectAll: vi.fn().mockReturnValue([]),
  selectOne: vi.fn().mockReturnValue(null),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockDiagnostics: StorageDiagnostics = {
  backend: 'opfs',
  opfsAvailable: true,
  didFallback: false,
  quotaBytes: 1_000_000_000,
  usageBytes: 50_000,
};

/** Test component that consumes useDatabase. */
function DbConsumer() {
  const db = useDatabase();
  return <div data-testid="db-ready">{db ? 'Database ready' : 'No database'}</div>;
}

/** Test component that consumes useStorageDiagnostics. */
function DiagnosticsConsumer() {
  const diag = useStorageDiagnostics();
  if (!diag) return <div data-testid="no-diag">No diagnostics</div>;
  return <div data-testid="diag-backend">{diag.backend}</div>;
}

describe('DatabaseProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset E2E flag
    if (typeof window !== 'undefined') {
      delete window.__PLAYWRIGHT_E2E__;
    }
  });

  it('renders loading state initially', async () => {
    // Never resolve — keep in loading state
    (initDatabaseWithDiagnostics as Mock).mockReturnValue(new Promise(() => {}));

    render(
      <DatabaseProvider>
        <DbConsumer />
      </DatabaseProvider>,
    );

    const statusElements = screen.getAllByRole('status');
    expect(statusElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Initializing database')).toBeInTheDocument();
  });

  it('renders children when init succeeds', async () => {
    (initDatabaseWithDiagnostics as Mock).mockResolvedValue({
      db: mockDb,
      diagnostics: mockDiagnostics,
    });

    render(
      <DatabaseProvider>
        <DbConsumer />
      </DatabaseProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('db-ready')).toHaveTextContent('Database ready');
    });
  });

  it('renders error banner when init fails with StorageError', async () => {
    const storageError = new StorageError(
      'WASM_LOAD_FAILED',
      'Failed to load the database engine. Please check your network connection and reload the page.',
      { cause: new Error('fetch failed'), backend: 'opfs', fallbackAttempted: true },
    );
    (initDatabaseWithDiagnostics as Mock).mockRejectedValue(storageError);

    render(
      <DatabaseProvider>
        <DbConsumer />
      </DatabaseProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText(/database engine/i)).toBeInTheDocument();
    // Technical details should be available
    expect(screen.getByText('Technical details')).toBeInTheDocument();
  });

  it('renders error banner when init fails with generic error', async () => {
    (initDatabaseWithDiagnostics as Mock).mockRejectedValue(
      new Error('Something unexpected happened'),
    );

    render(
      <DatabaseProvider>
        <DbConsumer />
      </DatabaseProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText('Something unexpected happened')).toBeInTheDocument();
  });

  it('retry button re-triggers initialization', async () => {
    let callCount = 0;
    (initDatabaseWithDiagnostics as Mock).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new StorageError('INDEXEDDB_FAILED', 'Browser storage is unavailable.', {
          backend: 'indexeddb',
        });
      }
      return { db: mockDb, diagnostics: mockDiagnostics };
    });

    const user = userEvent.setup();

    render(
      <DatabaseProvider>
        <DbConsumer />
      </DatabaseProvider>,
    );

    // Wait for error state
    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
    });

    // Click retry
    await user.click(screen.getByRole('button', { name: /retry/i }));

    // Should now succeed
    await waitFor(() => {
      expect(screen.getByTestId('db-ready')).toHaveTextContent('Database ready');
    });

    expect(callCount).toBe(2);
  });

  it('exposes diagnostics via useStorageDiagnostics', async () => {
    (initDatabaseWithDiagnostics as Mock).mockResolvedValue({
      db: mockDb,
      diagnostics: { ...mockDiagnostics, backend: 'indexeddb' },
    });

    render(
      <DatabaseProvider>
        <DiagnosticsConsumer />
      </DatabaseProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('diag-backend')).toHaveTextContent('indexeddb');
    });
  });

  it('skips WASM init in E2E mode', async () => {
    window.__PLAYWRIGHT_E2E__ = true;

    render(
      <DatabaseProvider>
        <DbConsumer />
      </DatabaseProvider>,
    );

    // Should render immediately without calling init
    expect(screen.getByTestId('db-ready')).toHaveTextContent('Database ready');
    expect(initDatabaseWithDiagnostics).not.toHaveBeenCalled();
  });

  it('shows quota exceeded error with actionable message', async () => {
    const quotaError = new StorageError(
      'QUOTA_EXCEEDED',
      'Storage space is full. Please free up space by clearing unused site data in your browser settings.',
      { backend: 'indexeddb' },
    );
    (initDatabaseWithDiagnostics as Mock).mockRejectedValue(quotaError);

    render(
      <DatabaseProvider>
        <DbConsumer />
      </DatabaseProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getByText(/storage space is full/i)).toBeInTheDocument();
  });
});

describe('useDatabase', () => {
  it('throws when used outside DatabaseProvider', () => {
    function Orphan() {
      useDatabase();
      return null;
    }

    // Suppress React error boundary console output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<Orphan />);
    }).toThrow('useDatabase must be used within a DatabaseProvider');

    consoleSpy.mockRestore();
  });
});
