// SPDX-License-Identifier: BUSL-1.1

import type { Account, LocalDate, Transaction } from '../kmp/bridge';
import { isSelfEmploymentIncomeTransaction } from './tax/self-employment-income';

export const DEFAULT_TAX_RESERVE_RATE = 0.28;
export const MIN_SUGGESTED_TAX_RESERVE_RATE = 0.25;
export const MAX_SUGGESTED_TAX_RESERVE_RATE = 0.3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TaxReserveRateBreakdown {
  readonly federalRate: number;
  readonly stateRate: number;
  readonly selfEmploymentRate: number;
}

export interface TaxReserveSettings {
  readonly rate: number;
  readonly bucketBalanceCents: number;
  readonly federalRate?: number;
  readonly stateRate?: number;
  readonly selfEmploymentRate?: number;
}

export interface EstimatedTaxPaymentRecord {
  readonly id: string;
  readonly taxYear: number;
  readonly quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  readonly paidDate: LocalDate;
  readonly amountCents: number;
  readonly note?: string;
}

export type QuarterlyDueDateStatus = 'future' | 'due_soon' | 'due_today';

export interface QuarterlyTaxDueDate {
  readonly quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  readonly taxYear: number;
  readonly dueDate: Date;
  readonly periodStart: LocalDate;
  readonly periodEnd: LocalDate;
}

export interface TaxReserveSummary {
  readonly rate: number;
  readonly rateBreakdown: TaxReserveRateBreakdown;
  readonly bucketBalanceCents: number;
  readonly currentMonthNetIncomeCents: number;
  readonly currentMonthRecommendedCents: number;
  readonly monthToDateReserveCents: number;
  readonly quarterNetIncomeCents: number;
  readonly quarterRecommendedCents: number;
  readonly quarterToDateReserveCents: number;
  readonly quarterPaidCents: number;
  readonly recommendedPaymentCents: number;
  readonly remainingRecommendedPaymentCents: number;
  readonly reserveShortfallCents: number;
  readonly nextDueDate: QuarterlyTaxDueDate;
  readonly daysUntilDue: number;
  readonly dueDateStatus: QuarterlyDueDateStatus;
  readonly paymentPeriodLabel: string;
}

function toLocalDateKey(date: Date): LocalDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDate(year: number, monthIndex: number, day: number): Date {
  return new Date(year, monthIndex, day);
}

function normalizeRate(rate: number): number {
  if (!Number.isFinite(rate)) {
    return DEFAULT_TAX_RESERVE_RATE;
  }

  return Math.min(Math.max(rate, 0), 1);
}

function normalizeOptionalRate(rate: number | undefined): number {
  return Number.isFinite(rate) ? Math.min(Math.max(rate ?? 0, 0), 1) : 0;
}

function normalizeRateBreakdown(settings?: Partial<TaxReserveSettings>): TaxReserveRateBreakdown {
  const hasBreakdown =
    settings?.federalRate !== undefined ||
    settings?.stateRate !== undefined ||
    settings?.selfEmploymentRate !== undefined;

  if (!hasBreakdown) {
    return {
      federalRate: normalizeRate(settings?.rate ?? DEFAULT_TAX_RESERVE_RATE),
      stateRate: 0,
      selfEmploymentRate: 0,
    };
  }

  return {
    federalRate: normalizeOptionalRate(settings?.federalRate),
    stateRate: normalizeOptionalRate(settings?.stateRate),
    selfEmploymentRate: normalizeOptionalRate(settings?.selfEmploymentRate),
  };
}

function sumRateBreakdown(breakdown: TaxReserveRateBreakdown): number {
  return normalizeRate(breakdown.federalRate + breakdown.stateRate + breakdown.selfEmploymentRate);
}

function getDueDateStatus(daysUntilDue: number): QuarterlyDueDateStatus {
  if (daysUntilDue === 0) return 'due_today';
  if (daysUntilDue <= 7) return 'due_soon';
  return 'future';
}

