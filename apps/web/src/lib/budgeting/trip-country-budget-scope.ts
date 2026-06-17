// SPDX-License-Identifier: BUSL-1.1

import { bankersRound } from './utils';

export interface TripCountryBudgetScope {
  readonly id: string;
  readonly name: string;
  readonly countries: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
  readonly localCurrency: string;
  readonly displayCurrency?: string;
  readonly tags?: readonly string[];
  readonly linkedAccountIds?: readonly string[];
  readonly archived?: boolean;
}

export interface TripBudgetTransaction {
  readonly id: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly date: string;
  readonly merchantCountry?: string | null;
  readonly tags?: readonly string[];
  readonly accountId?: string | null;
  readonly deleted?: boolean;
  readonly kind?: 'expense' | 'income' | 'transfer';
}

export interface TripBudgetRollup {
  readonly scopeId: string;
  readonly name: string;
  readonly includedTransactionIds: readonly string[];
  readonly localCurrency: string;
  readonly displayCurrency: string;
  readonly localSpendCents: number;
  readonly displaySpendCents: number;
  readonly isArchived: boolean;
  readonly appearsInActiveAlerts: boolean;
}

export type TripCurrencyConverter = (amountCents: number, fromCurrency: string, toCurrency: string) => number;

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function intersects(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  if (!left || left.length === 0) return true;
  if (!right || right.length === 0) return false;
  const rightSet = new Set(right.map((item) => item.toLowerCase()));
  return left.some((item) => rightSet.has(item.toLowerCase()));
}

export function transactionMatchesTripBudgetScope(
  scope: TripCountryBudgetScope,
  transaction: TripBudgetTransaction,
): boolean {
  if (transaction.deleted || transaction.kind === 'income' || transaction.kind === 'transfer') return false;
  if (transaction.date < scope.startDate || transaction.date > scope.endDate) return false;
  if (scope.countries.length > 0) {
    const merchantCountry = transaction.merchantCountry ? normalizeCode(transaction.merchantCountry) : null;
    if (!merchantCountry || !scope.countries.map(normalizeCode).includes(merchantCountry)) return false;
  }
  if (!intersects(scope.tags, transaction.tags)) return false;
  if (scope.linkedAccountIds && scope.linkedAccountIds.length > 0) {
    if (!transaction.accountId || !scope.linkedAccountIds.includes(transaction.accountId)) return false;
  }

  return true;
}

export function archiveTripBudgetScope(scope: TripCountryBudgetScope): TripCountryBudgetScope {
  return { ...scope, archived: true };
}

export function buildTripBudgetRollup(
  scope: TripCountryBudgetScope,
  transactions: readonly TripBudgetTransaction[],
  today: string,
  convert: TripCurrencyConverter = (amount) => amount,
): TripBudgetRollup {
  const localCurrency = normalizeCode(scope.localCurrency);
  const displayCurrency = normalizeCode(scope.displayCurrency ?? scope.localCurrency);
  const included = transactions.filter((transaction) => transactionMatchesTripBudgetScope(scope, transaction));
  const localSpendCents = included.reduce(
    (sum, transaction) => sum + Math.abs(bankersRound(convert(transaction.amountCents, normalizeCode(transaction.currency), localCurrency))),
    0,
  );
  const displaySpendCents = included.reduce(
    (sum, transaction) => sum + Math.abs(bankersRound(convert(transaction.amountCents, normalizeCode(transaction.currency), displayCurrency))),
    0,
  );
  const isArchived = scope.archived === true;

  return {
    scopeId: scope.id,
    name: scope.name,
    includedTransactionIds: included.map((transaction) => transaction.id),
    localCurrency,
    displayCurrency,
    localSpendCents,
    displaySpendCents,
    isArchived,
    appearsInActiveAlerts: !isArchived && today <= scope.endDate,
  };
}
