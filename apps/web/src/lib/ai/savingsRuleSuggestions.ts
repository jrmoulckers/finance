// SPDX-License-Identifier: BUSL-1.1

export type SavingsRuleType = 'payday_percentage' | 'monthly_surplus' | 'round_up' | 'spending_reduction';
export type SavingsRisk = 'low' | 'medium' | 'high';
export type SavingsSuggestionStatus = 'suggested' | 'approved' | 'dismissed';

export interface SavingsTransaction {
  readonly id: string;
  readonly date: string;
  readonly amountCents: number;
  readonly type: 'expense' | 'income' | 'transfer';
  readonly category?: string;
  readonly merchant?: string;
}

export interface SavingsGoal {
  readonly id: string;
  readonly name: string;
  readonly currentCents: number;
  readonly targetCents: number;
  readonly targetDate?: string;
}

export interface UpcomingBillForSavings {
  readonly id: string;
  readonly merchant: string;
  readonly dueDate: string;
  readonly amountCents: number;
}

export interface SavingsRuleSuggestion {
  readonly id: string;
  readonly type: SavingsRuleType;
  readonly title: string;
  readonly targetGoalId?: string;
  readonly monthlyImpactCents: number;
  readonly cashFlowRisk: SavingsRisk;
  readonly explanation: string;
  readonly sourceTransactionIds: readonly string[];
  readonly status: SavingsSuggestionStatus;
  readonly requiresApproval: true;
}

export interface SavingsSuggestionOptions {
  readonly startDate: string;
  readonly endDate: string;
  readonly currentBalanceCents: number;
  readonly minimumSafeBalanceCents?: number;
  readonly upcomingBills?: readonly UpcomingBillForSavings[];
  readonly maxSuggestions?: number;
}

export interface SavingsSuggestionDecision {
  readonly suggestionId: string;
  readonly action: 'approve' | 'dismiss';
  readonly targetGoalId?: string;
}

export function suggestSavingsRules(transactions: readonly SavingsTransaction[], goals: readonly SavingsGoal[], options: SavingsSuggestionOptions): SavingsRuleSuggestion[] {
  if (isCashFlowRiskHigh(options)) return [];
  const scoped = transactions.filter((transaction) => transaction.date >= options.startDate && transaction.date <= options.endDate);
  const income = scoped.filter((transaction) => transaction.type === 'income');
  const expenses = scoped.filter((transaction) => transaction.type === 'expense');
  const surplus = income.reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0) - expenses.reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
  const target = chooseGoal(goals);
  const suggestions: SavingsRuleSuggestion[] = [];

  const paydayCadence = detectPaydayCadence(income);
  if (paydayCadence && income.length >= 2) {
    const averagePaycheck = Math.round(income.reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0) / income.length);
    const monthlyImpact = Math.round(averagePaycheck * 0.05 * paychecksPerMonth(paydayCadence));
    if (monthlyImpact > 0) {
      suggestions.push({
        id: 'savings-payday-percentage',
        type: 'payday_percentage',
        title: 'Save 5% on payday',
        targetGoalId: target?.id,
        monthlyImpactCents: monthlyImpact,
        cashFlowRisk: riskFor(monthlyImpact, surplus),
        explanation: `Detected ${paydayCadence} income cadence from ${income.length} paychecks; save 5% after each paycheck with user approval.`,
        sourceTransactionIds: income.map((transaction) => transaction.id),
        status: 'suggested',
        requiresApproval: true,
      });
    }
  }

  if (surplus > 0) {
    const monthlySurplus = Math.round(surplus / Math.max(1, monthsCovered(options.startDate, options.endDate)));
    const amount = Math.round(monthlySurplus * 0.25);
    if (amount >= 500) {
      suggestions.push({
        id: 'savings-monthly-surplus',
        type: 'monthly_surplus',
        title: 'Move part of monthly surplus',
        targetGoalId: target?.id,
        monthlyImpactCents: amount,
        cashFlowRisk: riskFor(amount, monthlySurplus),
        explanation: `Average monthly surplus supports a conservative 25% transfer while keeping control in review.`,
        sourceTransactionIds: scoped.map((transaction) => transaction.id),
        status: 'suggested',
        requiresApproval: true,
      });
    }
  }

  const roundUp = estimateRoundUpSavings(expenses);
  if (roundUp.monthlyImpactCents >= 300) {
    suggestions.push({
      id: 'savings-round-up',
      type: 'round_up',
      title: 'Round up purchases',
      targetGoalId: target?.id,
      monthlyImpactCents: roundUp.monthlyImpactCents,
      cashFlowRisk: 'low',
      explanation: `Rounding ${roundUp.transactionCount} card-like purchases to the next dollar could add small automatic savings.`,
      sourceTransactionIds: roundUp.sourceTransactionIds,
      status: 'suggested',
      requiresApproval: true,
    });
  }

  const reduction = suggestSpendingReduction(expenses, target?.id);
  if (reduction) suggestions.push(reduction);

  return suggestions.filter((suggestion) => suggestion.cashFlowRisk !== 'high').sort((left, right) => riskRank(left.cashFlowRisk) - riskRank(right.cashFlowRisk) || right.monthlyImpactCents - left.monthlyImpactCents).slice(0, options.maxSuggestions ?? 4);
}

