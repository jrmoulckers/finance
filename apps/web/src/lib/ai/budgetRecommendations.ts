// SPDX-License-Identifier: BUSL-1.1

export type BudgetRecommendationAction = 'create' | 'increase' | 'decrease' | 'keep';
export type BudgetRecommendationStatus = 'suggested' | 'applied' | 'ignored' | 'snoozed';

export interface BudgetRecommendationTransaction {
  readonly id: string;
  readonly date: string;
  readonly amountCents: number;
  readonly type: 'expense' | 'income' | 'transfer';
  readonly category?: string;
  readonly merchant?: string;
}

export interface ExistingBudget {
  readonly id: string;
  readonly category: string;
  readonly amountCents: number;
}

export interface BudgetRecommendation {
  readonly id: string;
  readonly category: string;
  readonly action: BudgetRecommendationAction;
  readonly suggestedAmountCents: number;
  readonly currentAmountCents?: number;
  readonly averageSpendCents: number;
  readonly varianceCents: number;
  readonly confidence: number;
  readonly explanation: string;
  readonly sourcePeriod: { readonly start: string; readonly end: string };
  readonly sourceTransactionIds: readonly string[];
  readonly status: BudgetRecommendationStatus;
}

export interface BudgetRecommendationOptions {
  readonly startDate: string;
  readonly endDate: string;
  readonly minimumMonths?: number;
  readonly uncategorizedThresholdCents?: number;
}

export interface BudgetRecommendationDecision {
  readonly recommendationId: string;
  readonly action: 'apply' | 'edit' | 'ignore' | 'snooze';
  readonly amountCents?: number;
  readonly snoozeUntil?: string;
}

export interface AppliedBudgetChange {
  readonly category: string;
  readonly amountCents: number;
  readonly status: BudgetRecommendationStatus;
  readonly snoozeUntil?: string;
}

export function recommendBudgetsFromHistory(
  transactions: readonly BudgetRecommendationTransaction[],
  budgets: readonly ExistingBudget[],
  options: BudgetRecommendationOptions,
): BudgetRecommendation[] {
  const expenses = transactions.filter(
    (transaction) =>
      transaction.type === 'expense' &&
      transaction.date >= options.startDate &&
      transaction.date <= options.endDate,
  );
  const months = monthsCovered(options.startDate, options.endDate);
  if (months < (options.minimumMonths ?? 2)) return [];

  const byCategory = new Map<string, BudgetRecommendationTransaction[]>();
  for (const transaction of expenses) {
    const category = transaction.category ?? 'Uncategorized';
    byCategory.set(category, [...(byCategory.get(category) ?? []), transaction]);
  }

  return [...byCategory.entries()]
    .flatMap(([category, categoryTransactions]) => {
      const monthlyTotals = monthlyTotalsFor(categoryTransactions);
      const trimmed = trimOutliers(monthlyTotals);
      const average = Math.round(mean(trimmed));
      const variance = Math.round(stddev(trimmed));
      const budget = budgets.find((item) => normalize(item.category) === normalize(category));
      const suggested = roundToNearest(Math.max(0, average + variance * 0.25), 500);
      const action = chooseAction(
        category,
        suggested,
        budget,
        options.uncategorizedThresholdCents ?? 5_000,
      );
      if (action === 'keep') return [];
      const confidence = confidenceFor(trimmed.length, average, variance);
      if (confidence < 0.35) return [];
      const recommendation: BudgetRecommendation = {
        id: `budget-rec-${normalize(category).replaceAll(' ', '-')}`,
        category,
        action,
        suggestedAmountCents: suggested,
        currentAmountCents: budget?.amountCents,
        averageSpendCents: average,
        varianceCents: variance,
        confidence,
        explanation: explain(category, action, options, average, variance, budget?.amountCents),
        sourcePeriod: { start: options.startDate, end: options.endDate },
        sourceTransactionIds: categoryTransactions.map((transaction) => transaction.id),
        status: 'suggested',
      };
      return [recommendation];
    })
    .sort(
      (left, right) =>
        right.confidence - left.confidence || left.category.localeCompare(right.category),
    );
}

export function getBudgetDataNeededMessage(options: BudgetRecommendationOptions): string {
  return `At least ${options.minimumMonths ?? 2} months of local spending history are needed before recommending budget changes.`;
}

export function applyBudgetRecommendationDecision(
  recommendations: readonly BudgetRecommendation[],
  decision: BudgetRecommendationDecision,
): {
  readonly recommendations: readonly BudgetRecommendation[];
  readonly change?: AppliedBudgetChange;
} {
  let change: AppliedBudgetChange | undefined;
  const updated = recommendations.map((recommendation) => {
    if (recommendation.id !== decision.recommendationId) return recommendation;
    if (decision.action === 'ignore') return { ...recommendation, status: 'ignored' as const };
    if (decision.action === 'snooze') return { ...recommendation, status: 'snoozed' as const };
    const amountCents = decision.amountCents ?? recommendation.suggestedAmountCents;
    change = {
      category: recommendation.category,
      amountCents,
      status: 'applied',
      snoozeUntil: decision.snoozeUntil,
    };
    return { ...recommendation, suggestedAmountCents: amountCents, status: 'applied' as const };
  });
  return { recommendations: updated, change };
}

function chooseAction(
  category: string,
  suggested: number,
  budget: ExistingBudget | undefined,
  uncategorizedThreshold: number,
): BudgetRecommendationAction {
  if (!budget)
    return suggested >= uncategorizedThreshold || normalize(category) !== 'uncategorized'
      ? 'create'
      : 'keep';
  const delta = suggested - budget.amountCents;
  if (delta > Math.max(1_000, budget.amountCents * 0.1)) return 'increase';
  if (delta < -Math.max(1_000, budget.amountCents * 0.1)) return 'decrease';
  return 'keep';
}

function explain(
  category: string,
  action: BudgetRecommendationAction,
  options: BudgetRecommendationOptions,
  average: number,
  variance: number,
  current?: number,
): string {
  const currentText =
    current === undefined ? 'no current budget' : `current budget ${money(current)}`;
  return `${category} has average monthly spend ${money(average)} with variance ${money(variance)} from ${options.startDate} through ${options.endDate}; ${action} is suggested against ${currentText}.`;
}

function monthlyTotalsFor(transactions: readonly BudgetRecommendationTransaction[]): number[] {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    const month = transaction.date.slice(0, 7);
    totals.set(month, (totals.get(month) ?? 0) + Math.abs(transaction.amountCents));
  }
  return [...totals.values()];
}

function trimOutliers(values: readonly number[]): readonly number[] {
  if (values.length < 4) return values;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.slice(1, -1);
}

function monthsCovered(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  return (
    (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 +
    endDate.getUTCMonth() -
    startDate.getUTCMonth() +
    1
  );
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function stddev(values: readonly number[]): number {
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function confidenceFor(count: number, average: number, variance: number): number {
  const countScore = Math.min(0.5, count * 0.15);
  const stabilityScore = average > 0 ? Math.max(0, 0.4 - variance / average / 2) : 0;
  return Number(Math.min(0.95, countScore + stabilityScore).toFixed(2));
}

function roundToNearest(value: number, nearest: number): number {
  return Math.round(value / nearest) * nearest;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
