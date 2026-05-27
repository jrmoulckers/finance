// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataExport } from './DataExport';
import type { SqliteDb } from '../db/sqlite-wasm';
import { DatabaseContext, type DatabaseContextValue } from '../db/DatabaseProvider';

function createMockDb(): SqliteDb {
  return {
    exec: vi.fn(),
    close: vi.fn(),
  } as unknown as SqliteDb;
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
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  localStorage.clear();
});

afterEach(() => {
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

    expect(screen.getByRole('button', { name: /request my data/i })).toBeInTheDocument();
    expect(screen.getByText(/local ZIP package/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/not requested/i);
  });

  it('disables requests while the database is unavailable', () => {
    render(<DataExport />, { wrapper: createTestWrapper(null) });

    expect(screen.getByText(/database is not available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request my data/i })).toBeDisabled();
  });

  it('shows a confirmation modal with protected-category and mood-tag choices', async () => {
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data/i }));

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

    await user.click(screen.getByRole('button', { name: /request my data/i }));
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

    await user.click(screen.getByRole('button', { name: /request my data/i }));
    await user.click(screen.getByLabelText(/include mood tags/i));
    await user.click(screen.getByRole('button', { name: /generate package/i }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/ready/i));
    expect(screen.getByText(/Package ready/i)).toBeInTheDocument();
    expect(screen.getByText(/mood tags included: yes/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('delivers the ZIP through share/download fallback', async () => {
    const user = userEvent.setup();
    render(<DataExport />, { wrapper: createTestWrapper(createMockDb()) });

    await user.click(screen.getByRole('button', { name: /request my data/i }));
    await user.click(screen.getByRole('button', { name: /generate package/i }));
    await screen.findByText(/Package ready/i);
    await user.click(screen.getByRole('button', { name: /share zip package/i }));

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(
      screen.getAllByRole('status').some((status) => /delivered/i.test(status.textContent ?? '')),
    ).toBe(true);
  });
});
