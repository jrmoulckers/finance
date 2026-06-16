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
