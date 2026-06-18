// SPDX-License-Identifier: BUSL-1.1

import type { Category, Transaction } from '../../kmp/bridge';

export type SpendingPersonaLabel =
  | 'subscription-optimizer'
  | 'weekend-explorer'
  | 'essentials-steady'
  | 'volatile-income-planner'
  | 'savings-builder'
  | 'balanced-planner'
  | 'not-enough-data';

export interface SpendingFeatureVector {
  readonly month: string;
  readonly totalExpenseCents: number;
  readonly totalIncomeCents: number;
  readonly savingsRate: number;
  readonly weekendSpendShare: number;
  readonly recurringSpendShare: number;
  readonly topCategoryShare: number;
  readonly merchantDiversity: number;
  readonly incomeVolatility: number;
}

export interface SpendingPersonaAssignment {
  readonly month: string;
  readonly label: SpendingPersonaLabel;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly vector: SpendingFeatureVector;
}

export interface SpendingPersonaResult {
  readonly status: 'ready' | 'low-data';
  readonly assignments: readonly SpendingPersonaAssignment[];
  readonly current?: SpendingPersonaAssignment;
  readonly previous?: SpendingPersonaAssignment;
  readonly comparison: string;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function amount(transaction: Transaction): number {
  return Math.abs(transaction.amount.amount);
}

function normalizeMerchant(transaction: Transaction): string {
  return (
    transaction.counterpartyName ??
    transaction.payee ??
    transaction.statementDescription ??
    'unknown merchant'
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function categoryName(transaction: Transaction, categories: readonly Category[]): string {
  const category = categories.find((item) => item.id === transaction.categoryId);
  return (category?.name ?? transaction.categoryId ?? 'uncategorized').toLowerCase();
}

function standardDeviation(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

export function buildMonthlyFeatureVectors(
  transactions: readonly Transaction[],
  categories: readonly Category[] = [],
): readonly SpendingFeatureVector[] {
  const validTransactions = transactions.filter((transaction) => transaction.status !== 'VOID');
  const incomeByMonth = new Map<string, number>();
  for (const transaction of validTransactions) {
    if (transaction.type === 'INCOME') {
      const key = monthKey(transaction.date);
      incomeByMonth.set(key, (incomeByMonth.get(key) ?? 0) + amount(transaction));
    }
  }

  const incomeValues = Array.from(incomeByMonth.values());
  const incomeAverage =
    incomeValues.length > 0
      ? incomeValues.reduce((sum, value) => sum + value, 0) / incomeValues.length
      : 0;
  const incomeVolatility = incomeAverage > 0 ? standardDeviation(incomeValues) / incomeAverage : 0;

  const grouped = new Map<string, Transaction[]>();
  for (const transaction of validTransactions) {
    const key = monthKey(transaction.date);
    grouped.set(key, [...(grouped.get(key) ?? []), transaction]);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, monthTransactions]) => {
      const expenses = monthTransactions.filter((transaction) => transaction.type === 'EXPENSE');
      const income = monthTransactions.filter((transaction) => transaction.type === 'INCOME');
      const totalExpenseCents = expenses.reduce((sum, transaction) => sum + amount(transaction), 0);
      const totalIncomeCents = income.reduce((sum, transaction) => sum + amount(transaction), 0);
      const weekendSpend = expenses
        .filter((transaction) => isWeekend(transaction.date))
        .reduce((sum, transaction) => sum + amount(transaction), 0);
      const recurringSpend = expenses
        .filter((transaction) => transaction.isRecurring || transaction.recurringRuleId !== null)
        .reduce((sum, transaction) => sum + amount(transaction), 0);
      const categoryTotals = new Map<string, number>();
      const merchants = new Set<string>();
      for (const transaction of expenses) {
        const key = categoryName(transaction, categories);
        categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + amount(transaction));
        merchants.add(normalizeMerchant(transaction));
      }
      const topCategory = Math.max(0, ...Array.from(categoryTotals.values()));
      return {
        month,
        totalExpenseCents,
        totalIncomeCents,
        savingsRate:
          totalIncomeCents > 0 ? (totalIncomeCents - totalExpenseCents) / totalIncomeCents : 0,
        weekendSpendShare: totalExpenseCents > 0 ? weekendSpend / totalExpenseCents : 0,
        recurringSpendShare: totalExpenseCents > 0 ? recurringSpend / totalExpenseCents : 0,
        topCategoryShare: totalExpenseCents > 0 ? topCategory / totalExpenseCents : 0,
        merchantDiversity: expenses.length > 0 ? merchants.size / expenses.length : 0,
        incomeVolatility,
      };
    });
}

function labelVector(
  vector: SpendingFeatureVector,
): Omit<SpendingPersonaAssignment, 'month' | 'vector'> {
  const scores: Array<{ label: SpendingPersonaLabel; score: number; evidence: string[] }> = [
    {
      label: 'subscription-optimizer',
      score: vector.recurringSpendShare,
      evidence: [`${Math.round(vector.recurringSpendShare * 100)}% of spending is recurring.`],
    },
    {
      label: 'weekend-explorer',
      score: vector.weekendSpendShare,
      evidence: [`${Math.round(vector.weekendSpendShare * 100)}% of spending happens on weekends.`],
    },
    {
      label: 'essentials-steady',
      score:
        vector.topCategoryShare >= 0.45 && vector.merchantDiversity < 0.55
          ? vector.topCategoryShare
          : 0,
      evidence: ['Spending is concentrated in a smaller set of merchants or categories.'],
    },
    {
      label: 'volatile-income-planner',
      score: Math.min(1, vector.incomeVolatility),
      evidence: [`Income volatility score is ${vector.incomeVolatility.toFixed(2)}.`],
    },
    {
      label: 'savings-builder',
      score: vector.savingsRate,
      evidence: [`Savings rate is ${Math.round(vector.savingsRate * 100)}%.`],
    },
    {
      label: 'balanced-planner',
      score: 0.42,
      evidence: ['No single spending pattern dominates this period.'],
    },
  ];

  const best =
    scores.sort((left, right) => right.score - left.score)[0] ?? scores[scores.length - 1];
  return {
    label: best.label,
    confidence: Math.max(0.35, Math.min(0.95, best.score)),
    evidence: best.evidence,
  };
}

export function assignSpendingPersonas(
  transactions: readonly Transaction[],
  categories: readonly Category[] = [],
  minimumMonths = 2,
): SpendingPersonaResult {
  const vectors = buildMonthlyFeatureVectors(transactions, categories).filter(
    (vector) => vector.totalExpenseCents > 0 || vector.totalIncomeCents > 0,
  );

  if (vectors.length < minimumMonths) {
    return {
      status: 'low-data',
      assignments: [],
      comparison: `At least ${minimumMonths} months with activity are needed before assigning a persona.`,
    };
  }

  const assignments = vectors.map((vector): SpendingPersonaAssignment => {
    const label = labelVector(vector);
    return { month: vector.month, vector, ...label };
  });
  const current = assignments[assignments.length - 1];
  const previous = assignments[assignments.length - 2];
  const comparison =
    current && previous && current.label !== previous.label
      ? `Current month shifted from ${previous.label} to ${current.label}.`
      : current
        ? `Current month remains ${current.label}.`
        : 'No current persona is available.';

  return {
    status: 'ready',
    assignments,
    current,
    previous,
    comparison,
  };
}
