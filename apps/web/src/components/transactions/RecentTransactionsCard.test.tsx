// SPDX-License-Identifier: BUSL-1.1

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Account, Category, Transaction } from '../../kmp/bridge';
import { useTransactions } from '../../hooks';
import { RecentTransactionsCard } from './RecentTransactionsCard';

vi.mock('../../hooks', () => ({ useTransactions: vi.fn() }));

vi.mock('../common', () => ({
  CurrencyDisplay: ({ amount, currency }: { amount: number; currency: string }) => (
    <span data-testid="currency">{`${currency} ${amount}`}</span>
  ),
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      {description ? <p>{description}</p> : null}
    </div>
  ),
  LoadingSpinner: ({ label }: { label: string }) => <div role="status">{label}</div>,
}));

const mockedUseTransactions = vi.mocked(useTransactions);

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    householdId: 'household-1',
    accountId: 'account-1',
    categoryId: 'category-food',
    type: 'EXPENSE',
    status: 'CLEARED',
    amount: { amount: 1000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Coffee Shop',
    note: null,
    date: '2025-03-06',
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

function mockHook(transactions: Transaction[], loading = false): void {
  mockedUseTransactions.mockReturnValue({
    transactions,
    loading,
    error: null,
    refresh: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  });
}

const categories = [
  { id: 'category-food', name: 'Food' },
  { id: 'category-secret', name: 'Therapy', isBiometricProtected: true },
] as unknown as Category[];

const accounts: Account[] = [];

function renderCard(props: Partial<React.ComponentProps<typeof RecentTransactionsCard>> = {}) {
  return render(
    <MemoryRouter>
      <RecentTransactionsCard categories={categories} accounts={accounts} {...props} />
    </MemoryRouter>,
  );
}

describe('RecentTransactionsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests a capped recent window and renders the rows', () => {
    mockHook([
      makeTransaction({ id: 'a', payee: 'Coffee Shop' }),
      makeTransaction({ id: 'b', payee: 'Salary Deposit', type: 'INCOME', categoryId: null }),
    ]);

    renderCard({ windowSize: 25 });

    expect(mockedUseTransactions).toHaveBeenCalledWith({ limit: 25 });
    expect(screen.getByText('Coffee Shop')).toBeInTheDocument();
    expect(screen.getByText('Salary Deposit')).toBeInTheDocument();
  });

  it('links "View all" to the full transactions page', () => {
    mockHook([makeTransaction()]);

    renderCard();

    const viewAll = screen.getByRole('link', { name: /view all/i });
    expect(viewAll).toHaveAttribute('href', '/transactions');
  });

  it('narrows the list as the user searches', () => {
    mockHook([
      makeTransaction({ id: 'a', payee: 'Coffee Shop' }),
      makeTransaction({ id: 'b', payee: 'Salary Deposit', type: 'INCOME', categoryId: null }),
    ]);

    renderCard();

    fireEvent.change(screen.getByLabelText('Search recent transactions'), {
      target: { value: 'coffee' },
    });

    expect(screen.getByText('Coffee Shop')).toBeInTheDocument();
    expect(screen.queryByText('Salary Deposit')).not.toBeInTheDocument();
    expect(screen.getByText('1 match')).toBeInTheDocument();
  });

  it('rolls biometric-protected transactions into a stable redacted aggregate', () => {
    mockHook([
      makeTransaction({ id: 'a', payee: 'Coffee Shop', categoryId: 'category-food' }),
      makeTransaction({ id: 'b', payee: 'Secret Visit', categoryId: 'category-secret' }),
    ]);

    renderCard();

    expect(screen.getByText('Protected')).toBeInTheDocument();
    expect(screen.getByText('1 protected transaction hidden')).toBeInTheDocument();
    // The protected payee must never render individually.
    expect(screen.queryByText('Secret Visit')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no transactions', () => {
    mockHook([]);

    renderCard();

    expect(screen.getByText('No recent transactions')).toBeInTheDocument();
  });

  it('shows a loading state during the initial load', () => {
    mockHook([], true);

    renderCard();

    expect(screen.getByText('Loading recent transactions')).toBeInTheDocument();
  });

  it('shows a no-match state when a search excludes every row', () => {
    mockHook([makeTransaction({ id: 'a', payee: 'Coffee Shop' })]);

    renderCard();

    fireEvent.change(screen.getByLabelText('Search recent transactions'), {
      target: { value: 'zzzzz-nothing' },
    });

    expect(screen.getByText('No matching transactions')).toBeInTheDocument();
  });
});
