// SPDX-License-Identifier: BUSL-1.1

export type SummaryPeriod = 'weekly' | 'monthly';

export interface SummaryTransaction {
  readonly id: string;
  readonly date: string;
  readonly amountCents: number;
  readonly type: 'expense' | 'income' | 'transfer';
  readonly category?: string;
  readonly merchant?: string;
}

export interface SummaryBudget {
  readonly id: string;
  readonly name: string;
  readonly amountCents: number;
  readonly spentCents: number;
}

export interface SummaryGoal {
  readonly id: string;
  readonly name: string;
  readonly currentCents: number;
  readonly targetCents: number;
  readonly previousCurrentCents?: number;
}

export interface SummaryBill {
  readonly id: string;
  readonly merchant: string;
  readonly dueDate: string;
  readonly amountCents: number;
  readonly paid?: boolean;
}

export interface PeriodSummaryInput {
  readonly period: SummaryPeriod;
  readonly startDate: string;
  readonly endDate: string;
  readonly transactions: readonly SummaryTransaction[];
  readonly comparisonTransactions?: readonly SummaryTransaction[];
  readonly budgets?: readonly SummaryBudget[];
  readonly goals?: readonly SummaryGoal[];
  readonly bills?: readonly SummaryBill[];
  readonly locale?: string;
}

export interface NarrativeClaimSource {
  readonly metric: string;
  readonly value: number | string;
  readonly sourceIds: readonly string[];
}

export interface PeriodSummaryNarrative {
  readonly id: string;
  readonly period: SummaryPeriod;
  readonly dateRange: { readonly start: string; readonly end: string };
  readonly headline: string;
  readonly highlights: readonly string[];
  readonly risks: readonly string[];
  readonly nextActions: readonly string[];
  readonly sources: readonly NarrativeClaimSource[];
  readonly generatedAt: string;
}

export function generateSummaryNarrative(input: PeriodSummaryInput, generatedAt = new Date().toISOString()): PeriodSummaryNarrative {
  const transactions = input.transactions.filter((transaction) => transaction.date >= input.startDate && transaction.date <= input.endDate);
  const expenses = transactions.filter((transaction) => transaction.type === 'expense');
  const incomes = transactions.filter((transaction) => transaction.type === 'income');
  const spending = expenses.reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
  const income = incomes.reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
  const net = income - spending;
  const categoryTotals = totalByCategory(expenses);
  const topCategory = [...categoryTotals.entries()].sort((left, right) => right[1] - left[1])[0];
  const comparisonSpending = (input.comparisonTransactions ?? []).filter((transaction) => transaction.type === 'expense').reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
  const spendingChange = comparisonSpending > 0 ? (spending - comparisonSpending) / comparisonSpending : 0;

  const highlights: string[] = [];
  const risks: string[] = [];
  const nextActions: string[] = [];
  const sources: NarrativeClaimSource[] = [
    { metric: 'incomeCents', value: income, sourceIds: incomes.map((transaction) => transaction.id) },
    { metric: 'spendingCents', value: spending, sourceIds: expenses.map((transaction) => transaction.id) },
  ];

  if (transactions.length === 0) {
    highlights.push(`No local transaction activity was recorded for ${input.startDate} through ${input.endDate}.`);
    nextActions.push('Check back after new transactions sync or widen the date range.');
  } else {
    highlights.push(`${capitalize(input.period)} recap: income was ${money(income, input.locale)} and spending was ${money(spending, input.locale)}, for net cash flow of ${money(net, input.locale)}.`);
    if (topCategory) {
      highlights.push(`${topCategory[0]} was the largest spending area at ${money(topCategory[1], input.locale)}.`);
      sources.push({ metric: `category:${topCategory[0]}`, value: topCategory[1], sourceIds: expenses.filter((transaction) => (transaction.category ?? 'Uncategorized') === topCategory[0]).map((transaction) => transaction.id) });
    }
    if (spendingChange >= 0.25) risks.push(`Spending was ${Math.round(spendingChange * 100)}% higher than the comparison period.`);
    if (spendingChange <= -0.15) highlights.push(`Spending improved by ${Math.abs(Math.round(spendingChange * 100))}% versus the comparison period.`);
  }

  for (const budget of input.budgets ?? []) {
    const percent = budget.amountCents > 0 ? budget.spentCents / budget.amountCents : 0;
    sources.push({ metric: `budget:${budget.id}`, value: Math.round(percent * 100), sourceIds: [budget.id] });
    if (percent >= 1) risks.push(`${budget.name} is over budget; review recent transactions before adding new spend.`);
    else if (percent >= 0.8) risks.push(`${budget.name} is close to its limit at ${Math.round(percent * 100)}% used.`);
    else highlights.push(`${budget.name} remains on pace at ${Math.round(percent * 100)}% used.`);
  }

  for (const goal of input.goals ?? []) {
    const progress = goal.targetCents > 0 ? goal.currentCents / goal.targetCents : 0;
    const change = goal.currentCents - (goal.previousCurrentCents ?? goal.currentCents);
    sources.push({ metric: `goal:${goal.id}`, value: Math.round(progress * 100), sourceIds: [goal.id] });
    if (change > 0) highlights.push(`${goal.name} gained ${money(change, input.locale)} and is ${Math.round(progress * 100)}% funded.`);
  }

  const unpaidBills = (input.bills ?? []).filter((bill) => !bill.paid && bill.dueDate >= input.startDate && bill.dueDate <= input.endDate);
  if (unpaidBills.length > 0) {
    risks.push(`${unpaidBills.length} bill(s) still need attention in this period, starting with ${unpaidBills[0].merchant}.`);
    nextActions.push(`Review ${unpaidBills[0].merchant} before ${unpaidBills[0].dueDate}.`);
    sources.push({ metric: 'unpaidBills', value: unpaidBills.length, sourceIds: unpaidBills.map((bill) => bill.id) });
  }

  const unusual = detectUnusualTransactions(expenses);
  if (unusual.length > 0) {
    risks.push(`Largest unusual transaction: ${unusual[0].merchant ?? 'Unknown merchant'} at ${money(Math.abs(unusual[0].amountCents), input.locale)}.`);
    sources.push({ metric: 'unusualTransaction', value: unusual[0].id, sourceIds: [unusual[0].id] });
  }

  if (nextActions.length === 0) nextActions.push(net >= 0 ? 'Consider assigning part of the positive cash flow to a goal.' : 'Review flexible categories for one small adjustment next period.');

  return {
    id: `${input.period}-${input.startDate}-${input.endDate}`,
    period: input.period,
    dateRange: { start: input.startDate, end: input.endDate },
    headline: highlights[0] ?? `${capitalize(input.period)} summary is ready.`,
    highlights,
    risks,
    nextActions,
    sources,
    generatedAt,
  };
}

function totalByCategory(transactions: readonly SummaryTransaction[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    const key = transaction.category ?? 'Uncategorized';
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(transaction.amountCents));
  }
  return totals;
}

function detectUnusualTransactions(expenses: readonly SummaryTransaction[]): SummaryTransaction[] {
  if (expenses.length < 3) return [];
  const amounts = expenses.map((transaction) => Math.abs(transaction.amountCents)).sort((left, right) => left - right);
  const median = amounts[Math.floor(amounts.length / 2)];
  return expenses.filter((transaction) => Math.abs(transaction.amountCents) >= median * 3).sort((left, right) => Math.abs(right.amountCents) - Math.abs(left.amountCents));
}

function money(cents: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function capitalize(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
