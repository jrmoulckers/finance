// SPDX-License-Identifier: BUSL-1.1

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';

import { AccountSummaryCard } from './AccountSummaryCard';
import type { Account } from '../../kmp/bridge';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'account-1',
    type: 'CHECKING',
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 100000 },
    isArchived: false,
    ...overrides,
  } as unknown as Account;
}

function renderCard(accounts: Account[]) {
  return render(
    <MemoryRouter>
      <AccountSummaryCard accounts={accounts} currency="USD" />
    </MemoryRouter>,
  );
}

describe('AccountSummaryCard', () => {
  it('groups accounts by type with per-type totals and counts', () => {
    renderCard([
      makeAccount({ id: 'a', type: 'CHECKING', currentBalance: { amount: 100000 } }),
      makeAccount({ id: 'b', type: 'CHECKING', currentBalance: { amount: 50000 } }),
      makeAccount({ id: 'c', type: 'SAVINGS', currentBalance: { amount: 300000 } }),
    ]);

    const card = screen.getByRole('article', { name: 'Account summary by type' });
    // Savings sorts first (largest absolute total).
    expect(within(card).getByText('Savings')).toBeInTheDocument();
    expect(within(card).getByText('Checking')).toBeInTheDocument();
    // Two checking accounts -> "(2 accounts)"
    expect(within(card).getByText(/\(2 accounts\)/)).toBeInTheDocument();
    expect(within(card).getByText(/\$1,500\.00/)).toBeInTheDocument();
    expect(within(card).getByText(/\$3,000\.00/)).toBeInTheDocument();
  });

  it('ignores archived accounts', () => {
    renderCard([
      makeAccount({ id: 'a', type: 'CHECKING', currentBalance: { amount: 100000 } }),
      makeAccount({
        id: 'b',
        type: 'INVESTMENT',
        currentBalance: { amount: 999999 },
        isArchived: true,
      }),
    ]);

    const card = screen.getByRole('article', { name: 'Account summary by type' });
    expect(within(card).queryByText('Investments')).not.toBeInTheDocument();
  });

  it('shows an empty state with a call to action when there are no accounts', () => {
    renderCard([]);

    const card = screen.getByRole('article', { name: 'Account summary by type' });
    expect(within(card).getByText(/No accounts yet/i)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Add an account/i })).toHaveAttribute(
      'href',
      '/accounts',
    );
  });
});
