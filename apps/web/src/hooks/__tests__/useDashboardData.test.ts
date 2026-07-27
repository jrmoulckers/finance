// SPDX-License-Identifier: MIT

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSqliteAsyncDb } from '../../db/async-db';
import type { Row, SqliteDb } from '../../db/sqlite-wasm';
import { useDashboardData } from '../useDashboardData';

const testState = vi.hoisted(() => ({
  db: null as unknown,
}));

vi.mock('../../db/DatabaseProvider', () => ({
  useDatabase: () => testState.db,
}));

const syncRowMetadata = {
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  deleted_at: null,
  sync_version: 1,
  is_synced: 1,
};

interface TableRows {
  accounts: Row[];
  transactions: Row[];
  budgets: Row[];
  budgetSpending: Map<string, Row>;
}

function makeAccountRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'acct-1',
    household_id: 'hh-1',
    name: 'Checking',
    type: 'CHECKING',
    purpose: 'personal',
    retirement_account_type: null,
    retirement_tax_treatment: null,
    hsa_coverage_level: null,
    currency: 'USD',
    current_balance: 100000,
    is_archived: 0,
    sort_order: 1,
    icon: 'bank',
    color: '#2563EB',
    ...syncRowMetadata,
    ...overrides,
  };
}

function makeTransactionRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'txn-1',
    household_id: 'hh-1',
    account_id: 'acct-1',
    category_id: null,
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: -5000,
    currency: 'USD',
    payee: 'Store',
    note: null,
    date: '2025-01-15',
    transfer_account_id: null,
    transfer_transaction_id: null,
    is_recurring: 0,
    recurring_rule_id: null,
    tags: '[]',
    retirement_contribution_year: null,
    retirement_contribution_designation: null,
    splits: null,
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
    ...syncRowMetadata,
    ...overrides,
  };
}

function makeBudgetRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'budget-1',
    household_id: 'hh-1',
    category_id: 'cat-1',
    name: 'Groceries',
    amount: 50000,
    currency: 'USD',
    period: 'MONTHLY',
    start_date: '2025-01-01',
    end_date: null,
    is_rollover: 0,
    sort_order: 1,
    ...syncRowMetadata,
    ...overrides,
  };
}

function currentMonthDate(day = 15): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function createDatabase(tableRows: TableRows): SqliteDb {
  const selectAll = vi.fn((sql: string, params?: unknown[]) => {
    if (/FROM\s+account\b/i.test(sql)) {
      return tableRows.accounts;
    }

    if (/FROM\s+"transaction"/i.test(sql)) {
      let rows = tableRows.transactions;
      if (/date\s+>=\s+\?/i.test(sql) && /date\s+<=\s+\?/i.test(sql)) {
        const [startDate, endDate] = params ?? [];
        rows = rows.filter(
          (row) => String(row.date) >= String(startDate) && String(row.date) <= String(endDate),
        );
      }
      if (/LIMIT\s+\?/i.test(sql)) {
        const limit = Number(params?.[params.length - 1] ?? rows.length);
        rows = rows.slice(0, limit);
      }
      return rows;
    }

    if (/FROM\s+budget\b/i.test(sql)) {
      let rows = tableRows.budgets;
      if (/period\s+=\s+\?/i.test(sql)) {
        rows = rows.filter((row) => row.period === params?.[0]);
      }
      return rows;
    }

    return [];
  });

  return {
    exec: vi.fn(),
    selectAll,
    selectOne: vi.fn((sql: string, params?: unknown[]) => {
      if (/FROM\s+budget\s+b/i.test(sql)) {
        const budgetId = String(params?.[0] ?? '');
        return tableRows.budgetSpending.get(budgetId) ?? null;
      }
      return selectAll(sql, params)[0] ?? null;
    }),
    close: vi.fn(async () => undefined),
  };
}

