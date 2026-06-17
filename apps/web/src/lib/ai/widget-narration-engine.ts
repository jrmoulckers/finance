// SPDX-License-Identifier: BUSL-1.1

export type WidgetAmountVisibility = 'visible' | 'masked';
export type WidgetLastUpdatedState = 'fresh' | 'stale' | 'offline' | 'missing-balances';
export type WidgetPredictionConfidence = 'low' | 'medium' | 'high';

export interface WidgetAccountBalanceInput {
  readonly accountId: string;
  readonly accountName: string;
  readonly balanceCents?: number;
  readonly includeInWidget?: boolean;
}

export interface WidgetTransactionInput {
  readonly id: string;
  readonly date: string;
  readonly amountCents: number;
  readonly type: 'EXPENSE' | 'INCOME';
}

export interface WidgetRecurringBillInput {
  readonly id: string;
  readonly label: string;
  readonly dueDate: string;
  readonly amountCents: number;
}

export interface WidgetPredictionInput {
  readonly asOfDate: string;
  readonly lastUpdatedAt?: string;
  readonly offline: boolean;
  readonly privacyMode: WidgetAmountVisibility;
  readonly accounts: readonly WidgetAccountBalanceInput[];
  readonly transactions: readonly WidgetTransactionInput[];
  readonly recurringBills: readonly WidgetRecurringBillInput[];
  readonly deeplinkTarget: string;
  readonly staleAfterMinutes?: number;
  readonly predictionHorizonDays?: number;
}

export interface WidgetSnapshot {
  readonly todaySpendCents: number | null;
  readonly predictedBalanceCents: number | null;
  readonly amountMasked: boolean;
  readonly lastUpdatedState: WidgetLastUpdatedState;
  readonly staleReason: string | null;
  readonly offlineReason: string | null;
  readonly deeplinkTarget: string;
  readonly confidence: WidgetPredictionConfidence;
  readonly narration: readonly string[];
}

function assertCents(value: number | undefined): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new Error('Widget amount inputs must be non-negative integer cents.');
  }
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function minutesBetween(startIso: string, endDate: string): number {
  return Math.floor((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(startIso).getTime()) / 60_000);
}

function determineLastUpdatedState(input: WidgetPredictionInput, hasMissingBalances: boolean): WidgetLastUpdatedState {
  if (input.offline) return 'offline';
  if (hasMissingBalances) return 'missing-balances';
  if (!input.lastUpdatedAt) return 'stale';
  const staleAfter = input.staleAfterMinutes ?? 120;
  return minutesBetween(input.lastUpdatedAt, input.asOfDate) > staleAfter ? 'stale' : 'fresh';
}

function confidenceFor(state: WidgetLastUpdatedState, billCount: number): WidgetPredictionConfidence {
  if (state === 'offline' || state === 'missing-balances') return 'low';
  if (state === 'stale' || billCount === 0) return 'medium';
  return 'high';
}

export function buildWidgetSnapshot(input: WidgetPredictionInput): WidgetSnapshot {
  for (const account of input.accounts) assertCents(account.balanceCents);
  for (const tx of input.transactions) assertCents(Math.abs(tx.amountCents));
  for (const bill of input.recurringBills) assertCents(bill.amountCents);

  const includedAccounts = input.accounts.filter((account) => account.includeInWidget !== false);
  const hasMissingBalances = includedAccounts.some((account) => account.balanceCents === undefined);
  const amountMasked = input.privacyMode === 'masked';
  const lastUpdatedState = determineLastUpdatedState(input, hasMissingBalances);
  const horizonEnd = addDays(input.asOfDate, input.predictionHorizonDays ?? 14);
  const todaySpendCents = input.transactions
    .filter((tx) => tx.date === input.asOfDate && tx.type === 'EXPENSE')
    .reduce((sum, tx) => sum + Math.abs(tx.amountCents), 0);
  const balanceCents = hasMissingBalances
    ? null
    : includedAccounts.reduce((sum, account) => sum + (account.balanceCents ?? 0), 0);
  const upcomingBillsCents = input.recurringBills
    .filter((bill) => bill.dueDate >= input.asOfDate && bill.dueDate <= horizonEnd)
    .reduce((sum, bill) => sum + bill.amountCents, 0);
  const futureIncomeCents = input.transactions
    .filter((tx) => tx.date > input.asOfDate && tx.date <= horizonEnd && tx.type === 'INCOME')
    .reduce((sum, tx) => sum + tx.amountCents, 0);
  const predictedBalanceCents = balanceCents === null ? null : balanceCents + futureIncomeCents - upcomingBillsCents;
  const staleReason =
    lastUpdatedState === 'stale'
      ? 'Widget data is older than the configured freshness window.'
      : lastUpdatedState === 'missing-balances'
        ? 'One or more included accounts are missing balances.'
        : null;
  const offlineReason = input.offline ? 'Device is offline; predictions use the last local snapshot.' : null;
  const confidence = confidenceFor(lastUpdatedState, input.recurringBills.length);
  const baseSnapshot = {
    todaySpendCents: amountMasked ? null : todaySpendCents,
    predictedBalanceCents: amountMasked ? null : predictedBalanceCents,
    amountMasked,
    lastUpdatedState,
    staleReason,
    offlineReason,
    deeplinkTarget: input.deeplinkTarget,
    confidence,
  };

  return { ...baseSnapshot, narration: narrateWidgetSnapshot(baseSnapshot) };
}

export function narrateWidgetSnapshot(
  snapshot: Omit<WidgetSnapshot, 'narration'>,
): readonly string[] {
  if (snapshot.amountMasked) {
    return ['Amounts are hidden for privacy.', `Prediction confidence is ${snapshot.confidence}.`];
  }
  const lines = [
    snapshot.todaySpendCents === null
      ? 'Today spending is unavailable.'
      : `Today spending is ${snapshot.todaySpendCents} cents.`,
    snapshot.predictedBalanceCents === null
      ? 'Predicted balance is unavailable.'
      : `Predicted balance is ${snapshot.predictedBalanceCents} cents.`,
    `Prediction confidence is ${snapshot.confidence}.`,
  ];
  if (snapshot.offlineReason) lines.push(snapshot.offlineReason);
  if (snapshot.staleReason) lines.push(snapshot.staleReason);
  return lines;
}
