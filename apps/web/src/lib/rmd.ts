// SPDX-License-Identifier: BUSL-1.1

import type { Account, Transaction } from '../kmp/bridge';

export const RMD_START_AGE = 73;
export const RMD_REMINDER_WINDOW_DAYS = 60;

export const IRS_UNIFORM_LIFETIME_TABLE: Readonly<Record<number, number>> = {
  73: 26.5,
  74: 25.5,
  75: 24.6,
  76: 23.7,
  77: 22.9,
  78: 22.0,
  79: 21.1,
  80: 20.2,
  81: 19.4,
  82: 18.5,
  83: 17.7,
  84: 16.8,
  85: 16.0,
  86: 15.2,
  87: 14.4,
  88: 13.7,
  89: 12.9,
  90: 12.2,
  91: 11.5,
  92: 10.8,
  93: 10.1,
  94: 9.5,
  95: 8.9,
  96: 8.4,
  97: 7.8,
  98: 7.3,
  99: 6.8,
  100: 6.4,
  101: 6.0,
  102: 5.6,
  103: 5.2,
  104: 4.9,
  105: 4.6,
  106: 4.3,
  107: 4.1,
  108: 3.9,
  109: 3.7,
  110: 3.5,
  111: 3.4,
  112: 3.3,
  113: 3.1,
  114: 3.0,
  115: 2.9,
  116: 2.8,
  117: 2.7,
  118: 2.5,
  119: 2.3,
  120: 2.0,
};

export type RmdUrgency = 'none' | 'upcoming' | 'due-soon' | 'overdue';

export interface RmdAccountStatus {
  accountId: string;
  accountName: string;
  priorYearEndBalanceCents: number;
  distributionPeriod: number;
  requiredCents: number;
  withdrawnCents: number;
  remainingCents: number;
  deadline: string;
  daysUntilDeadline: number;
  isFirstYear: boolean;
  isSatisfied: boolean;
  urgency: RmdUrgency;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getUniformLifetimeDistributionPeriod(age: number): number | null {
  if (age < RMD_START_AGE) return null;
  if (age >= 120) return IRS_UNIFORM_LIFETIME_TABLE[120];

  return IRS_UNIFORM_LIFETIME_TABLE[age] ?? null;
}

export function calculateRequiredMinimumDistribution(
  priorYearEndBalanceCents: number,
  age: number,
): number {
  const distributionPeriod = getUniformLifetimeDistributionPeriod(age);
  if (distributionPeriod === null || priorYearEndBalanceCents <= 0) return 0;

  return Math.ceil(priorYearEndBalanceCents / distributionPeriod);
}

export function getRmdDeadline(
  age: number,
  today = new Date(),
): { date: string; isFirstYear: boolean } {
  const currentYear = today.getFullYear();
  const isFirstYear = age === RMD_START_AGE;
  const deadlineDate = isFirstYear
    ? new Date(currentYear + 1, 3, 1)
    : new Date(currentYear, 11, 31);

  return { date: formatLocalDate(deadlineDate), isFirstYear };
}

export function isTaxDeferredRmdAccount(account: Account): boolean {
  if (account.type !== 'INVESTMENT' || account.isArchived) return false;

  const normalizedName = account.name.toLowerCase().replace(/[().-]/g, ' ');
  return [
    'traditional ira',
    'sep ira',
    'simple ira',
    '401k',
    '401 k',
    '403b',
    '403 b',
    '457b',
    '457 b',
    'tax deferred',
  ].some((token) => normalizedName.includes(token));
}

function isCurrentYearAccountTransaction(
  transaction: Transaction,
  accountId: string,
  year: number,
): boolean {
  return (
    transaction.accountId === accountId &&
    transaction.status !== 'VOID' &&
    transaction.date.startsWith(`${year}-`)
  );
}

function getPriorYearEndBalanceCents(
  account: Account,
  transactions: readonly Transaction[],
  year: number,
): number {
  const currentYearNetChangeCents = transactions.reduce((sum, transaction) => {
    if (!isCurrentYearAccountTransaction(transaction, account.id, year)) return sum;
    return sum + transaction.amount.amount;
  }, 0);

  return Math.max(0, account.currentBalance.amount - currentYearNetChangeCents);
}

function getRmdWithdrawnCents(
  accountId: string,
  transactions: readonly Transaction[],
  year: number,
): number {
  return transactions.reduce((sum, transaction) => {
    if (!isCurrentYearAccountTransaction(transaction, accountId, year)) return sum;
    if (transaction.type !== 'EXPENSE' && transaction.type !== 'TRANSFER') return sum;

    return sum + Math.abs(transaction.amount.amount);
  }, 0);
}

function getDaysUntilDeadline(deadline: string, today: Date): number {
  const deadlineDate = new Date(`${deadline}T23:59:59`);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((deadlineDate.getTime() - startOfToday.getTime()) / 86_400_000);
}

function getUrgency(remainingCents: number, daysUntilDeadline: number): RmdUrgency {
  if (remainingCents <= 0) return 'none';
  if (daysUntilDeadline < 0) return 'overdue';
  if (daysUntilDeadline <= RMD_REMINDER_WINDOW_DAYS) return 'due-soon';
  return 'upcoming';
}

export function calculateRmdStatuses(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  age: number,
  today = new Date(),
): RmdAccountStatus[] {
  const distributionPeriod = getUniformLifetimeDistributionPeriod(age);
  if (distributionPeriod === null) return [];

  const currentYear = today.getFullYear();
  const deadline = getRmdDeadline(age, today);

  return accounts.filter(isTaxDeferredRmdAccount).map((account) => {
    const priorYearEndBalanceCents = getPriorYearEndBalanceCents(
      account,
      transactions,
      currentYear,
    );
    const requiredCents = calculateRequiredMinimumDistribution(priorYearEndBalanceCents, age);
    const withdrawnCents = getRmdWithdrawnCents(account.id, transactions, currentYear);
    const remainingCents = Math.max(0, requiredCents - withdrawnCents);
    const daysUntilDeadline = getDaysUntilDeadline(deadline.date, today);

    return {
      accountId: account.id,
      accountName: account.name,
      priorYearEndBalanceCents,
      distributionPeriod,
      requiredCents,
      withdrawnCents,
      remainingCents,
      deadline: deadline.date,
      daysUntilDeadline,
      isFirstYear: deadline.isFirstYear,
      isSatisfied: remainingCents === 0,
      urgency: getUrgency(remainingCents, daysUntilDeadline),
    };
  });
}
