// SPDX-License-Identifier: BUSL-1.1

/**
 * Sample-data demo mode generator.
 *
 * Produces realistic but fictional local-only data that is explicitly tagged as
 * demo data so callers can block sync/export and safely reset it before real
 * setup starts.
 *
 * References: issue #2296
 */

export type DemoAccountKind = 'checking' | 'savings' | 'credit';
export type DemoBudgetKind = 'income' | 'fixed' | 'flexible' | 'savings';
export type DemoTransactionKind = 'income' | 'expense' | 'transfer';
export type DemoTrendDirection = 'up' | 'down' | 'flat';

export interface DemoMetadata {
  readonly isDemo: true;
  readonly demoSessionId: string;
  readonly generatedAt: string;
  readonly syncPolicy: 'local-only';
  readonly exportPolicy: 'exclude-by-default';
  readonly visibleWarning: string;
  readonly accessibleLabel: string;
}

export interface DemoAccount {
  readonly id: string;
  readonly name: string;
  readonly kind: DemoAccountKind;
  readonly balanceCents: number;
  readonly metadata: DemoMetadata;
}

export interface DemoBudgetCategory {
  readonly id: string;
  readonly name: string;
  readonly kind: DemoBudgetKind;
  readonly plannedCents: number;
  readonly spentCents: number;
  readonly metadata: DemoMetadata;
}

export interface DemoTransaction {
  readonly id: string;
  readonly accountId: string;
  readonly date: string;
  readonly description: string;
  readonly categoryId: string;
  readonly amountCents: number;
  readonly kind: DemoTransactionKind;
  readonly metadata: DemoMetadata;
}

export interface DemoGoal {
  readonly id: string;
  readonly name: string;
  readonly targetCents: number;
  readonly savedCents: number;
  readonly targetDate: string;
  readonly metadata: DemoMetadata;
}

export interface DemoTrendPoint {
  readonly month: string;
  readonly netCashFlowCents: number;
  readonly direction: DemoTrendDirection;
  readonly metadata: DemoMetadata;
}

export interface SampleDemoDataSet {
  readonly metadata: DemoMetadata;
  readonly accounts: readonly DemoAccount[];
  readonly budgets: readonly DemoBudgetCategory[];
  readonly transactions: readonly DemoTransaction[];
  readonly goals: readonly DemoGoal[];
  readonly trends: readonly DemoTrendPoint[];
}

export interface DemoDataOptions {
  readonly now?: Date;
  readonly sessionId?: string;
}

const DEMO_WARNING = 'Demo mode uses fictional sample data. It is not your real financial information.';