export function detectPaydayCadence(income: readonly SavingsTransaction[]): 'weekly' | 'biweekly' | 'monthly' | undefined {
  const sorted = [...income].sort((left, right) => left.date.localeCompare(right.date));
  if (sorted.length < 2) return undefined;
  const intervals = sorted.slice(1).map((transaction, index) => daysBetween(sorted[index].date, transaction.date));
  const medianInterval = median(intervals);
  if (Math.abs(medianInterval - 7) <= 2) return 'weekly';
  if (Math.abs(medianInterval - 14) <= 3) return 'biweekly';
  if (Math.abs(medianInterval - 30) <= 5) return 'monthly';
  return undefined;
}

export function estimateRoundUpSavings(expenses: readonly SavingsTransaction[]): { readonly monthlyImpactCents: number; readonly transactionCount: number; readonly sourceTransactionIds: readonly string[] } {
  const candidates = expenses.filter((transaction) => Math.abs(transaction.amountCents) % 100 !== 0);
  const total = candidates.reduce((sum, transaction) => sum + (100 - (Math.abs(transaction.amountCents) % 100)), 0);
  return { monthlyImpactCents: total, transactionCount: candidates.length, sourceTransactionIds: candidates.map((transaction) => transaction.id) };
}

export function applySavingsSuggestionDecision(suggestions: readonly SavingsRuleSuggestion[], decision: SavingsSuggestionDecision): SavingsRuleSuggestion[] {
  return suggestions.map((suggestion) => {
    if (suggestion.id !== decision.suggestionId) return suggestion;
    if (decision.action === 'dismiss') return { ...suggestion, status: 'dismissed' };
    return { ...suggestion, status: 'approved', targetGoalId: decision.targetGoalId ?? suggestion.targetGoalId };
  });
}

function isCashFlowRiskHigh(options: SavingsSuggestionOptions): boolean {
  const upcomingTotal = (options.upcomingBills ?? []).filter((bill) => bill.dueDate >= options.startDate && bill.dueDate <= options.endDate).reduce((sum, bill) => sum + bill.amountCents, 0);
  return options.currentBalanceCents - upcomingTotal < (options.minimumSafeBalanceCents ?? 0);
}

function chooseGoal(goals: readonly SavingsGoal[]): SavingsGoal | undefined {
  return [...goals].filter((goal) => goal.currentCents < goal.targetCents).sort((left, right) => urgency(left) - urgency(right))[0];
}

function urgency(goal: SavingsGoal): number {
  return goal.targetDate ? Date.parse(goal.targetDate) : Number.POSITIVE_INFINITY;
}

function suggestSpendingReduction(expenses: readonly SavingsTransaction[], targetGoalId?: string): SavingsRuleSuggestion | undefined {
  const categoryTotals = new Map<string, { total: number; ids: string[] }>();
  for (const transaction of expenses) {
    const category = transaction.category ?? 'Uncategorized';
    const value = categoryTotals.get(category) ?? { total: 0, ids: [] };
    value.total += Math.abs(transaction.amountCents);
    value.ids.push(transaction.id);
    categoryTotals.set(category, value);
  }
  const [category, value] = [...categoryTotals.entries()].sort((left, right) => right[1].total - left[1].total)[0] ?? [];
  if (!category || !value || value.total < 20_000) return undefined;
  const monthlyImpact = Math.round(value.total * 0.05);
  return {
    id: `savings-reduce-${category.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}`,
    type: 'spending_reduction',
    title: `Save 5% from ${category}`,
    targetGoalId,
    monthlyImpactCents: monthlyImpact,
    cashFlowRisk: 'low',
    explanation: `${category} is the largest flexible area; a small 5% reduction can become a savings rule after approval.`,
    sourceTransactionIds: value.ids,
    status: 'suggested',
    requiresApproval: true,
  };
}

function riskFor(amount: number, surplus: number): SavingsRisk {
  if (surplus <= 0 || amount > surplus * 0.75) return 'high';
  if (amount > surplus * 0.4) return 'medium';
  return 'low';
}

function paychecksPerMonth(cadence: 'weekly' | 'biweekly' | 'monthly'): number {
  if (cadence === 'weekly') return 4.33;
  if (cadence === 'biweekly') return 2.17;
  return 1;
}

function monthsCovered(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  return Math.max(1, (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + endDate.getUTCMonth() - startDate.getUTCMonth() + 1);
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)];
}

function riskRank(value: SavingsRisk): number {
  if (value === 'low') return 0;
  if (value === 'medium') return 1;
  return 2;
}