function buildDueDateCandidates(year: number): QuarterlyTaxDueDate[] {
  return [
    {
      quarter: 'Q4',
      taxYear: year - 1,
      dueDate: localDate(year, 0, 15),
      periodStart: `${year - 1}-09-01`,
      periodEnd: `${year - 1}-12-31`,
    },
    {
      quarter: 'Q1',
      taxYear: year,
      dueDate: localDate(year, 3, 15),
      periodStart: `${year}-01-01`,
      periodEnd: `${year}-03-31`,
    },
    {
      quarter: 'Q2',
      taxYear: year,
      dueDate: localDate(year, 5, 15),
      periodStart: `${year}-04-01`,
      periodEnd: `${year}-05-31`,
    },
    {
      quarter: 'Q3',
      taxYear: year,
      dueDate: localDate(year, 8, 15),
      periodStart: `${year}-06-01`,
      periodEnd: `${year}-08-31`,
    },
    {
      quarter: 'Q4',
      taxYear: year,
      dueDate: localDate(year + 1, 0, 15),
      periodStart: `${year}-09-01`,
      periodEnd: `${year}-12-31`,
    },
  ];
}

export function getNextQuarterlyTaxDueDate(asOf: Date = new Date()): QuarterlyTaxDueDate {
  const today = startOfLocalDay(asOf);
  const candidates = buildDueDateCandidates(today.getFullYear());
  return (
    candidates.find((candidate) => candidate.dueDate.getTime() >= today.getTime()) ?? candidates[4]
  );
}

export function getDaysUntilDue(dueDate: Date, asOf: Date = new Date()): number {
  return Math.max(
    0,
    Math.ceil((startOfLocalDay(dueDate).getTime() - startOfLocalDay(asOf).getTime()) / DAY_MS),
  );
}

export function getCurrentMonthBounds(asOf: Date = new Date()): {
  startDate: LocalDate;
  endDate: LocalDate;
} {
  const startDate = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  const endDate = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0);

  return {
    startDate: toLocalDateKey(startDate),
    endDate: toLocalDateKey(endDate),
  };
}

function getBusinessAccountIds(accounts: readonly Pick<Account, 'id' | 'purpose'>[]): Set<string> {
  return new Set(
    accounts
      .filter((account) => account.purpose === 'business' || account.purpose === 'both')
      .map((account) => account.id),
  );
}

function isTaxReserveTaggedTransaction(
  transaction: Pick<Transaction, 'type' | 'customFields'>,
): boolean {
  if (isSelfEmploymentIncomeTransaction(transaction)) {
    return true;
  }

  const fields = transaction.customFields ?? {};
  return (
    fields['tax.deductibleStatus'] === 'DEDUCTIBLE' ||
    fields['tax.deductible'] === 'true' ||
    fields['tax.category'] === 'SCHEDULE_C_EXPENSE'
  );
}

function shouldIncludeTransaction(
  transaction: Pick<Transaction, 'accountId' | 'status' | 'date' | 'type' | 'customFields'>,
  accounts: readonly Pick<Account, 'id' | 'purpose'>[],
  startDate?: LocalDate,
  endDate?: LocalDate,
): boolean {
  if (transaction.status === 'VOID') {
    return false;
  }

  if (startDate !== undefined && transaction.date < startDate) {
    return false;
  }

  if (endDate !== undefined && transaction.date > endDate) {
    return false;
  }

  if (isTaxReserveTaggedTransaction(transaction)) {
    return true;
  }

  const businessAccountIds = getBusinessAccountIds(accounts);
  if (businessAccountIds.size === 0) {
    return true;
  }

  return businessAccountIds.has(transaction.accountId);
}

