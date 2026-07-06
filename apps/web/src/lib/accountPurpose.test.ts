// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { AccountPurpose } from '../kmp/bridge';
import {
  filterAccountsByPurpose,
  filterTransactionsByAccountPurpose,
  matchesAccountPurposeFilter,
  matchesWorkspaceSelection,
  selectWorkspaceAccounts,
  selectWorkspaceTransactions,
  type AccountPurposeFilter,
} from './accountPurpose';

interface TestAccount {
  readonly id: string;
  readonly purpose?: AccountPurpose;
  readonly currentBalance: { readonly amount: number };
}

interface TestTransaction {
  readonly id: string;
  readonly accountId: string;
  readonly amount: { readonly amount: number };
}

// Balances in integer cents — disjoint personal + business, no shared accounts.
const personalChecking: TestAccount = {
  id: 'p1',
  purpose: 'personal',
  currentBalance: { amount: 2_475_000 },
};
const personalSavings: TestAccount = {
  id: 'p2',
  purpose: 'personal',
  currentBalance: { amount: 800_000 },
};
const businessChecking: TestAccount = {
  id: 'b1',
  purpose: 'business',
  currentBalance: { amount: 1_250_000 },
};
const untagged: TestAccount = { id: 'u1', currentBalance: { amount: 100_000 } };
const sharedCard: TestAccount = { id: 's1', purpose: 'both', currentBalance: { amount: 500_000 } };

function sumBalances(accounts: readonly TestAccount[]): number {
  return accounts.reduce((sum, account) => sum + account.currentBalance.amount, 0);
}

function netWorthForFilter(accounts: readonly TestAccount[], filter: AccountPurposeFilter): number {
  return sumBalances(selectWorkspaceAccounts(accounts, filter));
}

describe('matchesWorkspaceSelection (disjoint partition)', () => {
  it('matches every account under the "all" workspace', () => {
    for (const purpose of ['personal', 'business', 'both', null, undefined] as const) {
      expect(matchesWorkspaceSelection(purpose, 'all')).toBe(true);
    }
  });

  it('treats personal as personal-only and untagged as personal', () => {
    expect(matchesWorkspaceSelection('personal', 'personal')).toBe(true);
    expect(matchesWorkspaceSelection(null, 'personal')).toBe(true);
    expect(matchesWorkspaceSelection(undefined, 'personal')).toBe(true);
    expect(matchesWorkspaceSelection('business', 'personal')).toBe(false);
    expect(matchesWorkspaceSelection('both', 'personal')).toBe(false);
  });

  it('treats business as business-only', () => {
    expect(matchesWorkspaceSelection('business', 'business')).toBe(true);
    expect(matchesWorkspaceSelection('personal', 'business')).toBe(false);
    expect(matchesWorkspaceSelection('both', 'business')).toBe(false);
  });

  it('keeps shared (both) accounts out of personal and business so they roll up only into all', () => {
    expect(matchesWorkspaceSelection('both', 'personal')).toBe(false);
    expect(matchesWorkspaceSelection('both', 'business')).toBe(false);
    expect(matchesWorkspaceSelection('both', 'all')).toBe(true);
  });
});

describe('selectWorkspaceAccounts', () => {
  it('returns all accounts for the "all" filter', () => {
    const accounts = [personalChecking, businessChecking, sharedCard, untagged];
    expect(selectWorkspaceAccounts(accounts, 'all')).toHaveLength(4);
  });

  it('partitions disjoint personal and business accounts', () => {
    const accounts = [personalChecking, personalSavings, businessChecking, untagged];
    expect(selectWorkspaceAccounts(accounts, 'personal').map((a) => a.id)).toEqual([
      'p1',
      'p2',
      'u1',
    ]);
    expect(selectWorkspaceAccounts(accounts, 'business').map((a) => a.id)).toEqual(['b1']);
  });
});

