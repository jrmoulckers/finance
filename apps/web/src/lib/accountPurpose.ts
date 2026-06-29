// SPDX-License-Identifier: BUSL-1.1

import type { Account, Transaction } from '../kmp/bridge';
import type { AccountPurpose, SyncId } from '../kmp/bridge';

export type AccountPurposeFilter = 'all' | 'personal' | 'business';

export const ACCOUNT_PURPOSE_ORDER: readonly AccountPurpose[] = ['personal', 'business', 'both'];

export const ACCOUNT_PURPOSE_META: Record<
  AccountPurpose,
  {
    readonly label: string;
    readonly badge: string;
    readonly sectionLabel: string;
  }
> = {
  personal: {
    label: 'Personal',
    badge: '🏠 Personal',
    sectionLabel: '🏠 Personal',
  },
  business: {
    label: 'Business',
    badge: '💼 Business',
    sectionLabel: '💼 Business',
  },
  both: {
    label: 'Both',
    badge: '🏠💼 Both',
    sectionLabel: '🏠💼 Both',
  },
};

export const ACCOUNT_PURPOSE_FILTER_OPTIONS: readonly {
  readonly value: AccountPurposeFilter;
  readonly label: string;
}[] = [
  { value: 'all', label: 'All' },
  { value: 'personal', label: '🏠 Personal' },
  { value: 'business', label: '💼 Business' },
];

export function normalizeAccountPurpose(purpose: string | null | undefined): AccountPurpose {
  return purpose === 'business' || purpose === 'both' ? purpose : 'personal';
}

export function getAccountPurposeLabel(purpose: string | null | undefined): string {
  return ACCOUNT_PURPOSE_META[normalizeAccountPurpose(purpose)].label;
}

export function getAccountPurposeBadgeLabel(purpose: string | null | undefined): string {
  return ACCOUNT_PURPOSE_META[normalizeAccountPurpose(purpose)].badge;
}

export function matchesAccountPurposeFilter(
  purpose: string | null | undefined,
  filter: AccountPurposeFilter,
): boolean {
  const normalizedPurpose = normalizeAccountPurpose(purpose);

  if (filter === 'all') {
    return true;
  }

  if (filter === 'personal') {
    return normalizedPurpose === 'personal' || normalizedPurpose === 'both';
  }

  return normalizedPurpose === 'business' || normalizedPurpose === 'both';
}

export function filterAccountsByPurpose<T extends { readonly purpose?: AccountPurpose | null }>(
  accounts: readonly T[],
  filter: AccountPurposeFilter,
): T[] {
  return accounts.filter((account) => matchesAccountPurposeFilter(account.purpose, filter));
}

export function getScopedAccountIds(
  accounts: readonly Pick<Account, 'id' | 'purpose'>[],
  filter: AccountPurposeFilter,
): Set<SyncId> {
  return new Set(filterAccountsByPurpose(accounts, filter).map((account) => account.id));
}

export function filterTransactionsByAccountPurpose<T extends Pick<Transaction, 'accountId'>>(
  transactions: readonly T[],
  accounts: readonly Pick<Account, 'id' | 'purpose'>[],
  filter: AccountPurposeFilter,
): T[] {
  if (filter === 'all') {
    return [...transactions];
  }

  const visibleAccountIds = getScopedAccountIds(accounts, filter);
  return transactions.filter((transaction) => visibleAccountIds.has(transaction.accountId));
}

/**
 * Strict, disjoint workspace partition used for dashboard AGGREGATION.
 *
 * Unlike {@link matchesAccountPurposeFilter} — which is *inclusive* so a `both`
 * account surfaces under both the personal and business views while browsing —
 * this predicate assigns every account to exactly one workspace:
 *
 * - `personal` filter -> purpose `personal` (and untagged, which normalizes to
 *   `personal`)
 * - `business` filter -> purpose `business`
 * - `both` accounts -> a distinct shared workspace that rolls up only into `all`
 *
 * Treating the workspaces as a partition guarantees the `all` aggregate equals
 * the sum of every workspace (personal + business + shared) with no double
 * counting, so `All === Personal + Business` whenever there are no shared
 * (`both`) accounts. This is what the dashboard needs so that "All" is a true
 * sum across workspaces and never merely mirrors a single one.
 */
export function matchesWorkspaceSelection(
  purpose: string | null | undefined,
  filter: AccountPurposeFilter,
): boolean {
  if (filter === 'all') {
    return true;
  }

  return normalizeAccountPurpose(purpose) === filter;
}

export function selectWorkspaceAccounts<T extends { readonly purpose?: AccountPurpose | null }>(
  accounts: readonly T[],
  filter: AccountPurposeFilter,
): T[] {
  return accounts.filter((account) => matchesWorkspaceSelection(account.purpose, filter));
}

export function selectWorkspaceAccountIds(
  accounts: readonly Pick<Account, 'id' | 'purpose'>[],
  filter: AccountPurposeFilter,
): Set<SyncId> {
  return new Set(selectWorkspaceAccounts(accounts, filter).map((account) => account.id));
}

export function selectWorkspaceTransactions<T extends Pick<Transaction, 'accountId'>>(
  transactions: readonly T[],
  accounts: readonly Pick<Account, 'id' | 'purpose'>[],
  filter: AccountPurposeFilter,
): T[] {
  if (filter === 'all') {
    return [...transactions];
  }

  const visibleAccountIds = selectWorkspaceAccountIds(accounts, filter);
  return transactions.filter((transaction) => visibleAccountIds.has(transaction.accountId));
}