export function createSampleDemoData(options: DemoDataOptions = {}): SampleDemoDataSet {
  const now = options.now ?? new Date();
  const sessionId = sanitizeSessionId(options.sessionId ?? `demo-${toIsoDate(now)}`);
  const metadata = createDemoMetadata(sessionId, now);

  const accounts: DemoAccount[] = [
    {
      id: `${sessionId}-checking`,
      name: 'Demo Everyday Checking',
      kind: 'checking',
      balanceCents: 284_250,
      metadata,
    },
    {
      id: `${sessionId}-savings`,
      name: 'Demo Emergency Savings',
      kind: 'savings',
      balanceCents: 125_000,
      metadata,
    },
    {
      id: `${sessionId}-credit`,
      name: 'Demo Rewards Card',
      kind: 'credit',
      balanceCents: -42_670,
      metadata,
    },
  ];

  const budgets: DemoBudgetCategory[] = [
    buildBudget(sessionId, 'income', 'Paychecks', 'income', 360_000, 360_000, metadata),
    buildBudget(sessionId, 'rent', 'Rent', 'fixed', 125_000, 125_000, metadata),
    buildBudget(sessionId, 'utilities', 'Utilities', 'fixed', 24_000, 21_800, metadata),
    buildBudget(sessionId, 'groceries', 'Groceries', 'flexible', 42_000, 36_450, metadata),
    buildBudget(sessionId, 'fun', 'Fun money', 'flexible', 18_000, 12_400, metadata),
    buildBudget(sessionId, 'buffer', 'Emergency buffer', 'savings', 35_000, 35_000, metadata),
  ];

  const transactions: DemoTransaction[] = [
    buildTransaction(sessionId, accounts[0].id, now, -19, 'Demo paycheck', 'income', 180_000, 'income', metadata),
    buildTransaction(sessionId, accounts[0].id, now, -16, 'Demo rent payment', 'rent', -125_000, 'expense', metadata),
    buildTransaction(sessionId, accounts[0].id, now, -12, 'Demo grocery market', 'groceries', -8_640, 'expense', metadata),
    buildTransaction(sessionId, accounts[2].id, now, -9, 'Demo bus pass', 'utilities', -8_000, 'expense', metadata),
    buildTransaction(sessionId, accounts[0].id, now, -5, 'Demo paycheck', 'income', 180_000, 'income', metadata),
    buildTransaction(sessionId, accounts[0].id, now, -3, 'Demo transfer to savings', 'buffer', -35_000, 'transfer', metadata),
    buildTransaction(sessionId, accounts[1].id, now, -3, 'Demo transfer from checking', 'buffer', 35_000, 'transfer', metadata),
    buildTransaction(sessionId, accounts[2].id, now, -1, 'Demo movie night', 'fun', -4_200, 'expense', metadata),
  ];

  const goals: DemoGoal[] = [
    {
      id: `${sessionId}-goal-buffer`,
      name: 'Demo starter emergency buffer',
      targetCents: 300_000,
      savedCents: 125_000,
      targetDate: addMonths(now, 8),
      metadata,
    },
    {
      id: `${sessionId}-goal-trip`,
      name: 'Demo weekend trip',
      targetCents: 80_000,
      savedCents: 24_000,
      targetDate: addMonths(now, 5),
      metadata,
    },
  ];

  const trends: DemoTrendPoint[] = [-2, -1, 0].map((offset, index) => ({
    month: monthKey(addMonthsDate(now, offset)),
    netCashFlowCents: [28_000, 41_500, 52_300][index],
    direction: index === 0 ? 'flat' : 'up',
    metadata,
  }));

  return { metadata, accounts, budgets, transactions, goals, trends };
}

export function isDemoMetadata(value: unknown): value is DemoMetadata {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<DemoMetadata>).isDemo === true &&
    (value as Partial<DemoMetadata>).syncPolicy === 'local-only'
  );
}

export function isDemoRecord(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    isDemoMetadata((value as { metadata?: unknown }).metadata)
  );
}

export function filterDemoRecordsForExport<T>(records: readonly T[]): T[] {
  return records.filter((record) => !isDemoRecord(record));
}

export function getDemoResetSummary(dataSet: SampleDemoDataSet): string {
  const recordCount =
    dataSet.accounts.length + dataSet.budgets.length + dataSet.transactions.length + dataSet.goals.length;

  return `Resetting demo mode will delete ${recordCount} fictional records before real setup begins.`;
}

function createDemoMetadata(sessionId: string, now: Date): DemoMetadata {
  return {
    isDemo: true,
    demoSessionId: sessionId,
    generatedAt: now.toISOString(),
    syncPolicy: 'local-only',
    exportPolicy: 'exclude-by-default',
    visibleWarning: DEMO_WARNING,
    accessibleLabel: 'Fictional demo data. Not real financial information.',
  };
}

function buildBudget(
  sessionId: string,
  id: string,
  name: string,
  kind: DemoBudgetKind,
  plannedCents: number,
  spentCents: number,
  metadata: DemoMetadata,
): DemoBudgetCategory {
  return {
    id: `${sessionId}-budget-${id}`,
    name,
    kind,
    plannedCents,
    spentCents,
    metadata,
  };
}

function buildTransaction(
  sessionId: string,
  accountId: string,
  now: Date,
  dayOffset: number,
  description: string,
  categoryId: string,
  amountCents: number,
  kind: DemoTransactionKind,
  metadata: DemoMetadata,
): DemoTransaction {
  return {
    id: `${sessionId}-txn-${Math.abs(dayOffset)}-${categoryId}`,
    accountId,
    date: addDays(now, dayOffset),
    description,
    categoryId: `${sessionId}-budget-${categoryId}`,
    amountCents,
    kind,
    metadata,
  };
}

function sanitizeSessionId(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  return cleaned.replace(/^-|-$/g, '') || 'demo-session';
}

function addDays(date: Date, days: number): string {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return toIsoDate(next);
}

function addMonths(date: Date, months: number): string {
  return toIsoDate(addMonthsDate(date, months));
}

function addMonthsDate(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function monthKey(date: Date): string {
  return toIsoDate(date).slice(0, 7);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
