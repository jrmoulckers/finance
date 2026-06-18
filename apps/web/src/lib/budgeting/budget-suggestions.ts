// SPDX-License-Identifier: BUSL-1.1

import { bankersRound } from './utils';

export type BudgetSuggestionRule = 'average' | 'median' | 'high-water' | 'hybrid';
export type BudgetSuggestionConfidence = 'none' | 'low' | 'medium' | 'high';

export interface BudgetSuggestionCategory {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string | null;
  readonly type?: 'expense' | 'income' | 'transfer';
}

export interface BudgetSuggestionTransaction {
  readonly id: string;
  readonly categoryId: string | null;
  readonly amountCents: number;
  readonly date: string;
  readonly kind?: 'expense' | 'income' | 'transfer';
  readonly deleted?: boolean;
}

export interface MonthlySpendSample {
  readonly monthKey: string;
  readonly amountCents: number;
}

export interface BudgetAmountSuggestion {
  readonly categoryId: string;
  readonly suggestedAmountCents: number | null;
  readonly confidence: BudgetSuggestionConfidence;
  readonly rule: BudgetSuggestionRule;
  readonly basis: string;
  readonly monthsAnalyzed: number;
  readonly monthsWithSpend: number;
  readonly samples: readonly MonthlySpendSample[];
  readonly outlierMonthKeys: readonly string[];
  readonly includesChildren: boolean;
  readonly fallbackReason: string | null;
}

export interface BudgetSuggestionInput {
  readonly categoryId: string;
  readonly categories: readonly BudgetSuggestionCategory[];
  readonly transactions: readonly BudgetSuggestionTransaction[];
  readonly asOfMonth?: string;
  readonly lookbackMonths?: number;
  readonly rule?: BudgetSuggestionRule;
  readonly includeChildren?: boolean;
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function addMonths(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function defaultAsOfMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return bankersRound((sorted[middle - 1] + sorted[middle]) / 2);
}

function collectCategoryIds(
  rootCategoryId: string,
  categories: readonly BudgetSuggestionCategory[],
  includeChildren: boolean,
): Set<string> {
  const ids = new Set([rootCategoryId]);
  if (!includeChildren) {
    return ids;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        changed = true;
      }
    }
  }

  return ids;
}

function confidence(monthsWithSpend: number, outlierCount: number): BudgetSuggestionConfidence {
  if (monthsWithSpend === 0) {
    return 'none';
  }
  if (monthsWithSpend < 3) {
    return 'low';
  }
  if (outlierCount > 0 || monthsWithSpend < 6) {
    return 'medium';
  }
  return 'high';
}

function isExpenseTransaction(
  transaction: BudgetSuggestionTransaction,
  categoryById: ReadonlyMap<string, BudgetSuggestionCategory>,
): boolean {
  if (transaction.deleted || transaction.categoryId === null) {
    return false;
  }
  if (transaction.kind === 'income' || transaction.kind === 'transfer') {
    return false;
  }

  const category = categoryById.get(transaction.categoryId);
  return category?.type !== 'income' && category?.type !== 'transfer';
}

export function suggestCategoryBudgetAmount(input: BudgetSuggestionInput): BudgetAmountSuggestion {
  const lookbackMonths = input.lookbackMonths ?? 6;
  const rule = input.rule ?? 'hybrid';
  const asOfMonth = input.asOfMonth ?? defaultAsOfMonth();
  const includeChildren = input.includeChildren ?? true;
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const categoryIds = collectCategoryIds(input.categoryId, input.categories, includeChildren);
  const months = Array.from({ length: lookbackMonths }, (_, index) =>
    addMonths(asOfMonth, index - lookbackMonths + 1),
  );
  const spendByMonth = new Map(months.map((month) => [month, 0]));

  for (const transaction of input.transactions) {
    if (
      !isExpenseTransaction(transaction, categoryById) ||
      !categoryIds.has(transaction.categoryId ?? '')
    ) {
      continue;
    }

    const key = monthKey(transaction.date);
    if (!spendByMonth.has(key)) {
      continue;
    }

    spendByMonth.set(
      key,
      (spendByMonth.get(key) ?? 0) + Math.abs(bankersRound(transaction.amountCents)),
    );
  }

  const samples = months.map((key) => ({ monthKey: key, amountCents: spendByMonth.get(key) ?? 0 }));
  const positiveSamples = samples
    .map((sample) => sample.amountCents)
    .filter((amount) => amount > 0);
  const monthsWithSpend = positiveSamples.length;

  if (monthsWithSpend === 0) {
    return {
      categoryId: input.categoryId,
      suggestedAmountCents: null,
      confidence: 'none',
      rule,
      basis: 'No recent spending found for this category.',
      monthsAnalyzed: lookbackMonths,
      monthsWithSpend,
      samples,
      outlierMonthKeys: [],
      includesChildren: includeChildren,
      fallbackReason: 'empty-history',
    };
  }

  const medianSpend = median(positiveSamples);
  const averageSpend = bankersRound(
    positiveSamples.reduce((sum, amount) => sum + amount, 0) / monthsWithSpend,
  );
  const highWaterSpend = Math.max(...positiveSamples);
  const outlierThreshold = medianSpend > 0 ? medianSpend * 2.5 : Number.POSITIVE_INFINITY;
  const outlierMonthKeys = samples
    .filter((sample) => sample.amountCents > outlierThreshold)
    .map((sample) => sample.monthKey);
  const nonOutlierSamples = positiveSamples.filter((amount) => amount <= outlierThreshold);
  const stableAverage =
    nonOutlierSamples.length > 0
      ? bankersRound(
          nonOutlierSamples.reduce((sum, amount) => sum + amount, 0) / nonOutlierSamples.length,
        )
      : averageSpend;
  const suggestedAmountCents =
    rule === 'median'
      ? medianSpend
      : rule === 'average'
        ? averageSpend
        : rule === 'high-water'
          ? highWaterSpend
          : outlierMonthKeys.length > 0
            ? bankersRound((medianSpend + stableAverage) / 2)
            : averageSpend;
  const sparse = monthsWithSpend < 3;

  return {
    categoryId: input.categoryId,
    suggestedAmountCents,
    confidence: confidence(monthsWithSpend, outlierMonthKeys.length),
    rule,
    basis:
      rule === 'hybrid'
        ? `Based on ${monthsWithSpend} spending month(s); outliers ${outlierMonthKeys.length > 0 ? 'were dampened' : 'were not detected'}.`
        : `Based on ${rule} monthly spend over ${monthsWithSpend} spending month(s).`,
    monthsAnalyzed: lookbackMonths,
    monthsWithSpend,
    samples,
    outlierMonthKeys,
    includesChildren: includeChildren,
    fallbackReason: sparse ? 'sparse-history' : null,
  };
}