describe('All workspace aggregation — All === Personal + Business', () => {
  it('aggregates the "all" net worth as the exact sum of every workspace (disjoint data)', () => {
    const accounts = [personalChecking, personalSavings, businessChecking, untagged];

    const all = netWorthForFilter(accounts, 'all');
    const personal = netWorthForFilter(accounts, 'personal');
    const business = netWorthForFilter(accounts, 'business');

    // Exact integer-cents equality: no double counting, no rounding drift.
    expect(all).toBe(personal + business);
    expect(all).toBe(2_475_000 + 800_000 + 1_250_000 + 100_000);
  });

  it('never lets "All" merely mirror a single workspace when other workspaces have value', () => {
    const accounts = [personalChecking, businessChecking];

    const all = netWorthForFilter(accounts, 'all');
    const personal = netWorthForFilter(accounts, 'personal');

    // Reported P1 symptom: switching All<->Personal showed no change.
    expect(all).not.toBe(personal);
    expect(all).toBeGreaterThan(personal);
  });

  it('counts shared (both) accounts once, only under All: All === Personal + Business + Shared', () => {
    const accounts = [personalChecking, businessChecking, sharedCard];

    const all = netWorthForFilter(accounts, 'all');
    const personal = netWorthForFilter(accounts, 'personal');
    const business = netWorthForFilter(accounts, 'business');
    const shared = sharedCard.currentBalance.amount;

    expect(all).toBe(personal + business + shared);
    // Shared balance is excluded from the per-workspace subsets (no double count).
    expect(personal).toBe(2_475_000);
    expect(business).toBe(1_250_000);
  });

  it('reproduces and fixes the personal + shared (no business-only) case where All used to mirror Personal', () => {
    // User has only personal + shared accounts and no business-only account.
    const accounts = [personalChecking, sharedCard];

    const all = netWorthForFilter(accounts, 'all');
    const personal = netWorthForFilter(accounts, 'personal');
    const business = netWorthForFilter(accounts, 'business');

    expect(personal).toBe(2_475_000);
    expect(business).toBe(0);
    expect(all).toBe(2_975_000);
    // The shared card is now visible only in the aggregate, so All > Personal.
    expect(all).toBeGreaterThan(personal);
  });
});

describe('selectWorkspaceTransactions', () => {
  const accounts = [personalChecking, businessChecking, sharedCard];
  const transactions: TestTransaction[] = [
    { id: 't-personal', accountId: 'p1', amount: { amount: 5_000 } },
    { id: 't-business', accountId: 'b1', amount: { amount: 9_000 } },
    { id: 't-shared', accountId: 's1', amount: { amount: 3_000 } },
  ];

  it('returns every transaction for the "all" filter', () => {
    expect(selectWorkspaceTransactions(transactions, accounts, 'all')).toHaveLength(3);
  });

  it('scopes transactions to the disjoint workspace and excludes shared-account activity', () => {
    expect(
      selectWorkspaceTransactions(transactions, accounts, 'personal').map((t) => t.id),
    ).toEqual(['t-personal']);
    expect(
      selectWorkspaceTransactions(transactions, accounts, 'business').map((t) => t.id),
    ).toEqual(['t-business']);
  });

  it('keeps the spend total partitioned so All === Personal + Business + Shared', () => {
    const spend = (filter: AccountPurposeFilter) =>
      selectWorkspaceTransactions(transactions, accounts, filter).reduce(
        (sum, t) => sum + t.amount.amount,
        0,
      );

    expect(spend('all')).toBe(spend('personal') + spend('business') + 3_000);
  });
});

describe('matchesAccountPurposeFilter (inclusive visibility) remains unchanged', () => {
  // Regression guard: the inclusive filter still surfaces shared (both) accounts
  // under both personal and business for browsing on Transactions/Accounts pages.
  it('keeps shared accounts visible under both personal and business', () => {
    expect(matchesAccountPurposeFilter('both', 'personal')).toBe(true);
    expect(matchesAccountPurposeFilter('both', 'business')).toBe(true);
  });

  it('still differs from the disjoint partition for shared accounts', () => {
    const accounts = [personalChecking, businessChecking, sharedCard];
    // Inclusive personal view shows the shared card; the disjoint partition does not.
    expect(filterAccountsByPurpose(accounts, 'personal').map((a) => a.id)).toContain('s1');
    expect(selectWorkspaceAccounts(accounts, 'personal').map((a) => a.id)).not.toContain('s1');
  });

  it('keeps transaction visibility inclusive for shared accounts', () => {
    const accounts = [personalChecking, sharedCard];
    const transactions: TestTransaction[] = [
      { id: 't-shared', accountId: 's1', amount: { amount: 1 } },
    ];
    expect(filterTransactionsByAccountPurpose(transactions, accounts, 'personal')).toHaveLength(1);
    expect(selectWorkspaceTransactions(transactions, accounts, 'personal')).toHaveLength(0);
  });
});
