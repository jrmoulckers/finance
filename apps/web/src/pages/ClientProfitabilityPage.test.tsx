// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the ClientProfitabilityPage CSV export control.
 *
 * Mocks the `useTransactions` hook (not repositories) per project conventions.
 * References: issue #3231.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Transaction, TransactionType } from '../kmp/bridge';
import { ClientProfitabilityPage } from './ClientProfitabilityPage';

vi.mock('../hooks/useTransactions', () => ({
  useTransactions: vi.fn(),
}));

import { useTransactions } from '../hooks/useTransactions';

const mockUseTransactions = vi.mocked(useTransactions);

let nextId = 0;

function makeTransaction(options: {
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
    date: '2024-01-05',
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

function mockResult(overrides: Partial<ReturnType<typeof useTransactions>> = {}) {
  return {
    transactions: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useTransactions>;
}

const CLIENT_TRANSACTIONS: Transaction[] = [
  makeTransaction({ type: 'INCOME', amountCents: 500_000, tags: ['client:Acme'] }),
  makeTransaction({ type: 'EXPENSE', amountCents: 120_000, tags: ['client:Acme'] }),
];

const EXPORT_BUTTON = /download client profitability report as csv/i;

describe('ClientProfitabilityPage CSV export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables the Download CSV button when the report has client rows', () => {
    mockUseTransactions.mockReturnValue(mockResult({ transactions: CLIENT_TRANSACTIONS }));
    render(<ClientProfitabilityPage />);

    expect(screen.getByRole('button', { name: EXPORT_BUTTON })).toBeEnabled();
  });

  it('disables the Download CSV button when there are no client-tagged transactions', () => {
    mockUseTransactions.mockReturnValue(mockResult({ transactions: [] }));
    render(<ClientProfitabilityPage />);

    expect(screen.getByRole('button', { name: EXPORT_BUTTON })).toBeDisabled();
  });

  it('generates a CSV blob download when the button is clicked', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn((_blob: Blob | MediaSource) => 'blob:client-profitability');
    const revokeObjectURL = vi.fn();
    // jsdom does not implement the object-URL helpers; provide test doubles.
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    mockUseTransactions.mockReturnValue(mockResult({ transactions: CLIENT_TRANSACTIONS }));
    render(<ClientProfitabilityPage />);

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
