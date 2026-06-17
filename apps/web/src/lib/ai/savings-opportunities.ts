// SPDX-License-Identifier: BUSL-1.1

import type { Transaction } from '../../kmp/bridge';

export type SavingsOpportunityKind =
  | 'subscription'
  | 'fee'
  | 'category-creep'
  | 'unused-merchant'
  | 'discretionary-spike'
  | 'safe-transfer';

export interface SavingsOpportunityInput {
  readonly transactions: readonly Transaction[];
  readonly asOfDate?: string;
  readonly currentBalanceCents: number;
  readonly forecastLowBalanceCents?: number;
  readonly safetyBufferCents?: number;
  readonly dismissedOpportunityIds?: readonly string[];
}

export interface SavingsOpportunity {
  readonly id: string;
  readonly kind: SavingsOpportunityKind;
  readonly title: string;
  readonly estimateMonthlySavingsCents: number;
  readonly safeTransferCents: number;
  readonly confidence: number;
  readonly effort: 'low' | 'medium' | 'high';
  readonly rankScore: number;
  readonly assumptions: readonly string[];
  readonly transactionIds: readonly string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DISCRETIONARY_WORDS = ['dining', 'restaurant', 'coffee', 'shopping', 'entertainment', 'travel'];

function parseDate(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

function daysBetween(left: string, right: string): number {
  return Math.round((parseDate(right) - parseDate(left)) / DAY_MS);
}

function normalizeMerchant(transaction: Transaction): string {
  return (
    transaction.counterpartyName ??
    transaction.payee ??
    transaction.statementDescription ??
    transaction.note ??
    'Unknown merchant'
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function amount(transaction: Transaction): number {
  return Math.abs(transaction.amount.amount);
}

function isFee(transaction: Transaction): boolean {
  const text = `${transaction.payee ?? ''} ${transaction.counterpartyName ?? ''} ${transaction.note ?? ''} ${transaction.statementDescription ?? ''}`.toLowerCase();
  return /\b(fee|atm|overdraft|maintenance|service charge|late payment)\b/.test(text);
}

function pushOpportunity(
  opportunities: SavingsOpportunity[],
  dismissed: Set<string>,
  opportunity: Omit<SavingsOpportunity, 'rankScore'>,
): void {
  if (dismissed.has(opportunity.id) || opportunity.estimateMonthlySavingsCents <= 0) return;
  const effortPenalty = opportunity.effort === 'low' ? 0 : opportunity.effort === 'medium' ? 8 : 16;
  const rankScore = Math.round(
    opportunity.estimateMonthlySavingsCents / 1_000 + opportunity.confidence * 50 - effortPenalty,
  );
  opportunities.push({ ...opportunity, rankScore });
}

function safeTransferCap(input: SavingsOpportunityInput): number {
  const safetyBuffer = input.safetyBufferCents ?? 0;
  const lowBalance = input.forecastLowBalanceCents ?? input.currentBalanceCents;
  return Math.max(0, Math.floor((lowBalance - safetyBuffer) * 0.5));
}

export function findSavingsOpportunities(
  input: SavingsOpportunityInput,
): readonly SavingsOpportunity[] {
  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const dismissed = new Set(input.dismissedOpportunityIds ?? []);
  const safeCap = safeTransferCap(input);
  const expenses = input.transactions
    .filter((transaction) => transaction.status !== 'VOID' && transaction.type === 'EXPENSE')
    .sort((left, right) => left.date.localeCompare(right.date));
  const opportunities: SavingsOpportunity[] = [];

  const byMerchant = new Map<string, Transaction[]>();
  for (const transaction of expenses) {
    const key = normalizeMerchant(transaction);
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), transaction]);
  }

  for (const [merchant, merchantTransactions] of byMerchant.entries()) {
    const dates = merchantTransactions.map((transaction) => transaction.date).sort();
    const intervals = dates.slice(1).map((date, index) => daysBetween(dates[index] ?? date, date));
    const averageInterval =
      intervals.length > 0 ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0;
    const medianAmount = merchantTransactions
      .map(amount)
      .sort((left, right) => left - right)[Math.floor(merchantTransactions.length / 2)] ?? 0;

    if (merchantTransactions.length >= 3 && averageInterval >= 25 && averageInterval <= 35) {
      pushOpportunity(opportunities, dismissed, {
        id: `subscription-${merchant}`,
        kind: 'subscription',
        title: `Review recurring ${merchant}`,
        estimateMonthlySavingsCents: Math.round(medianAmount),
        safeTransferCents: Math.min(safeCap, Math.round(medianAmount)),
        confidence: Math.min(0.92, 0.55 + merchantTransactions.length * 0.08),
        effort: 'medium',
        assumptions: ['Similar merchant charge repeats roughly monthly.', 'Savings assumes cancelling or downgrading one recurring charge.'],
        transactionIds: merchantTransactions.map((transaction) => transaction.id),
      });
    }

    const lastDate = dates[dates.length - 1];
    if (lastDate !== undefined && daysBetween(lastDate, asOfDate) > 60 && merchantTransactions.length >= 2) {
      pushOpportunity(opportunities, dismissed, {
        id: `unused-${merchant}`,
        kind: 'unused-merchant',
        title: `Check whether ${merchant} is still useful`,
        estimateMonthlySavingsCents: Math.round(medianAmount * 0.5),
        safeTransferCents: Math.min(safeCap, Math.round(medianAmount * 0.5)),
        confidence: 0.55,
        effort: 'low',
        assumptions: ['Merchant has not appeared recently.', 'Savings estimate uses half of its typical charge.'],
        transactionIds: merchantTransactions.map((transaction) => transaction.id),
      });
    }
  }

  const feeTransactions = expenses.filter(isFee);
  const monthlyFees = feeTransactions.reduce((sum, transaction) => sum + amount(transaction), 0) / 3;
  if (feeTransactions.length > 0) {
    pushOpportunity(opportunities, dismissed, {
      id: 'fees',
      kind: 'fee',
      title: 'Reduce avoidable fees',
      estimateMonthlySavingsCents: Math.round(monthlyFees),
      safeTransferCents: Math.min(safeCap, Math.round(monthlyFees)),
      confidence: Math.min(0.9, 0.5 + feeTransactions.length * 0.1),
      effort: 'medium',
      assumptions: ['Recent fee-like transactions can often be avoided or refunded.', 'Estimate spreads observed fees across a quarter.'],
      transactionIds: feeTransactions.map((transaction) => transaction.id),
    });
  }

  const recentCutoff = parseDate(asOfDate) - 30 * DAY_MS;
  const priorCutoff = parseDate(asOfDate) - 60 * DAY_MS;
  const categoryTotals = new Map<string, { recent: number; prior: number; ids: string[] }>();
  for (const transaction of expenses) {
    const key = transaction.categoryId ?? 'uncategorized';
    const bucket = categoryTotals.get(key) ?? { recent: 0, prior: 0, ids: [] };
    const txDate = parseDate(transaction.date);
    if (txDate >= recentCutoff) {
      bucket.recent += amount(transaction);
      bucket.ids.push(transaction.id);
    } else if (txDate >= priorCutoff) {
      bucket.prior += amount(transaction);
    }
    categoryTotals.set(key, bucket);
  }

  for (const [categoryId, totals] of categoryTotals.entries()) {
    if (totals.prior > 0 && totals.recent > totals.prior * 1.25) {
      const savings = Math.round((totals.recent - totals.prior) * 0.4);
      pushOpportunity(opportunities, dismissed, {
        id: `category-creep-${categoryId}`,
        kind: 'category-creep',
        title: 'Trim a category that is creeping up',
        estimateMonthlySavingsCents: savings,
        safeTransferCents: Math.min(safeCap, savings),
        confidence: 0.7,
        effort: 'low',
        assumptions: ['Recent 30-day category spending is above the prior 30-day baseline.', 'Estimate targets 40% of the increase.'],
        transactionIds: totals.ids,
      });
    }
  }

  const discretionary = expenses.filter((transaction) => {
    const text = `${transaction.categoryId ?? ''} ${transaction.payee ?? ''} ${transaction.counterpartyName ?? ''}`.toLowerCase();
    return DISCRETIONARY_WORDS.some((word) => text.includes(word));
  });
  const discretionaryRecent = discretionary.filter(
    (transaction) => parseDate(transaction.date) >= recentCutoff,
  );
  const discretionaryTotal = discretionaryRecent.reduce((sum, transaction) => sum + amount(transaction), 0);
  if (discretionaryRecent.length >= 3 && discretionaryTotal > 25_000) {
    const savings = Math.round(discretionaryTotal * 0.15);
    pushOpportunity(opportunities, dismissed, {
      id: 'discretionary-spike',
      kind: 'discretionary-spike',
      title: 'Capture part of a discretionary spike',
      estimateMonthlySavingsCents: savings,
      safeTransferCents: Math.min(safeCap, savings),
      confidence: 0.68,
      effort: 'low',
      assumptions: ['Recent discretionary spending is large enough to trim safely.', 'Estimate targets a modest 15% reduction.'],
      transactionIds: discretionaryRecent.map((transaction) => transaction.id),
    });
  }

  if (safeCap > 0) {
    pushOpportunity(opportunities, dismissed, {
      id: 'safe-transfer',
      kind: 'safe-transfer',
      title: 'Move surplus cash safely',
      estimateMonthlySavingsCents: Math.min(safeCap, 50_000),
      safeTransferCents: Math.min(safeCap, 50_000),
      confidence: input.forecastLowBalanceCents === undefined ? 0.55 : 0.78,
      effort: 'low',
      assumptions: ['Uses half of the amount above the safety buffer.', 'Does not require changing real transactions.'],
      transactionIds: [],
    });
  }

  return opportunities.sort((left, right) => right.rankScore - left.rankScore);
}
