// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the useRemittances hook (issues #2170, #3273).
 *
 * The hook now reads and writes through the database-backed remittances
 * repository instead of localStorage. These tests mock the DatabaseProvider and
 * the repository (a stateful in-memory store) so they can prove the durable
 * behaviour that #3273 requires: records survive a simulated cache clear, the
 * one-time legacy migration runs on mount, and nothing is written to
 * `localStorage`.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRemittances } from './useRemittances';
import type { CreateRemittanceInput, RemittanceRecord } from '../lib/remittance';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = {} as ReturnType<typeof import('../db/DatabaseProvider').useDatabase>;

vi.mock('../db/DatabaseProvider', () => ({
  useDatabase: () => mockDb,
}));

/** Durable in-memory store standing in for the SQLite-backed repository. */
const store = new Map<string, RemittanceRecord>();
const importLegacyRemittances = vi.fn<() => number>(() => 0);

vi.mock('../db/repositories/remittances', () => ({
  getAllRemittances: () =>
    [...store.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ),
  insertRemittance: (_db: unknown, record: RemittanceRecord) => {
    store.set(record.id, record);
    return record;
  },
  deleteRemittanceRecord: (_db: unknown, id: string) => store.delete(id),
  importLegacyRemittances: () => importLegacyRemittances(),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function input(overrides: Partial<CreateRemittanceInput> = {}): CreateRemittanceInput {
  return {
    date: '2026-06-01',
    sourceCurrency: 'USD',
    destCurrency: 'MXN',
    sendAmountMinor: 50_000,
    feeMinor: 500,
    fxRate: 17.0,
    feeModel: 'ADDITIVE',
    referenceRate: 17.5,
    recipient: { name: 'Familia', country: 'MX' },
    note: null,
    ...overrides,
  };
}

describe('useRemittances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    importLegacyRemittances.mockReturnValue(0);
    localStorage.clear();
  });

  it('starts empty and runs the one-time legacy migration on mount', () => {
    const { result } = renderHook(() => useRemittances());
    expect(result.current.remittances).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.summary.count).toBe(0);
    expect(importLegacyRemittances).toHaveBeenCalledTimes(1);
  });

  it('creates a remittance and updates the summary', () => {
    const { result } = renderHook(() => useRemittances());

    act(() => {
      result.current.createRemittance(input());
    });

    expect(result.current.remittances).toHaveLength(1);
    expect(result.current.summary.count).toBe(1);
    expect(result.current.summary.sentByCurrency).toEqual({ USD: 50_500 });
    expect(result.current.summary.receivedByCurrency).toEqual({ MXN: 850_000 });
    expect(result.current.remittances[0]?.id).toBeTruthy();
  });

  it('never writes remittances to localStorage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useRemittances());

    act(() => {
      result.current.createRemittance(input());
    });

    expect(localStorage.getItem('finance-remittances')).toBeNull();
    expect(setItem).not.toHaveBeenCalledWith('finance-remittances', expect.anything());
    setItem.mockRestore();
  });

  it('persists across a simulated cache clear (data lives in the database)', () => {
    const first = renderHook(() => useRemittances());
    act(() => {
      first.result.current.createRemittance(input());
    });
    first.unmount();

    // Simulate the user clearing browser storage — the durable copy is in the
    // repository/database, not localStorage, so it must still be readable.
    localStorage.clear();

    const second = renderHook(() => useRemittances());
    expect(second.result.current.remittances).toHaveLength(1);
  });

  it('orders the most recent send date first', () => {
    const { result } = renderHook(() => useRemittances());
    act(() => {
      result.current.createRemittance(input({ date: '2026-05-01' }));
    });
    act(() => {
      result.current.createRemittance(input({ date: '2026-06-15' }));
    });
    expect(result.current.remittances[0]?.date).toBe('2026-06-15');
    expect(result.current.remittances[1]?.date).toBe('2026-05-01');
  });

  it('deletes a remittance by id', () => {
    const { result } = renderHook(() => useRemittances());
    let id = '';
    act(() => {
      id = result.current.createRemittance(input())?.id ?? '';
    });
    expect(result.current.remittances).toHaveLength(1);

    act(() => {
      result.current.deleteRemittance(id);
    });
    expect(result.current.remittances).toHaveLength(0);
    expect(result.current.summary.count).toBe(0);
  });
});
