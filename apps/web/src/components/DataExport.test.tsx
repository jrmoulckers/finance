// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DataExport } from './DataExport';
import type { SqliteDb } from '../db/sqlite-wasm';
import { DatabaseContext } from '../db/DatabaseProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal mock database for testing. */
function createMockDb(): SqliteDb {
  return {
    exec: vi.fn(),
    close: vi.fn(),
  } as unknown as SqliteDb;
}

/** Mock the database repositories. */
vi.mock('../db/repositories/accounts', () => ({
  getAllAccounts: vi.fn(() => [
    {
      id: 'acc-1',
      householdId: 'hh-1',
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
      tags: [],
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      deletedAt: null,
      syncVersion: 1,
      isSynced: false,
    },
  ]),
}));

vi.mock('../db/repositories/budgets', () => ({
  getAllBudgets: vi.fn(() => []),
}));

vi.mock('../db/repositories/goals', () => ({
  getAllGoals: vi.fn(() => []),
}));

vi.mock('../db/repositories/categories', () => ({
  getAllCategories: vi.fn(() => [
    {
      id: 'cat-1',
      householdId: 'hh-1',
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

/** Stub URL.createObjectURL / revokeObjectURL since jsdom doesn't provide them. */
beforeEach(() => {
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DataExport', () => {
  // Helper to create test wrapper with database context
  const createTestWrapper = (db: SqliteDb | null) => {
    const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
      <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>
    );
    return TestWrapper;
  };

  // -- Render ---------------------------------------------------------------

  it('renders both export format buttons', () => {
    const mockDb = createMockDb();
    const TestWrapper = createTestWrapper(mockDb);
    render(<DataExport />, { wrapper: TestWrapper });
    expect(screen.getByRole('button', { name: /export as json/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export as csv/i })).toBeInTheDocument();
  });

  it('renders description text', () => {
    const mockDb = createMockDb();
    const TestWrapper = createTestWrapper(mockDb);
    render(<DataExport />, { wrapper: TestWrapper });
    expect(screen.getByText(/download your financial data/i)).toBeInTheDocument();
  });

  it('shows database unavailable message when db is null', () => {
    const TestWrapper = createTestWrapper(null);
    render(<DataExport />, { wrapper: TestWrapper });
    expect(screen.getByText(/database is not available/i)).toBeInTheDocument();
    // Buttons should be disabled when database is not available
    expect(screen.getByRole('button', { name: /export as json/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /export as csv/i })).toBeDisabled();
  });

  // -- Accessibility --------------------------------------------------------

  it('export buttons are keyboard focusable', () => {
    const mockDb = createMockDb();
    const TestWrapper = createTestWrapper(mockDb);
    render(<DataExport />, { wrapper: TestWrapper });
    const jsonBtn = screen.getByRole('button', { name: /export as json/i });
    const csvBtn = screen.getByRole('button', { name: /export as csv/i });

    // Buttons are natively focusable; verify they are not tabindex=-1
    expect(jsonBtn).not.toHaveAttribute('tabindex', '-1');
    expect(csvBtn).not.toHaveAttribute('tabindex', '-1');
  });

  it('buttons have type="button" (not submit)', () => {
    const mockDb = createMockDb();
    const TestWrapper = createTestWrapper(mockDb);
    render(<DataExport />, { wrapper: TestWrapper });
    const jsonBtn = screen.getByRole('button', { name: /export as json/i });
    const csvBtn = screen.getByRole('button', { name: /export as csv/i });

    expect(jsonBtn).toHaveAttribute('type', 'button');
    expect(csvBtn).toHaveAttribute('type', 'button');
  });

  it('buttons are grouped with role="group"', () => {
    const mockDb = createMockDb();
    const TestWrapper = createTestWrapper(mockDb);
    render(<DataExport />, { wrapper: TestWrapper });
    const group = screen.getByRole('group');
    expect(group).toBeInTheDocument();

    // Both buttons live inside the group
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(2);
  });

  // -- Export flow -----------------------------------------------------------

  it('shows progress state when exporting', async () => {
    const user = userEvent.setup();
    const mockDb = createMockDb();
    const TestWrapper = createTestWrapper(mockDb);
    render(<DataExport />, { wrapper: TestWrapper });

    const jsonBtn = screen.getByRole('button', { name: /export as json/i });
    await user.click(jsonBtn);

    // Progress indicator should appear
    expect(screen.getByRole('status', { name: /export in progress/i })).toBeInTheDocument();
  });

  it('disables buttons during export', async () => {
    const user = userEvent.setup();
    const mockDb = createMockDb();
    const TestWrapper = createTestWrapper(mockDb);
    render(<DataExport />, { wrapper: TestWrapper });

    await user.click(screen.getByRole('button', { name: /export as json/i }));

    // Both buttons should be disabled while exporting
    const buttons = screen.getAllByRole('button');
    const exportButtons = buttons.filter(
      (b) =>
        b.textContent?.includes('JSON') ||
        b.textContent?.includes('CSV') ||
        b.textContent?.includes('Exporting'),
    );
    exportButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it('shows success message after export completes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const mockDb = createMockDb();
    const TestWrapper = createTestWrapper(mockDb);
    render(<DataExport />, { wrapper: TestWrapper });

    await user.click(screen.getByRole('button', { name: /export as json/i }));

    // Advance past the simulated delay (400ms)
    await vi.advanceTimersByTimeAsync(500);

    expect(screen.getByText(/export complete/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  // -- Custom class ---------------------------------------------------------

  it('applies custom className', () => {
    const mockDb = createMockDb();
    const TestWrapper = createTestWrapper(mockDb);
    const { container } = render(<DataExport className="my-custom" />, { wrapper: TestWrapper });
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('my-custom');
    expect(wrapper?.className).toContain('data-export');
  });
});
