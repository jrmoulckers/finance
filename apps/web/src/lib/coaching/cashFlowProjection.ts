// SPDX-License-Identifier: BUSL-1.1

import type { Account, Transaction } from '../../kmp/bridge';
import type {
  CashFlowAccountSnapshot,
  CashFlowProjection,
  CashFlowProjectionInput,
  RecurrenceCadence,
  RecurringCashFlowItem,
} from './types';

const LIQUID_ACCOUNT_TYPES = new Set(['CHECKING', 'SAVINGS', 'CASH']);
type CashFlowTransaction = Transaction & { type: 'INCOME' | 'EXPENSE' };

function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function daysBetween(startDate: string, endDate: string): number {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function getMonthBounds(today: string) {
  const currentDate = parseLocalDate(today);
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  return {
    monthStart: formatLocalDate(monthStart),
    monthEnd: formatLocalDate(monthEnd),
    daysRemaining: Math.max(0, daysBetween(today, formatLocalDate(monthEnd))),
  };
}

function normalizeAmountCents(transaction: Transaction): number {
  return Math.abs(transaction.amount.amount);
}

function normalizeLabel(
  transaction: Transaction,
  categoriesById: ReadonlyMap<string, string>,
): string {
  return (
    transaction.payee?.trim() ||
    transaction.counterpartyName?.trim() ||
    transaction.note?.trim() ||
    (transaction.categoryId !== null ? categoriesById.get(transaction.categoryId) : null) ||
    (transaction.type === 'INCOME' ? 'Income' : 'Expense')
  );
}

function isCashFlowTransaction(transaction: Transaction): transaction is CashFlowTransaction {
  return transaction.type === 'INCOME' || transaction.type === 'EXPENSE';
}

function groupKey(
  transaction: Transaction,
  categoriesById: ReadonlyMap<string, string>,
  amountToleranceCents: number,
): string {
  const roundedAmount = Math.round(normalizeAmountCents(transaction) / amountToleranceCents);
  const normalizedLabel = normalizeLabel(transaction, categoriesById).toLowerCase();
  return [
    transaction.recurringRuleId ?? 'ruleless',
    transaction.type,
    transaction.categoryId ?? 'uncategorized',
    normalizedLabel,
    roundedAmount,
  ].join(':');
}

function inferCadence(
  intervals: readonly number[],
): { cadence: RecurrenceCadence; intervalDays: number } | null {
  if (intervals.length === 0) {
    return null;
  }

  const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  const everyWithin = (target: number, tolerance: number) =>
    intervals.every((interval) => Math.abs(interval - target) <= tolerance);

  if (everyWithin(7, 2) || (averageInterval >= 6 && averageInterval <= 8)) {
    return { cadence: 'weekly', intervalDays: 7 };
  }

  if (everyWithin(14, 3) || (averageInterval >= 12 && averageInterval <= 16)) {
    return { cadence: 'biweekly', intervalDays: 14 };
  }

  if (everyWithin(30, 5) || (averageInterval >= 26 && averageInterval <= 35)) {
    return { cadence: 'monthly', intervalDays: 30 };
  }

  return null;
}

function getBalanceSnapshots(accounts: readonly Account[]): readonly CashFlowAccountSnapshot[] {
  const liquidAccounts = accounts.filter((account) => LIQUID_ACCOUNT_TYPES.has(account.type));
  const sourceAccounts = liquidAccounts.length > 0 ? liquidAccounts : accounts;

  return sourceAccounts.map((account) => ({
    accountId: account.id,
    accountName: account.name,
    accountType: account.type,
    balanceCents: account.currentBalance.amount,
  }));
}

function detectRecurringItems(
  transactions: readonly Transaction[],
  categoriesById: ReadonlyMap<string, string>,
  today: string,
  monthEnd: string,
): readonly RecurringCashFlowItem[] {
  const groups = new Map<string, CashFlowTransaction[]>();

  for (const transaction of transactions.filter(isCashFlowTransaction)) {
    const key = groupKey(transaction, categoriesById, 500);
    const group = groups.get(key) ?? [];
    group.push(transaction);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .flatMap((group) => {
      if (group.length < 2) {
        return [];
      }

      const sortedTransactions = [...group].sort((left, right) =>
        left.date.localeCompare(right.date),
      );
      const intervals = sortedTransactions
        .slice(1)
        .map((transaction, index) => daysBetween(sortedTransactions[index].date, transaction.date));
      const cadence = inferCadence(intervals);
      if (cadence === null) {
        return [];
      }

      const latestTransaction = sortedTransactions[sortedTransactions.length - 1];
      let nextExpectedDate = addDays(parseLocalDate(latestTransaction.date), cadence.intervalDays);
      let occurrencesRemaining = 0;
      while (formatLocalDate(nextExpectedDate) <= monthEnd) {
        if (formatLocalDate(nextExpectedDate) > today) {
          occurrencesRemaining += 1;
        }
        nextExpectedDate = addDays(nextExpectedDate, cadence.intervalDays);
      }

      const averageAmountCents = Math.round(
        sortedTransactions.reduce(
          (sum, transaction) => sum + normalizeAmountCents(transaction),
          0,
        ) / sortedTransactions.length,
      );
      const nextDate = addDays(parseLocalDate(latestTransaction.date), cadence.intervalDays);

      return [
        {
          id: `recurring:${groupKey(latestTransaction, categoriesById, 500)}:${monthEnd}`,
          label: normalizeLabel(latestTransaction, categoriesById),
          type: latestTransaction.type,
          cadence: cadence.cadence,
          averageAmountCents,
          occurrencesRemaining,
          nextExpectedDate: formatLocalDate(nextDate),
          projectedAmountCents: averageAmountCents * occurrencesRemaining,
          sourceTransactionIds: sortedTransactions.map((transaction) => transaction.id),
        } satisfies RecurringCashFlowItem,
      ];
    })
    .sort((left, right) => right.projectedAmountCents - left.projectedAmountCents);
}

export function projectCashFlow({
  accounts,
  categoriesById,
  transactions,
  today = formatLocalDate(new Date()),
}: CashFlowProjectionInput): CashFlowProjection {
  const { monthStart, monthEnd, daysRemaining } = getMonthBounds(today);
  const balanceSnapshots = getBalanceSnapshots(accounts);
  const currentBalanceCents = balanceSnapshots.reduce(
    (sum, account) => sum + account.balanceCents,
    0,
  );
  const recurringPatterns = detectRecurringItems(transactions, categoriesById, today, monthEnd);
  const recurringItems = recurringPatterns.filter((item) => item.occurrencesRemaining > 0);

  const recurringExpenseIds = new Set(
    recurringPatterns
      .filter((item) => item.type === 'EXPENSE')
      .flatMap((item) => item.sourceTransactionIds),
  );

  const projectedRecurringIncomeCents = recurringItems
    .filter((item) => item.type === 'INCOME')
    .reduce((sum, item) => sum + item.projectedAmountCents, 0);
  const projectedRecurringExpenseCents = recurringItems
    .filter((item) => item.type === 'EXPENSE')
    .reduce((sum, item) => sum + item.projectedAmountCents, 0);

  const daysElapsed = Math.max(1, parseLocalDate(today).getDate());
  const discretionarySpendSoFarCents = transactions.reduce((sum, transaction) => {
    if (
      transaction.type !== 'EXPENSE' ||
      transaction.date < monthStart ||
      transaction.date > today ||
      recurringExpenseIds.has(transaction.id)
    ) {
      return sum;
    }

    return sum + normalizeAmountCents(transaction);
  }, 0);
  const projectedDiscretionaryExpenseCents = Math.round(
    (discretionarySpendSoFarCents / daysElapsed) * daysRemaining,
  );
  const projectedEndBalanceCents =
    currentBalanceCents +
    projectedRecurringIncomeCents -
    projectedRecurringExpenseCents -
    projectedDiscretionaryExpenseCents;

  return {
    currentBalanceCents,
    projectedRecurringIncomeCents,
    projectedRecurringExpenseCents,
    projectedDiscretionaryExpenseCents,
    projectedEndBalanceCents,
    daysRemaining,
    willOverdraft: projectedEndBalanceCents < 0,
    balanceSnapshots,
    recurringItems,
  };
}
