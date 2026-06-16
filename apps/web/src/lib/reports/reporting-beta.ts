// SPDX-License-Identifier: BUSL-1.1

import type { Account, Category, LocalDate, SyncId, Transaction } from '../../kmp/bridge';

export interface ReportDataFilters {
  readonly startDate?: LocalDate | null;
  readonly endDate?: LocalDate | null;
  readonly categoryIds?: readonly SyncId[];
  readonly accountIds?: readonly SyncId[];
}

export interface DrillDownTransactionRow {
  readonly id: SyncId;
  readonly date: LocalDate;
  readonly payee: string;
  readonly accountName: string;
  readonly amount: number;
  readonly tags: readonly string[];
  readonly note: string;
}

export interface CategoryDrillDown {
  readonly categoryId: SyncId | null;
  readonly categoryName: string;
  readonly total: number;
  readonly transactionCount: number;
  readonly averageTransaction: number;
  readonly largestTransaction: DrillDownTransactionRow | null;
  readonly transactions: DrillDownTransactionRow[];
}

export interface MonthlySpendingPoint {
  readonly month: string;
  readonly total: number;
  readonly topCategories: readonly { categoryName: string; amount: number }[];
}

export interface SeasonalitySignal {
  readonly categoryName: string;
  readonly monthName: string;
  readonly averageAmount: number;
  readonly normalMonthlyAverage: number;
  readonly upcomingWindow: string;
  readonly summary: string;
}

export interface SpendingPacingInsight {
  readonly currentMonth: string;
  readonly spentSoFar: number;
  readonly projectedSpend: number;
  readonly historicalAverage: number;
  readonly direction: 'above-normal' | 'normal' | 'insufficient-data';
  readonly summary: string;
}

export interface SpendingTrendInsight {
  readonly periodMonths: 6 | 12 | 24;
  readonly insufficientData: boolean;
  readonly monthlyTotals: MonthlySpendingPoint[];
  readonly seasonality: SeasonalitySignal[];
  readonly pacing: SpendingPacingInsight;
  readonly actionableCopy: readonly string[];
}

export interface AnnualSummary {
  readonly year: number;
  readonly startDate: LocalDate;
  readonly endDate: LocalDate;
  readonly monthCount: number;
  readonly isPartialYear: boolean;
  readonly totalIncome: number;
  readonly totalExpenses: number;
  readonly savingsRate: number;
  readonly netCashFlow: number;
  readonly netWorthChange: number;
  readonly topCategories: readonly { categoryName: string; amount: number; transactionCount: number }[];
  readonly biggestChanges: readonly { categoryName: string; amountChange: number; percentChange: number }[];
  readonly highlights: readonly string[];
  readonly cautions: readonly string[];
  readonly csvRows: readonly Record<string, string | number>[];
}

export type AnomalyModule =
  | 'category-spend'
  | 'merchant-spike'
  | 'missing-income'
  | 'duplicates'
  | 'net-worth';

export type AnomalyStatus = 'needs-review' | 'expected' | 'ignored';

export interface ReportAnomaly {
  readonly id: string;
  readonly module: AnomalyModule;
  readonly title: string;
  readonly baseline: number;
  readonly observed: number;
  readonly variance: number;
  readonly explanation: string;
  readonly transactionIds: readonly SyncId[];
  readonly accountIds: readonly SyncId[];
  readonly status: AnomalyStatus;
}

function monthKey(date: LocalDate): string {
  return date.slice(0, 7);
}

