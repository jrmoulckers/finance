// SPDX-License-Identifier: BUSL-1.1

export interface RecurringTransactionInput {
  readonly id: string;
  readonly date: string;
  readonly amountCents: number;
  readonly merchant: string;
  readonly accountId?: string;
  readonly categoryId?: string;
  readonly type?: 'EXPENSE' | 'INCOME' | 'TRANSFER';
}

export type RecurrenceCadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
export type RecurrenceKind = 'bill' | 'subscription' | 'paycheck' | 'transfer' | 'other';

export interface RecurringCandidate {
  readonly id: string;
  readonly merchant: string;
  readonly accountId?: string;
  readonly categoryId?: string;
  readonly cadence: RecurrenceCadence;
  readonly kind: RecurrenceKind;
  readonly confidence: number;
  readonly nextExpectedDate: string;
  readonly sampleTransactionIds: readonly string[];
  readonly averageAmountCents: number;
  readonly amountVarianceRatio: number;
  readonly explanation: string;
}

export interface RecurringDetectionOptions {
  readonly minOccurrences?: number;
  readonly existingRecurringKeys?: readonly string[];
}

const CADENCES: readonly {
  readonly cadence: RecurrenceCadence;
  readonly days: number;
  readonly tolerance: number;
}[] = [
  { cadence: 'weekly', days: 7, tolerance: 2 },
  { cadence: 'biweekly', days: 14, tolerance: 3 },
  { cadence: 'monthly', days: 30, tolerance: 5 },
  { cadence: 'quarterly', days: 91, tolerance: 10 },
  { cadence: 'annual', days: 365, tolerance: 20 },
];

export function detectRecurringTransactions(
  transactions: readonly RecurringTransactionInput[],
  options: RecurringDetectionOptions = {},
): RecurringCandidate[] {
  const minOccurrences = options.minOccurrences ?? 3;
  const existingKeys = new Set(options.existingRecurringKeys ?? []);
  const groups = groupTransactions(transactions);
  const candidates: RecurringCandidate[] = [];

  for (const [key, group] of groups) {
    if (group.length < minOccurrences || existingKeys.has(key)) continue;
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const cadence = bestCadence(sorted);
    if (!cadence) continue;
    const averageAmountCents = Math.round(
      sorted.reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0) /
        sorted.length,
    );
    const variance = amountVarianceRatio(sorted, averageAmountCents);
    const categoryStability =
      mostCommon(sorted.map((transaction) => transaction.categoryId ?? ''))?.ratio ?? 0;
    const confidence = clamp(
      0.3 +
        cadence.fit * 0.32 +
        Math.max(0, 1 - variance) * 0.22 +
        categoryStability * 0.1 +
        Math.min(0.08, sorted.length * 0.015),
    );
    if (confidence < 0.62) continue;
    const lastDate = parseLocalDate(sorted[sorted.length - 1].date);
    const nextExpectedDate = formatLocalDate(addDays(lastDate, cadence.days));
    const merchant = normalizeMerchant(sorted[0].merchant);
    const kind = classifyRecurringKind(sorted, cadence.cadence);
    candidates.push({
      id: `recurring-${slug(key)}-${cadence.cadence}`,
      merchant,
      accountId: sorted[0].accountId,
      categoryId: sorted[0].categoryId,
      cadence: cadence.cadence,
      kind,
      confidence,
      nextExpectedDate,
      sampleTransactionIds: sorted.map((transaction) => transaction.id).slice(-5),
      averageAmountCents,
      amountVarianceRatio: variance,
      explanation: `${cadence.cadence} cadence with ${Math.round(cadence.fit * 100)}% date fit and ${Math.round(
        variance * 100,
      )}% amount variance`,
    });
  }

  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function groupTransactions(
  transactions: readonly RecurringTransactionInput[],
): Map<string, RecurringTransactionInput[]> {
  const groups = new Map<string, RecurringTransactionInput[]>();
  for (const transaction of transactions) {
    const merchant = normalizeMerchant(transaction.merchant);
    if (!merchant) continue;
    const sign = transaction.amountCents >= 0 ? 'credit' : 'debit';
    const key = `${merchant}|${transaction.accountId ?? ''}|${transaction.categoryId ?? ''}|${sign}`;
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }
  return groups;
}

function bestCadence(
  transactions: readonly RecurringTransactionInput[],
): { readonly cadence: RecurrenceCadence; readonly days: number; readonly fit: number } | null {
  const gaps = transactions
    .slice(1)
    .map((transaction, index) => Math.abs(daysBetween(transactions[index].date, transaction.date)));
  if (gaps.length < 2) return null;
  const scored = CADENCES.map((cadence) => {
    const matching = gaps.filter((gap) => Math.abs(gap - cadence.days) <= cadence.tolerance).length;
    return { ...cadence, fit: matching / gaps.length };
  }).sort((a, b) => b.fit - a.fit);
  return scored[0].fit >= 0.65 ? scored[0] : null;
}

function amountVarianceRatio(
  transactions: readonly RecurringTransactionInput[],
  average: number,
): number {
  if (average === 0) return 1;
  const maxDelta = Math.max(
    ...transactions.map((transaction) => Math.abs(Math.abs(transaction.amountCents) - average)),
  );
  return Number((maxDelta / average).toFixed(2));
}

function classifyRecurringKind(
  transactions: readonly RecurringTransactionInput[],
  cadence: RecurrenceCadence,
): RecurrenceKind {
  const text = transactions
    .map((transaction) => `${transaction.merchant} ${transaction.categoryId ?? ''}`)
    .join(' ')
    .toLowerCase();
  const hasCredit = transactions.every((transaction) => transaction.amountCents > 0);
  if (/payroll|paycheck|salary/.test(text) || (hasCredit && cadence === 'biweekly'))
    return 'paycheck';
  if (/transfer|xfer|savings|checking/.test(text)) return 'transfer';
  if (/netflix|spotify|hulu|subscription|prime|membership/.test(text)) return 'subscription';
  if (/rent|mortgage|utility|electric|water|internet|insurance|loan/.test(text)) return 'bill';
  return 'other';
}

function mostCommon(
  values: readonly string[],
): { readonly value: string; readonly ratio: number } | null {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? { value: best[0], ratio: best[1] / values.length } : null;
}

function normalizeMerchant(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 3)
    .join(' ');
}

function daysBetween(left: string, right: string): number {
  return Math.round((Date.parse(right) - Date.parse(left)) / 86_400_000);
}

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function slug(value: string): string {
  return value.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function clamp(value: number): number {
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}