export function calculateNetSelfEmploymentIncomeCents(
  transactions: readonly Pick<
    Transaction,
    'accountId' | 'status' | 'type' | 'amount' | 'date' | 'customFields'
  >[],
  accounts: readonly Pick<Account, 'id' | 'purpose'>[] = [],
  bounds: { readonly startDate?: LocalDate; readonly endDate?: LocalDate } = {},
): number {
  const netIncome = transactions.reduce((sum, transaction) => {
    if (!shouldIncludeTransaction(transaction, accounts, bounds.startDate, bounds.endDate)) {
      return sum;
    }

    if (transaction.type === 'INCOME') {
      return sum + Math.abs(transaction.amount.amount);
    }

    if (transaction.type === 'EXPENSE') {
      return sum - Math.abs(transaction.amount.amount);
    }

    return sum;
  }, 0);

  return Math.max(0, netIncome);
}

export function calculateRecommendedTaxReserveCents(
  netIncomeCents: number,
  rate = DEFAULT_TAX_RESERVE_RATE,
): number {
  return Math.round(Math.max(0, netIncomeCents) * normalizeRate(rate));
}

export function buildTaxReserveSummary(input: {
  readonly currentMonthTransactions: readonly Pick<
    Transaction,
    'accountId' | 'status' | 'type' | 'amount' | 'date' | 'customFields'
  >[];
  readonly quarterTransactions: readonly Pick<
    Transaction,
    'accountId' | 'status' | 'type' | 'amount' | 'date' | 'customFields'
  >[];
  readonly accounts?: readonly Pick<Account, 'id' | 'purpose'>[];
  readonly settings?: Partial<TaxReserveSettings>;
  readonly estimatedPayments?: readonly EstimatedTaxPaymentRecord[];
  readonly asOf?: Date;
}): TaxReserveSummary {
  const asOf = input.asOf ?? new Date();
  const accounts = input.accounts ?? [];
  const rateBreakdown = normalizeRateBreakdown(input.settings);
  const rate = sumRateBreakdown(rateBreakdown);
  const bucketBalanceCents = Math.max(0, Math.round(input.settings?.bucketBalanceCents ?? 0));
  const currentMonthBounds = getCurrentMonthBounds(asOf);
  const nextDueDate = getNextQuarterlyTaxDueDate(asOf);

  const currentMonthNetIncomeCents = calculateNetSelfEmploymentIncomeCents(
    input.currentMonthTransactions,
    accounts,
    currentMonthBounds,
  );
  const quarterNetIncomeCents = calculateNetSelfEmploymentIncomeCents(
    input.quarterTransactions,
    accounts,
    {
      startDate: nextDueDate.periodStart,
      endDate: nextDueDate.periodEnd,
    },
  );
  const currentMonthRecommendedCents = calculateRecommendedTaxReserveCents(
    currentMonthNetIncomeCents,
    rate,
  );
  const quarterRecommendedCents = calculateRecommendedTaxReserveCents(quarterNetIncomeCents, rate);
  const reserveShortfallCents = Math.max(0, quarterRecommendedCents - bucketBalanceCents);
  const quarterPaidCents = (input.estimatedPayments ?? [])
    .filter(
      (payment) => payment.taxYear === nextDueDate.taxYear && payment.quarter === nextDueDate.quarter,
    )
    .reduce((sum, payment) => sum + Math.max(0, Math.round(payment.amountCents)), 0);
  const remainingRecommendedPaymentCents = Math.max(0, reserveShortfallCents - quarterPaidCents);
  const daysUntilDue = getDaysUntilDue(nextDueDate.dueDate, asOf);

  return {
    rate,
    rateBreakdown,
    bucketBalanceCents,
    currentMonthNetIncomeCents,
    currentMonthRecommendedCents,
    monthToDateReserveCents: currentMonthRecommendedCents,
    quarterNetIncomeCents,
    quarterRecommendedCents,
    quarterToDateReserveCents: quarterRecommendedCents,
    quarterPaidCents,
    recommendedPaymentCents: remainingRecommendedPaymentCents,
    remainingRecommendedPaymentCents,
    reserveShortfallCents,
    nextDueDate,
    daysUntilDue,
    dueDateStatus: getDueDateStatus(daysUntilDue),
    paymentPeriodLabel: `${nextDueDate.quarter} ${nextDueDate.taxYear}: ${nextDueDate.periodStart} through ${nextDueDate.periodEnd}`,
  };
}
