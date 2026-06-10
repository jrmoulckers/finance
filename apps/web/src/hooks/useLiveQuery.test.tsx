// SPDX-License-Identifier: BUSL-1.1

import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseContext, type DatabaseContextValue } from '../db/DatabaseProvider';
import type { Row, SqliteDb } from '../db/sqlite-wasm';
import { resetPowerSyncStatus, updatePowerSyncStatus } from '../db/sync/powersync-client';
import { notifyDataChange, resetCrossTabSyncForTesting } from '../lib/sync/crossTab';
import { useLiveQuery } from './useLiveQuery';

function createDatabase(rowsRef: { current: Row[] }): SqliteDb {
  return {
    exec: vi.fn(),
    selectAll: vi.fn(() => rowsRef.current),
    selectOne: vi.fn(() => rowsRef.current[0] ?? null),
    close: vi.fn(async () => undefined),
  };
}

describe('useLiveQuery', () => {
  beforeEach(() => {
    resetPowerSyncStatus();
    resetCrossTabSyncForTesting();
  });

  afterEach(() => {
    resetPowerSyncStatus();
    resetCrossTabSyncForTesting();
  });

  it('loads data immediately and refreshes when relevant tables change', async () => {
    const rowsRef = { current: [{ id: 'account-1', name: 'Checking' }] };
    const db = createDatabase(rowsRef);
    const wrapper = ({ children }: React.PropsWithChildren) => (
      <DatabaseContext.Provider
        value={{ db, diagnostics: {} as DatabaseContextValue['diagnostics'] }}
      >
        {children}
      </DatabaseContext.Provider>
    );

    const { result } = renderHook(
      () =>
        useLiveQuery<{ id: string; name: string }[]>(
          'SELECT * FROM account WHERE deleted_at IS NULL',
          [],
          {
            initialData: [],
          },
        ),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual([{ id: 'account-1', name: 'Checking' }]);
    });

    rowsRef.current = [{ id: 'account-1', name: 'Savings' }];
    await act(async () => {
      notifyDataChange(['account']);
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([{ id: 'account-1', name: 'Savings' }]);
    });
  });

  it('ignores unrelated table notifications', async () => {
    const rowsRef = { current: [{ id: 'budget-1', name: 'Groceries' }] };
    const db = createDatabase(rowsRef);
    const wrapper = ({ children }: React.PropsWithChildren) => (
      <DatabaseContext.Provider
        value={{ db, diagnostics: {} as DatabaseContextValue['diagnostics'] }}
      >
        {children}
      </DatabaseContext.Provider>
    );

    const { result } = renderHook(
      () =>
        useLiveQuery<{ id: string; name: string }[]>(
          'SELECT * FROM budget WHERE deleted_at IS NULL',
          [],
          {
            initialData: [],
          },
        ),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual([{ id: 'budget-1', name: 'Groceries' }]);
    });

    rowsRef.current = [{ id: 'budget-1', name: 'Utilities' }];
    await act(async () => {
      notifyDataChange(['transaction']);
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(result.current.data).toEqual([{ id: 'budget-1', name: 'Groceries' }]);
  });

  it('refreshes when sync status changes', async () => {
    const rowsRef = { current: [{ id: 'transaction-1', amount: 1000 }] };
    const db = createDatabase(rowsRef);
    const wrapper = ({ children }: React.PropsWithChildren) => (
      <DatabaseContext.Provider
        value={{ db, diagnostics: {} as DatabaseContextValue['diagnostics'] }}
      >
        {children}
      </DatabaseContext.Provider>
    );

    const { result } = renderHook(
      () =>
        useLiveQuery<{ id: string; amount: number }[]>(
          'SELECT * FROM "transaction" WHERE deleted_at IS NULL',
          [],
          {
            initialData: [],
          },
        ),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual([{ id: 'transaction-1', amount: 1000 }]);
    });

    rowsRef.current = [{ id: 'transaction-1', amount: 2500 }];
    await act(async () => {
      updatePowerSyncStatus({ connectionStatus: 'syncing' });
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([{ id: 'transaction-1', amount: 2500 }]);
    });
  });
});