function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const d = new Date(year, monthNumber - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthName(monthIndex: number): string {
  return new Date(2024, monthIndex - 1, 1).toLocaleString('en-US', { month: 'long' });
}

function endOfMonth(month: string): LocalDate {
  const [year, monthNumber] = month.split('-').map(Number);
  const end = new Date(year, monthNumber, 0);
  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
}

export function generateMonthKeys(periodMonths: number, referenceDate = new Date()): string[] {
  const end = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;
  return Array.from({ length: periodMonths }, (_, index) => addMonths(end, index - periodMonths + 1));
}

function categoryNameFor(categoriesById: ReadonlyMap<string, Category>, categoryId: string | null): string {
  return categoryId ? (categoriesById.get(categoryId)?.name ?? 'Unknown') : 'Uncategorized';
}

function accountNameFor(accountsById: ReadonlyMap<string, Account>, accountId: string): string {
  return accountsById.get(accountId)?.name ?? 'Unknown account';
}

export function filterTransactionsForReport(
  transactions: readonly Transaction[],
  filters: ReportDataFilters,
): Transaction[] {
  const categoryIds = new Set(filters.categoryIds ?? []);
  const accountIds = new Set(filters.accountIds ?? []);

  return transactions.filter((tx) => {
    if (filters.startDate && tx.date < filters.startDate) return false;
    if (filters.endDate && tx.date > filters.endDate) return false;
    if (categoryIds.size > 0 && (!tx.categoryId || !categoryIds.has(tx.categoryId))) return false;
    if (accountIds.size > 0 && !accountIds.has(tx.accountId)) return false;
    return true;
  });
}

export function buildCategoryDrillDown(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  accounts: readonly Account[],
  filters: ReportDataFilters & { readonly categoryId: SyncId | null },
): CategoryDrillDown {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const filtered = filterTransactionsForReport(transactions, filters).filter((tx) => {
    if (filters.categoryId === null) return tx.categoryId === null;
    return tx.categoryId === filters.categoryId;
  });

  const rows = filtered
    .map((tx): DrillDownTransactionRow => ({
      id: tx.id,
      date: tx.date,
      payee: tx.payee ?? tx.counterpartyName ?? 'Unknown payee',
      accountName: accountNameFor(accountsById, tx.accountId),
      amount: tx.type === 'EXPENSE' ? Math.abs(tx.amount.amount) : tx.amount.amount,
      tags: tx.tags,
      note: tx.note ?? tx.extraNotes ?? '',
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const largestTransaction = rows.reduce<DrillDownTransactionRow | null>(
    (largest, row) => (!largest || row.amount > largest.amount ? row : largest),
    null,
  );

  return {
    categoryId: filters.categoryId,
    categoryName: categoryNameFor(categoriesById, filters.categoryId),
    total,
    transactionCount: rows.length,
    averageTransaction: rows.length > 0 ? Math.round(total / rows.length) : 0,
    largestTransaction,
    transactions: rows,
  };
}

function spendingByMonthAndCategory(
  transactions: readonly Transaction[],
): Map<string, Map<string | null, { amount: number; transactionIds: string[] }>> {
  const result = new Map<string, Map<string | null, { amount: number; transactionIds: string[] }>>();
  for (const tx of transactions) {
    if (tx.type !== 'EXPENSE') continue;
    const month = monthKey(tx.date);
    const byCategory = result.get(month) ?? new Map<string | null, { amount: number; transactionIds: string[] }>();
    const current = byCategory.get(tx.categoryId) ?? { amount: 0, transactionIds: [] };
    current.amount += Math.abs(tx.amount.amount);
    current.transactionIds.push(tx.id);
    byCategory.set(tx.categoryId, current);
    result.set(month, byCategory);
  }
  return result;
}

export function buildSpendingTrendInsight(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  periodMonths: 6 | 12 | 24,
  referenceDate = new Date(),
): SpendingTrendInsight {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const months = generateMonthKeys(periodMonths, referenceDate);
  const startDate = `${months[0]}-01`;
  const endDate = endOfMonth(months[months.length - 1]);
  const scoped = filterTransactionsForReport(transactions, { startDate, endDate });
  const byMonthCategory = spendingByMonthAndCategory(scoped);
  const monthsWithSpend = Array.from(byMonthCategory.values()).filter((byCategory) =>
    Array.from(byCategory.values()).some((entry) => entry.amount > 0),
  ).length;

  const monthlyTotals = months.map((month): MonthlySpendingPoint => {
    const byCategory = byMonthCategory.get(month) ?? new Map<string | null, { amount: number; transactionIds: string[] }>();
    const entries = Array.from(byCategory.entries()).sort((a, b) => b[1].amount - a[1].amount);
    return {
      month,
      total: entries.reduce((sum, [, entry]) => sum + entry.amount, 0),
      topCategories: entries.slice(0, 3).map(([categoryId, entry]) => ({
        categoryName: categoryNameFor(categoriesById, categoryId),
        amount: entry.amount,
      })),
    };
  });

  const categoryTotalsByCalendarMonth = new Map<string | null, Map<number, number[]>>();
  for (const [month, byCategory] of byMonthCategory.entries()) {
    const calendarMonth = Number(month.slice(5, 7));
    for (const [categoryId, entry] of byCategory.entries()) {
      const byCalendarMonth = categoryTotalsByCalendarMonth.get(categoryId) ?? new Map<number, number[]>();
      byCalendarMonth.set(calendarMonth, [...(byCalendarMonth.get(calendarMonth) ?? []), entry.amount]);
      categoryTotalsByCalendarMonth.set(categoryId, byCalendarMonth);
    }
  }

  const currentMonthNumber = referenceDate.getMonth() + 1;
  const seasonality: SeasonalitySignal[] = [];
  for (const [categoryId, byCalendarMonth] of categoryTotalsByCalendarMonth.entries()) {
    const allAmounts = months.map((month) => byMonthCategory.get(month)?.get(categoryId)?.amount ?? 0);
    if (allAmounts.filter((amount) => amount > 0).length < 2) continue;
    const normalMonthlyAverage = Math.round(allAmounts.reduce((sum, amount) => sum + amount, 0) / allAmounts.length);
    for (const [calendarMonth, amounts] of byCalendarMonth.entries()) {
      if (amounts.length < 2) continue;
      const averageAmount = Math.round(amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length);
      if (normalMonthlyAverage > 0 && averageAmount >= normalMonthlyAverage * 1.4) {
        const monthsUntil = (calendarMonth - currentMonthNumber + 12) % 12;
        seasonality.push({
          categoryName: categoryNameFor(categoriesById, categoryId),
          monthName: monthName(calendarMonth),
          averageAmount,
          normalMonthlyAverage,
          upcomingWindow: monthsUntil === 0 ? 'this month' : `in ${monthsUntil} month${monthsUntil === 1 ? '' : 's'}`,
          summary: `${categoryNameFor(categoriesById, categoryId)} usually spikes in ${monthName(calendarMonth)} (${monthsUntil === 0 ? 'this month' : `about ${monthsUntil} month${monthsUntil === 1 ? '' : 's'} away`}).`,
        });
      }
    }
  }

  const currentMonth = monthKey(`${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}-01`);
  const sameMonthHistorical = transactions.filter(
    (tx) => tx.type === 'EXPENSE' && tx.date.slice(5, 7) === currentMonth.slice(5, 7) && monthKey(tx.date) !== currentMonth,
  );
  const historicalYears = new Set(sameMonthHistorical.map((tx) => tx.date.slice(0, 4)));
  const historicalTotal = sameMonthHistorical.reduce((sum, tx) => sum + Math.abs(tx.amount.amount), 0);
  const historicalAverage = historicalYears.size > 0 ? Math.round(historicalTotal / historicalYears.size) : 0;
  const currentSpent = monthlyTotals.find((point) => point.month === currentMonth)?.total ?? 0;
  const daysElapsed = Math.max(1, referenceDate.getDate());
  const projectedSpend = Math.round((currentSpent / daysElapsed) * new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate());
  const pacingDirection: SpendingPacingInsight['direction'] =
    historicalAverage === 0
      ? 'insufficient-data'
      : projectedSpend > historicalAverage * 1.15
        ? 'above-normal'
        : 'normal';

  const pacing: SpendingPacingInsight = {
    currentMonth,
    spentSoFar: currentSpent,
    projectedSpend,
    historicalAverage,
    direction: pacingDirection,
    summary:
      pacingDirection === 'insufficient-data'
        ? 'Not enough same-month history to compare current pacing.'
        : pacingDirection === 'above-normal'
          ? `Current month pacing is above the historical same-month average.`
          : `Current month pacing is close to the historical same-month average.`,
  };

  const actionableCopy = [
    ...seasonality.slice(0, 3).map((signal) => `Plan ahead: ${signal.summary}`),
    ...(pacing.direction === 'above-normal'
      ? ['Review discretionary categories now; projected spending is above your same-month average.']
      : []),
  ];

  return {
    periodMonths,
    insufficientData: monthsWithSpend < Math.min(3, periodMonths),
    monthlyTotals,
    seasonality: seasonality.sort((a, b) => b.averageAmount - a.averageAmount).slice(0, 5),
    pacing,
    actionableCopy,
  };
}

export function buildYearInReview(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  year: number,
): AnnualSummary {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const yearPrefix = `${year}-`;
  const previousYearPrefix = `${year - 1}-`;
  const yearly = transactions.filter((tx) => tx.date.startsWith(yearPrefix));
  const previous = transactions.filter((tx) => tx.date.startsWith(previousYearPrefix));
  const sortedDates = yearly.map((tx) => tx.date).sort();
  const startDate = sortedDates[0] ?? `${year}-01-01`;
  const endDate = sortedDates[sortedDates.length - 1] ?? `${year}-12-31`;
  const months = new Set(yearly.map((tx) => monthKey(tx.date)));

  const totals = yearly.reduce(
    (acc, tx) => {
      if (tx.type === 'INCOME') acc.income += tx.amount.amount;
      if (tx.type === 'EXPENSE') acc.expenses += Math.abs(tx.amount.amount);
      return acc;
    },
    { income: 0, expenses: 0 },
  );
  const netCashFlow = totals.income - totals.expenses;
  const savingsRate = totals.income > 0 ? Math.round((netCashFlow / totals.income) * 100) : 0;

  const categoryTotals = new Map<string | null, { amount: number; count: number }>();
  for (const tx of yearly) {
    if (tx.type !== 'EXPENSE') continue;
    const current = categoryTotals.get(tx.categoryId) ?? { amount: 0, count: 0 };
    current.amount += Math.abs(tx.amount.amount);
    current.count += 1;
    categoryTotals.set(tx.categoryId, current);
  }

  const previousCategoryTotals = new Map<string | null, number>();
  for (const tx of previous) {
    if (tx.type !== 'EXPENSE') continue;
    previousCategoryTotals.set(tx.categoryId, (previousCategoryTotals.get(tx.categoryId) ?? 0) + Math.abs(tx.amount.amount));
  }

  const topCategories = Array.from(categoryTotals.entries())
    .map(([categoryId, data]) => ({
      categoryName: categoryNameFor(categoriesById, categoryId),
      amount: data.amount,
      transactionCount: data.count,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const biggestChanges = Array.from(categoryTotals.entries())
    .map(([categoryId, data]) => {
      const previousAmount = previousCategoryTotals.get(categoryId) ?? 0;
      const amountChange = data.amount - previousAmount;
      return {
        categoryName: categoryNameFor(categoriesById, categoryId),
        amountChange,
        percentChange: previousAmount > 0 ? Math.round((amountChange / previousAmount) * 100) : 100,
      };
    })
    .sort((a, b) => Math.abs(b.amountChange) - Math.abs(a.amountChange))
    .slice(0, 5);

  const highlights: string[] = [];
  const cautions: string[] = [];
  if (netCashFlow > 0) highlights.push('You finished the year cash-flow positive.');
  if (savingsRate >= 20) highlights.push(`Your savings rate reached ${savingsRate}%.`);
  if (netCashFlow < 0) cautions.push('Expenses exceeded income for the year.');
  const largestIncrease = biggestChanges.find((change) => change.amountChange > 0);
  if (largestIncrease) {
    cautions.push(`${largestIncrease.categoryName} increased the most year over year.`);
  }

  const csvRows = [
    { Metric: 'Total income', Amount: totals.income },
    { Metric: 'Total expenses', Amount: totals.expenses },
    { Metric: 'Net cash flow', Amount: netCashFlow },
    { Metric: 'Savings rate', Amount: `${savingsRate}%` },
    ...topCategories.map((category) => ({ Metric: `Top category: ${category.categoryName}`, Amount: category.amount })),
  ];

  return {
    year,
    startDate,
    endDate,
    monthCount: months.size,
    isPartialYear: months.size > 0 && months.size < 12,
    totalIncome: totals.income,
    totalExpenses: totals.expenses,
    savingsRate,
    netCashFlow,
    netWorthChange: netCashFlow,
    topCategories,
    biggestChanges,
    highlights,
    cautions,
    csvRows,
  };
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function anomalyId(module: AnomalyModule, key: string): string {
  return `${module}:${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

export function detectReportAnomalies(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  accounts: readonly Account[],
  modules: readonly AnomalyModule[],
  referenceDate = new Date(),
  statusById: Readonly<Record<string, AnomalyStatus>> = {},
): ReportAnomaly[] {
  const enabled = new Set(modules);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const currentMonth = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;
  const priorMonths = [addMonths(currentMonth, -1), addMonths(currentMonth, -2), addMonths(currentMonth, -3)];
  const anomalies: ReportAnomaly[] = [];
  const accountIds = accounts.map((account) => account.id);

  if (enabled.has('category-spend')) {
    const byMonth = spendingByMonthAndCategory(transactions);
    const current = byMonth.get(currentMonth) ?? new Map<string | null, { amount: number; transactionIds: string[] }>();
    for (const [categoryId, entry] of current.entries()) {
      const baseline = average(priorMonths.map((month) => byMonth.get(month)?.get(categoryId)?.amount ?? 0));
      if (baseline > 0 && entry.amount > baseline * 1.5 && entry.amount - baseline >= 5_000) {
        const id = anomalyId('category-spend', `${currentMonth}-${categoryNameFor(categoriesById, categoryId)}`);
        anomalies.push({
          id,
          module: 'category-spend',
          title: `${categoryNameFor(categoriesById, categoryId)} spend is unusually high`,
          baseline,
          observed: entry.amount,
          variance: entry.amount - baseline,
          explanation: `${categoryNameFor(categoriesById, categoryId)} is above its prior three-month average.`,
          transactionIds: entry.transactionIds,
          accountIds,
          status: statusById[id] ?? 'needs-review',
        });
      }
    }
  }

  if (enabled.has('merchant-spike')) {
    const byMerchantMonth = new Map<string, Map<string, { amount: number; ids: string[] }>>();
    for (const tx of transactions) {
      if (tx.type !== 'EXPENSE') continue;
      const merchant = tx.payee ?? tx.counterpartyName ?? 'Unknown payee';
      const byMonth = byMerchantMonth.get(merchant) ?? new Map<string, { amount: number; ids: string[] }>();
      const current = byMonth.get(monthKey(tx.date)) ?? { amount: 0, ids: [] };
      current.amount += Math.abs(tx.amount.amount);
      current.ids.push(tx.id);
      byMonth.set(monthKey(tx.date), current);
      byMerchantMonth.set(merchant, byMonth);
    }
    for (const [merchant, byMonth] of byMerchantMonth.entries()) {
      const current = byMonth.get(currentMonth);
      if (!current) continue;
      const baseline = average(priorMonths.map((month) => byMonth.get(month)?.amount ?? 0));
      if (baseline > 0 && current.amount > baseline * 1.75 && current.amount - baseline >= 3_000) {
        const id = anomalyId('merchant-spike', `${currentMonth}-${merchant}`);
        anomalies.push({
          id,
          module: 'merchant-spike',
          title: `${merchant} is above normal`,
          baseline,
          observed: current.amount,
          variance: current.amount - baseline,
          explanation: `${merchant} spending is much higher than its recent baseline.`,
          transactionIds: current.ids,
          accountIds,
          status: statusById[id] ?? 'needs-review',
        });
      }
    }
  }

  if (enabled.has('missing-income')) {
    const incomeBySourceMonth = new Map<string, Set<string>>();
    for (const tx of transactions) {
      if (tx.type !== 'INCOME') continue;
      const source = tx.payee ?? categoryNameFor(categoriesById, tx.categoryId) ?? 'Income';
      const months = incomeBySourceMonth.get(source) ?? new Set<string>();
      months.add(monthKey(tx.date));
      incomeBySourceMonth.set(source, months);
    }
    for (const [source, months] of incomeBySourceMonth.entries()) {
      if (priorMonths.every((month) => months.has(month)) && !months.has(currentMonth)) {
        const id = anomalyId('missing-income', `${currentMonth}-${source}`);
        anomalies.push({
          id,
          module: 'missing-income',
          title: `${source} income is missing`,
          baseline: 1,
          observed: 0,
          variance: -1,
          explanation: `${source} appeared in each of the prior three months but not this month.`,
          transactionIds: [],
          accountIds,
          status: statusById[id] ?? 'needs-review',
        });
      }
    }
  }

  if (enabled.has('duplicates')) {
    const duplicateGroups = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      const key = `${tx.date}|${tx.payee ?? tx.counterpartyName ?? ''}|${tx.amount.amount}|${tx.accountId}`;
      duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), tx]);
    }
    for (const [key, group] of duplicateGroups.entries()) {
      if (group.length < 2) continue;
      const id = anomalyId('duplicates', key);
      anomalies.push({
        id,
        module: 'duplicates',
        title: 'Possible duplicate transactions',
        baseline: 1,
        observed: group.length,
        variance: group.length - 1,
        explanation: `${group.length} transactions share the same date, payee, amount, and account.`,
        transactionIds: group.map((tx) => tx.id),
        accountIds: [...new Set(group.map((tx) => tx.accountId))],
        status: statusById[id] ?? 'needs-review',
      });
    }
  }

  if (enabled.has('net-worth')) {
    const monthlyNet = new Map<string, number>();
    for (const tx of transactions) {
      const signed = tx.type === 'INCOME' ? tx.amount.amount : tx.type === 'EXPENSE' ? -Math.abs(tx.amount.amount) : 0;
      monthlyNet.set(monthKey(tx.date), (monthlyNet.get(monthKey(tx.date)) ?? 0) + signed);
    }
    const observed = monthlyNet.get(currentMonth) ?? 0;
    const baseline = average(priorMonths.map((month) => monthlyNet.get(month) ?? 0));
    if (Math.abs(baseline) > 0 && Math.abs(observed - baseline) > Math.abs(baseline) * 1.5) {
      const id = anomalyId('net-worth', currentMonth);
      anomalies.push({
        id,
        module: 'net-worth',
        title: 'Unusual net-worth movement',
        baseline,
        observed,
        variance: observed - baseline,
        explanation: 'This month cash-flow movement differs materially from the recent baseline.',
        transactionIds: transactions.filter((tx) => monthKey(tx.date) === currentMonth).map((tx) => tx.id),
        accountIds,
        status: statusById[id] ?? 'needs-review',
      });
    }
  }

  return anomalies.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
}
