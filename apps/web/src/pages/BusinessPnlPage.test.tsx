// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for BusinessPnlPage.
 *
 * Mocks the `useTransactions` hook (not repositories) per project conventions.
 * References: issue #2184.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Transaction, TransactionType } from '../kmp/bridge';
import { BusinessPnlPage } from './BusinessPnlPage';

vi.mock('../hooks/useTransactions', () => ({
  useTransactions: vi.fn(),
}));

import { useTransactions } from '../hooks/useTransactions';

const mockUseTransactions = vi.mocked(useTransactions);

let nextId = 0;

function makeTransaction(options: {
  date: string;
  type: TransactionType;
  amountCents: number;
  tags?: readonly string[];
}): Transaction {
  nextId += 1;
  return {
    id: `txn-${nextId}`,
    householdId: 'hh-1',
    accountId: 'acct-1',
    categoryId: null,
    type: options.type,
    status: 'CLEARED',
    amount: { amount: options.amountCents },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: null,
    note: null,
    date: options.date,
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: options.tags ?? [],
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantZip: null,
    merchantCountry: null,
    externalReferenceId: null,
    statementDescription: null,
    customFields: null,
    extraNotes: null,
    counterpartyName: null,
    counterpartyAccountId: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
  };
}

const SAMPLE_TRANSACTIONS: Transaction[] = [
  makeTransaction({ date: '2024-01-05', type: 'INCOME', amountCents: 1_000_000 }),
  makeTransaction({ date: '2024-01-06', type: 'EXPENSE', amountCents: 300_000, tags: ['cogs'] }),
  makeTransaction({ date: '2024-01-07', type: 'EXPENSE', amountCents: 200_000, tags: ['labor'] }),
  makeTransaction({
    date: '2024-01-08',
    type: 'EXPENSE',
    amountCents: 100_000,
    tags: ['overhead'],
  }),
];

function mockResult(overrides: Partial<ReturnType<typeof useTransactions>> = {}) {
  return {
    transactions: SAMPLE_TRANSACTIONS,
    loading: false,
    error: null,
    refresh: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useTransactions>;
}

describe('BusinessPnlPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading spinner while transactions load', () => {
    mockUseTransactions.mockReturnValue(mockResult({ transactions: [], loading: true }));
    render(<BusinessPnlPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error banner on failure', () => {
    mockUseTransactions.mockReturnValue(mockResult({ transactions: [], error: 'Boom' }));
    render(<BusinessPnlPage />);
    expect(screen.getByText('Boom')).toBeInTheDocument();
  });

  it('renders an accessible P&L statement with gross and net margins', () => {
    mockUseTransactions.mockReturnValue(mockResult());
    render(<BusinessPnlPage />);

    expect(screen.getByRole('heading', { level: 1, name: /profit & loss/i })).toBeInTheDocument();

    // Summary figures (scoped to the summary group to avoid the breakdown table).
    const summary = screen.getByRole('group', { name: /profit and loss summary/i });
    expect(within(summary).getByText('$10,000.00')).toBeInTheDocument(); // revenue
    expect(within(summary).getByText(/70\.0% margin/)).toBeInTheDocument(); // gross margin
    expect(within(summary).getByText(/Profit · 40\.0% margin/)).toBeInTheDocument(); // net + status
  });

  it('exposes a keyboard-operable weekly/monthly period toggle', async () => {
    const user = userEvent.setup();
    mockUseTransactions.mockReturnValue(mockResult());
    render(<BusinessPnlPage />);

    const monthly = screen.getByRole('radio', { name: 'Monthly' });
    const weekly = screen.getByRole('radio', { name: 'Weekly' });
    expect(monthly).toBeChecked();
    expect(weekly).not.toBeChecked();

    await user.click(weekly);
    expect(weekly).toBeChecked();
    expect(screen.getByRole('heading', { name: /weekly breakdown/i })).toBeInTheDocument();
  });

  it('renders a per-period breakdown table row', () => {
    mockUseTransactions.mockReturnValue(mockResult());
    render(<BusinessPnlPage />);

    const periodTable = screen.getByRole('region', { name: /profit and loss by period/i });
    const row = within(periodTable).getByRole('rowheader', { name: 'Jan 2024' });
    expect(row).toBeInTheDocument();
  });

  it('shows an empty state when there are no transactions', () => {
    mockUseTransactions.mockReturnValue(mockResult({ transactions: [] }));
    render(<BusinessPnlPage />);
    expect(screen.getByText(/No revenue or expense transactions/i)).toBeInTheDocument();
  });

  const EXPORT_BUTTON = /download profit and loss statement as csv/i;

  it('enables the Download CSV button when the statement has periods', () => {
    mockUseTransactions.mockReturnValue(mockResult());
    render(<BusinessPnlPage />);
    expect(screen.getByRole('button', { name: EXPORT_BUTTON })).toBeEnabled();
  });

  it('disables the Download CSV button when there are no transactions', () => {
    mockUseTransactions.mockReturnValue(mockResult({ transactions: [] }));
    render(<BusinessPnlPage />);
    expect(screen.getByRole('button', { name: EXPORT_BUTTON })).toBeDisabled();
  });

  it('generates a CSV blob download when the button is clicked', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn((_blob: Blob | MediaSource) => 'blob:business-pnl');
    const revokeObjectURL = vi.fn();
    // jsdom does not implement the object-URL helpers; provide test doubles.
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    mockUseTransactions.mockReturnValue(mockResult());
    render(<BusinessPnlPage />);

    await user.click(screen.getByRole('button', { name: EXPORT_BUTTON }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
    delete (URL as unknown as Record<string, unknown>).createObjectURL;
    delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });
});
