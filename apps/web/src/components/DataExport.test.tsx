// SPDX-License-Identifier: BUSL-1.1
// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataExport } from './DataExport';
import type { SqliteDb } from '../db/sqlite-wasm';
import { DatabaseContext, type DatabaseContextValue } from '../db/DatabaseProvider';

function createMockDb(): SqliteDb {
  const accountRows = [
    {
      id: 'acc-1',
      household_id: 'hh-1',
      name: 'Checking',
      type: 'CHECKING',
      currency: 'USD',
      current_balance: 100000,
      is_archived: 0,
      sort_order: 0,
      icon: null,
      color: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      deleted_at: null,
      sync_version: 1,
      is_synced: 0,
    },
  ];

  return {
    exec: vi.fn(),
    selectAll: vi.fn((sql: string) => (/FROM "?account"?/i.test(sql) ? accountRows : [])),
    selectOne: vi.fn(() => null),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

vi.mock('../db/repositories/accounts', () => ({
  getAllAccounts: vi.fn(() => [
    {
      id: 'acc-1',
      householdId: 'hh-1',
      ownerId: 'owner-1',
      name: 'Checking',
      type: 'CHECKING',
      currency: { code: 'USD', symbol: '$', name: 'US Dollar' },
      currentBalance: { amount: 100000 },
      isArchived: false,
      sortOrder: 0,
      icon: null,
      color: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
      syncVersion: 1,
      isSynced: false,
    },
  ]),
}));

vi.mock('../db/repositories/transactions', () => ({
  getAllTransactions: vi.fn(() => [
    {
      id: 'txn-1',
      householdId: 'hh-1',
      ownerId: 'owner-1',
      accountId: 'acc-1',
      categoryId: 'cat-1',
      type: 'EXPENSE',
      status: 'CLEARED',
      amount: { amount: -6742 },
      currency: { code: 'USD', symbol: '$', name: 'US Dollar' },
      payee: 'Grocery Store',
      note: null,
      date: '2024-03-06',
      transferAccountId: null,
      transferTransactionId: null,
      isRecurring: false,
      recurringRuleId: null,
      tags: ['food'],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
      syncVersion: 1,
      isSynced: false,
    },
  ]),
}));

vi.mock('../db/repositories/budgets', () => ({ getAllBudgets: vi.fn(() => []) }));
vi.mock('../db/repositories/goals', () => ({ getAllGoals: vi.fn(() => []) }));
vi.mock('../db/repositories/bills', () => ({ getAllBills: vi.fn(() => []) }));
vi.mock('../db/repositories/investments', () => ({ getAllInvestments: vi.fn(() => []) }));
vi.mock('../db/repositories/investment-lots', () => ({ getLotsByInvestment: vi.fn(() => []) }));
vi.mock('../db/repositories/household', () => ({
  getHouseholdById: vi.fn(() => ({ id: 'hh-1', name: 'Home', ownerId: 'owner-1' })),
  getHouseholdMembers: vi.fn(() => []),
  getHouseholdInvitations: vi.fn(() => []),
  getAccountSharings: vi.fn(() => []),
  getSharedBudgets: vi.fn(() => []),
  getBudgetContributions: vi.fn(() => []),
  getSharedGoals: vi.fn(() => []),
  getGoalContributions: vi.fn(() => []),
}));
vi.mock('../db/repositories/categories', () => ({
  getAllCategories: vi.fn(() => [
    {
      id: 'cat-1',
      householdId: 'hh-1',
      ownerId: 'owner-1',
      name: 'Food',
      icon: null,
      color: null,
      parentId: null,
      isIncome: false,
      isSystem: false,
      sortOrder: 0,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
      syncVersion: 1,
      isSynced: false,
    },
  ]),
}));

beforeEach(() => {
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DataExport', () => {
  const createTestWrapper = (db: SqliteDb | null) => {
    const contextValue: DatabaseContextValue | null = db
      ? {
          db,
          diagnostics: {
            backend: 'indexeddb',
            opfsAvailable: false,
            didFallback: false,
            quotaBytes: null,
            usageBytes: null,
          },
        }
      : null;
    const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <DatabaseContext.Provider value={contextValue}>{children}</DatabaseContext.Provider>
    );
    return TestWrapper;
  };

  it('renders the request-my-data entry point and status indicator', () => {
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    expect(screen.getByRole('button', { name: /download all data \(json\)/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /download transactions \(csv\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /download all data \(csv zip\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request my data package/i })).toBeInTheDocument();
    expect(screen.getByText(/Download your data directly/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/not requested/i);
  });

  it('disables requests while the database is unavailable', () => {
    render(<DataExport />, { wrapper: createTestWrapper(null) });

    expect(screen.getByText(/database is not available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request my data package/i })).toBeDisabled();
  });

  it('downloads a full JSON export directly from local data', async () => {
    localStorage.setItem('finance-currency', 'USD');
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /download all data \(json\)/i }));

    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    const payload = JSON.parse(await blob.text()) as {
      accounts: unknown[];
      preferences: unknown[];
    };
    expect(blob.type).toBe('application/json;charset=utf-8');
    expect(payload.accounts).toHaveLength(1);
    expect(payload.preferences).toEqual([{ key: 'finance-currency', value: 'USD' }]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(screen.getByText(/JSON download started/i)).toBeInTheDocument();
  });

  it('downloads denormalized transactions CSV directly from local data', async () => {
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /download transactions \(csv\)/i }));

    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8');
    await expect(blob.text()).resolves.toContain(
      'date,account_name,category_name,description,amount,currency\r\n' +
        '2024-03-06,Checking,Food,Grocery Store,-67.42,USD',
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(screen.getByText(/Transactions CSV download started/i)).toBeInTheDocument();
  });

  it('shows a confirmation modal with protected-category and mood-tag choices', async () => {
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));

    expect(screen.getByRole('dialog', { name: /request your data package/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/include protected categories/i)).toBeChecked();
    expect(screen.getByLabelText(/include mood tags/i)).not.toBeChecked();
    expect(
      screen.getByText(/Mood tag data can reveal sensitive wellbeing patterns/i),
    ).toBeInTheDocument();
  });

  it('supports cancelling while the request is pending', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));
    await user.click(screen.getByRole('button', { name: /generate package/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/pending/i);

    await user.click(screen.getByRole('button', { name: /cancel request/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/cancelled/i);
  });

  it('generates a ready ZIP package without network egress', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('network blocked')));
    vi.stubGlobal('fetch', fetchSpy);
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));
    await user.click(screen.getByLabelText(/include mood tags/i));
    await user.click(screen.getByRole('button', { name: /generate package/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/ready/i));
    expect(screen.getByText(/Package ready/i)).toBeInTheDocument();
    expect(screen.getByText(/mood tags included: yes/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('downloads the ZIP via the always-available download button', async () => {
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));
    await user.click(screen.getByRole('button', { name: /generate package/i }));
    await screen.findByText(/Package ready/i);
    await user.click(screen.getByRole('button', { name: /^download zip$/i }));

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(
      screen.getAllByRole('status').some((status) => /delivered/i.test(status.textContent ?? '')),
    ).toBe(true);
  });

  it('hides Share button when navigator.share is not supported', async () => {
    // Default beforeEach sets navigator.share = undefined.
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));
    await user.click(screen.getByRole('button', { name: /generate package/i }));
    await screen.findByText(/Package ready/i);

    expect(screen.queryByRole('button', { name: /share my exported package/i })).toBeNull();
  });

  it('disables Share button when no package has been generated yet', () => {
    Object.defineProperty(navigator, 'share', { value: vi.fn(), configurable: true });
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => true),
      configurable: true,
    });
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    const shareBtn = screen.getByRole('button', { name: /share my exported package/i });
    expect(shareBtn).toBeDisabled();
    expect(shareBtn).toHaveAttribute('title', expect.stringMatching(/generate a package first/i));
    expect(screen.getByText(/opens your device's share sheet/i)).toBeInTheDocument();
  });

  it('silently dismisses share when the user cancels (AbortError)', async () => {
    const shareSpy = vi.fn(() => Promise.reject(new DOMException('cancelled', 'AbortError')));
    Object.defineProperty(navigator, 'share', { value: shareSpy, configurable: true });
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => true),
      configurable: true,
    });
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));
    await user.click(screen.getByRole('button', { name: /generate package/i }));
    await screen.findByText(/Package ready/i);
    await user.click(screen.getByRole('button', { name: /share my exported package/i }));

    await waitFor(() => expect(shareSpy).toHaveBeenCalled());
    // No error banner.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders an "unsupported" message when share rejects with NotAllowedError', async () => {
    const shareSpy = vi.fn(() =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
    );
    Object.defineProperty(navigator, 'share', { value: shareSpy, configurable: true });
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => true),
      configurable: true,
    });
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data package/i }));
    await user.click(screen.getByRole('button', { name: /generate package/i }));
    await screen.findByText(/Package ready/i);
    await user.click(screen.getByRole('button', { name: /share my exported package/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/sharing isn't available/i);
    expect(alert).not.toHaveTextContent(/permission denied/i);
  });
});
