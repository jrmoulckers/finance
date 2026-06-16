// SPDX-License-Identifier: BUSL-1.1

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../kmp/bridge';
import { useTransactions } from '../hooks';
import { SafetyPage } from './SafetyPage';

vi.mock('../hooks', () => ({
  useTransactions: vi.fn(),
}));

const mockedUseTransactions = vi.mocked(useTransactions);

const syncMetadata = {
  createdAt: '2025-03-01T10:00:00Z',
  updatedAt: '2025-03-01T10:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: 'category-general',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 2500 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Grocery Store',
    note: null,
    date: '2025-03-01',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
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
    ...syncMetadata,
    ...overrides,
  };
}

function mockTransactions(transactions: Transaction[]) {
  mockedUseTransactions.mockReturnValue({
    transactions,
    loading: false,
    error: null,
    refresh: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  });
}

function renderSafetyPage() {
  render(
    <MemoryRouter>
      <SafetyPage />
    </MemoryRouter>,
  );
}

describe('SafetyPage', () => {
  beforeEach(() => {
    mockedUseTransactions.mockReset();
  });

  it('renders things to check from the scam-alert detection engine', () => {
    mockTransactions([
      makeTransaction({
        id: 'history-1',
        payee: 'Grocery Store',
        createdAt: '2025-03-01T10:00:00Z',
      }),
      makeTransaction({
        id: 'new-merchant-1',
        payee: 'Unknown Wire Helper',
        amount: { amount: 70500 },
        createdAt: '2025-03-02T10:00:00Z',
      }),
    ]);

    renderSafetyPage();

    expect(screen.getByRole('heading', { name: 'Things to check' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New merchant to review' })).toBeInTheDocument();
    expect(screen.getByText(/merchant you have not used before/i)).toBeInTheDocument();
    expect(screen.getByText(/call your bank using the number on your card/i)).toBeInTheDocument();
  });

  it('renders the all-clear state when the detection engine returns no alerts', () => {
    mockTransactions([
      makeTransaction({
        id: 'history-1',
        payee: 'Grocery Store',
        amount: { amount: 4500 },
        createdAt: '2025-03-01T10:00:00Z',
      }),
      makeTransaction({
        id: 'normal-1',
        payee: 'Grocery Store',
        amount: { amount: 5200 },
        createdAt: '2025-03-02T10:00:00Z',
      }),
    ]);

    renderSafetyPage();

    expect(screen.getByRole('heading', { name: 'Everything looks normal' })).toBeInTheDocument();
    expect(screen.getByText(/There is nothing you need to check right now/i)).toBeInTheDocument();
  });
});
