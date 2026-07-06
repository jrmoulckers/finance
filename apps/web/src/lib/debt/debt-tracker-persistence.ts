// SPDX-License-Identifier: BUSL-1.1

import type { Debt, DebtType } from '../debt-types';

/**
 * Persists the user's manually-entered debts and their per-debt overrides
 * (APR, original balance, minimum payment) so debt-payoff progress survives a
 * page reload. Without this the payoff planner silently forgets every edit the
 * moment the tab is refreshed. See issue #3357.
 */
export const DEBT_TRACKER_STORAGE_KEY = 'finance.debt.tracker.v1';

const DEBT_TYPES: ReadonlySet<string> = new Set<DebtType>([
  'credit_card',
  'student_loan',
  'auto_loan',
  'mortgage',
  'personal_loan',
  'bnpl',
  'medical',
  'other',
]);

export interface PersistedDebtTracker {
  readonly version: 1;
  readonly manualDebts: readonly Debt[];
  readonly debtAdjustments: Readonly<Record<string, Partial<Debt>>>;
}

export interface RestoredDebtTracker {
  readonly manualDebts: Debt[];
  readonly debtAdjustments: Record<string, Partial<Debt>>;
}

export interface DebtTrackerStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isDebtType(value: unknown): value is DebtType {
  return typeof value === 'string' && DEBT_TYPES.has(value);
}

function isDebt(value: unknown): value is Debt {
  if (!value || typeof value !== 'object') return false;
  const debt = value as Partial<Debt>;
  return (
    typeof debt.id === 'string' &&
    typeof debt.name === 'string' &&
    typeof debt.balanceCents === 'number' &&
    typeof debt.annualRateBps === 'number' &&
    typeof debt.minimumPaymentCents === 'number' &&
    isDebtType(debt.type)
  );
}

/**
 * Copies only the recognised, correctly-typed override fields from a stored
 * value so corrupted storage cannot inject unexpected keys into app state.
 */
function sanitizeAdjustment(value: unknown): Partial<Debt> | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const numericFields: Array<keyof Debt> = [
    'balanceCents',
    'originalBalanceCents',
    'interestPaidToDateCents',
    'annualRateBps',
    'minimumPaymentCents',
  ];
  for (const field of numericFields) {
    if (typeof source[field] === 'number') result[field] = source[field];
  }
  if (typeof source.name === 'string') result.name = source.name;
  if (isDebtType(source.type)) result.type = source.type;
  if (typeof source.rateEstimated === 'boolean') result.rateEstimated = source.rateEstimated;
  if (typeof source.minimumEstimated === 'boolean') {
    result.minimumEstimated = source.minimumEstimated;
  }
  return result as Partial<Debt>;
}

function sanitizeAdjustments(value: unknown): Record<string, Partial<Debt>> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, Partial<Debt>> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    const adjustment = sanitizeAdjustment(raw);
    if (adjustment) result[id] = adjustment;
  }
  return result;
}

export function readDebtTracker(storage: DebtTrackerStorageLike): RestoredDebtTracker {
  const raw = storage.getItem(DEBT_TRACKER_STORAGE_KEY);
  if (!raw) return { manualDebts: [], debtAdjustments: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || (parsed as PersistedDebtTracker).version !== 1) {
      return { manualDebts: [], debtAdjustments: {} };
    }
    const tracker = parsed as PersistedDebtTracker;
    const manualDebts = Array.isArray(tracker.manualDebts)
      ? tracker.manualDebts.filter(isDebt)
      : [];
    return {
      manualDebts,
      debtAdjustments: sanitizeAdjustments(tracker.debtAdjustments),
    };
  } catch {
    return { manualDebts: [], debtAdjustments: {} };
  }
}

export function writeDebtTracker(
  storage: DebtTrackerStorageLike,
  tracker: {
    manualDebts: readonly Debt[];
    debtAdjustments: Readonly<Record<string, Partial<Debt>>>;
  },
): void {
  storage.setItem(
    DEBT_TRACKER_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      manualDebts: tracker.manualDebts,
      debtAdjustments: tracker.debtAdjustments,
    }),
  );
}