// The async DB adapter resolves reads on the microtask queue, so live-query
// state settles after mount rather than synchronously. Flush pending
// microtasks (and any debounce timer) inside act() before asserting.
async function flushQuery(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('useDashboardData', () => {
  let tableRows: TableRows;
  let mockDb: SqliteDb;

  beforeEach(() => {
    vi.clearAllMocks();
    tableRows = { accounts: [], transactions: [], budgets: [], budgetSpending: new Map() };
    mockDb = createDatabase(tableRows);
    testState.db = createSqliteAsyncDb(mockDb);
  });

  it('returns loading false after initial fetch', async () => {
    const { result } = renderHook(() => useDashboardData());
    await flushQuery();

    expect(result.current.loading).toBe(false);
  });

  it('returns data with zero values when no accounts exist', async () => {
    const { result } = renderHook(() => useDashboardData());
    await flushQuery();

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.netWorth).toBe(0);
    expect(result.current.data?.spentThisMonth).toBe(0);
    expect(result.current.data?.incomeThisMonth).toBe(0);
    expect(result.current.data?.monthlyBudget).toBe(0);
    expect(result.current.data?.budgetSpent).toBe(0);
    expect(result.current.data?.recentTransactions).toEqual([]);
    expect(result.current.data?.accountSummary).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('computes net worth from all account balances', async () => {
    tableRows.accounts = [
      makeAccountRow({ id: 'acct-1', current_balance: 100000 }),
      makeAccountRow({ id: 'acct-2', type: 'SAVINGS', current_balance: 50000 }),
    ];

    const { result } = renderHook(() => useDashboardData());
    await flushQuery();

    expect(result.current.data?.netWorth).toBe(150000);
  });

  it('groups account totals by type', async () => {
    tableRows.accounts = [
      makeAccountRow({ id: 'acct-1', type: 'CHECKING', current_balance: 100000 }),
      makeAccountRow({ id: 'acct-2', type: 'SAVINGS', current_balance: 50000 }),
      makeAccountRow({ id: 'acct-3', type: 'CHECKING', current_balance: 25000 }),
    ];

    const { result } = renderHook(() => useDashboardData());
    await flushQuery();

    const summary = result.current.data?.accountSummary ?? [];
    const checking = summary.find((s) => s.type === 'CHECKING');
    const savings = summary.find((s) => s.type === 'SAVINGS');

    expect(checking?.total).toBe(125000);
    expect(savings?.total).toBe(50000);
  });

  it('computes monthly expense and income totals', async () => {
    tableRows.transactions = [
      makeTransactionRow({ type: 'EXPENSE', amount: -5000, date: currentMonthDate(5) }),
      makeTransactionRow({
        id: 'txn-2',
        type: 'EXPENSE',
        amount: -3000,
        date: currentMonthDate(10),
      }),
      makeTransactionRow({
        id: 'txn-3',
        type: 'INCOME',
        amount: 200000,
        date: currentMonthDate(15),
      }),
    ];

    const { result } = renderHook(() => useDashboardData());
    await flushQuery();

    expect(result.current.data?.spentThisMonth).toBe(8000);
    expect(result.current.data?.incomeThisMonth).toBe(200000);
  });

  it('computes monthly budget totals and spending', async () => {
    const budget = makeBudgetRow();
    tableRows.budgets = [budget];
    tableRows.budgetSpending.set('budget-1', { ...budget, spent_amount: 25000 });

    const { result } = renderHook(() => useDashboardData());
    await flushQuery();

    expect(result.current.data?.monthlyBudget).toBe(50000);
    expect(result.current.data?.budgetSpent).toBe(25000);
  });

  it('filters out budgets not active in current month', async () => {
    tableRows.budgets = [
      makeBudgetRow({ id: 'budget-old', start_date: '2020-01-01', end_date: '2020-12-31' }),
    ];

    const { result } = renderHook(() => useDashboardData());
    await flushQuery();

    expect(result.current.data?.monthlyBudget).toBe(0);
    expect(result.current.data?.budgetSpent).toBe(0);
    expect(mockDb.selectOne).not.toHaveBeenCalled();
  });

  it('returns recent transactions from the repository', async () => {
    tableRows.transactions = [
      makeTransactionRow({ id: 'txn-1' }),
      makeTransactionRow({ id: 'txn-2' }),
    ];

    const { result } = renderHook(() => useDashboardData());
    await flushQuery();

    expect(result.current.data?.recentTransactions).toHaveLength(2);
    expect(vi.mocked(mockDb.selectAll).mock.calls).toContainEqual([
      expect.stringMatching(/FROM\s+"transaction"[\s\S]*LIMIT\s+\?/i),
      [10],
    ]);
  });

  it('captures errors and sets error state', async () => {
    vi.mocked(mockDb.selectAll).mockImplementation(() => {
      throw new Error('DB read failed');
    });

    const { result } = renderHook(() => useDashboardData());
    await flushQuery();

    expect(result.current.error).toBe('DB read failed');
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('sets a generic error message for non-Error throws', async () => {
    vi.mocked(mockDb.selectAll).mockImplementation(() => {
      throw 'something went wrong';
    });

    const { result } = renderHook(() => useDashboardData());
    await flushQuery();

    expect(result.current.error).toBe('Failed to load dashboard data.');
  });

  it('re-fetches data when refresh is called', async () => {
    const { result } = renderHook(() => useDashboardData());
    await flushQuery();
    const callCountAfterMount = vi.mocked(mockDb.selectAll).mock.calls.length;

    await act(async () => {
      result.current.refresh();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(vi.mocked(mockDb.selectAll).mock.calls.length).toBeGreaterThan(callCountAfterMount);
  });

  it('sets loading to true then false during refresh', async () => {
    const { result } = renderHook(() => useDashboardData());
    await flushQuery();

    expect(result.current.loading).toBe(false);

    await act(async () => {
      result.current.refresh();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).not.toBeNull();
  });
});
