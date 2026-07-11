// SPDX-License-Identifier: BUSL-1.1

/**
 * Fixed-income budgeting: essentials vs discretionary rollup (issue #3297).
 *
 * Budgets are per-category spend caps. Someone living on a fixed pension plus
 * Social Security needs a different view: how much of that fixed monthly income
 * is committed to *essentials* (housing, medications, utilities, groceries)
 * versus *discretionary*, and whether essentials stay within income.
 *
 * This module is a pure, local UI grouping — it does not change the persisted
 * budget schema. Each budget is tagged essential/discretionary client-side and
 * rolled up against a user-entered fixed monthly income. Amounts are integer
 * cents throughout (see the web money-as-cents convention).
 */

export type BudgetClass = 'essential' | 'discretionary';

/** Default share of income above which committed essentials trigger a warning. */
export const DEFAULT_ESSENTIAL_THRESHOLD_PERCENT = 70;

/** Minimal budget shape needed for the rollup. */
export interface ClassifiableBudget {
  readonly id: string;
  /** Budgeted amount for the period, in cents. */
  readonly amountCents: number;
}

export interface EssentialsBudgetInput {
  readonly budgets: readonly ClassifiableBudget[];
  /** Per-budget classification; budgets absent from the map use `defaultClass`. */
  readonly classification: Readonly<Record<string, BudgetClass>>;
  /** Fixed monthly income anchor, in cents (0 when not provided). */
  readonly monthlyIncomeCents: number;
  /** Warning threshold as a percent of income (defaults to 70%). */
  readonly essentialThresholdPercent?: number;
  /** How to treat budgets not present in the classification map. */
  readonly defaultClass?: BudgetClass;
}

export interface EssentialsBudgetSummary {
  readonly essentialCents: number;
  readonly discretionaryCents: number;
  readonly totalBudgetedCents: number;
  readonly monthlyIncomeCents: number;
  /** Income left after essentials are committed (income − essentials). */
  readonly discretionaryRemainderCents: number;
  /** Essentials as a percent of income (0 when no income is set). */
  readonly essentialSharePercent: number;
  readonly essentialThresholdPercent: number;
  /** True when essentials exceed the configured share of income. */
  readonly overThreshold: boolean;
  /** True when a positive fixed income has been provided. */
  readonly hasIncome: boolean;
  /** True when committed essentials exceed income outright. */
  readonly essentialsExceedIncome: boolean;
  readonly essentialCount: number;
  readonly discretionaryCount: number;
}

/** Resolve a budget's class, falling back to `defaultClass`. */
export function classifyBudget(
  classification: Readonly<Record<string, BudgetClass>>,
  budgetId: string,
  defaultClass: BudgetClass = 'discretionary',
): BudgetClass {
  return classification[budgetId] ?? defaultClass;
}

/**
 * Roll a set of classified budgets up against a fixed monthly income.
 *
 * `discretionaryRemainderCents` is income minus committed essentials — the room
 * left for everything discretionary. `overThreshold` fires when essentials
 * exceed `essentialThresholdPercent` of income.
 */
export function summarizeEssentialsBudget(input: EssentialsBudgetInput): EssentialsBudgetSummary {
  const {
    budgets,
    classification,
    monthlyIncomeCents,
    essentialThresholdPercent = DEFAULT_ESSENTIAL_THRESHOLD_PERCENT,
    defaultClass = 'discretionary',
  } = input;

  const income = Math.max(0, Math.round(monthlyIncomeCents));
  const threshold = Math.min(100, Math.max(0, essentialThresholdPercent));

  let essentialCents = 0;
  let discretionaryCents = 0;
  let essentialCount = 0;
  let discretionaryCount = 0;

  for (const budget of budgets) {
    const amount = Math.max(0, Math.round(budget.amountCents));
    if (classifyBudget(classification, budget.id, defaultClass) === 'essential') {
      essentialCents += amount;
      essentialCount += 1;
    } else {
      discretionaryCents += amount;
      discretionaryCount += 1;
    }
  }

  const hasIncome = income > 0;
  const essentialSharePercent = hasIncome ? Math.round((essentialCents / income) * 1000) / 10 : 0;

  return {
    essentialCents,
    discretionaryCents,
    totalBudgetedCents: essentialCents + discretionaryCents,
    monthlyIncomeCents: income,
    discretionaryRemainderCents: income - essentialCents,
    essentialSharePercent,
    essentialThresholdPercent: threshold,
    overThreshold: hasIncome && essentialCents > (income * threshold) / 100,
    hasIncome,
    essentialsExceedIncome: hasIncome && essentialCents > income,
    essentialCount,
    discretionaryCount,
  };
}

// ---------------------------------------------------------------------------
// Local persistence (client-side UI preference; no schema/sync change).
// ---------------------------------------------------------------------------

const STORAGE_KEY_CLASSIFICATION = 'finance-budget-essentials-class-v1';
const STORAGE_KEY_INCOME = 'finance-budget-fixed-income-cents-v1';
const STORAGE_KEY_THRESHOLD = 'finance-budget-essentials-threshold-v1';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadBudgetClassification(): Record<string, BudgetClass> {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY_CLASSIFICATION);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, BudgetClass> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === 'essential' || value === 'discretionary') result[id] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveBudgetClassification(
  classification: Readonly<Record<string, BudgetClass>>,
): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY_CLASSIFICATION, JSON.stringify(classification));
  } catch {
    // Best-effort; classification is a convenience preference.
  }
}

export function loadFixedIncomeCents(): number {
  const storage = getStorage();
  if (!storage) return 0;
  try {
    const raw = storage.getItem(STORAGE_KEY_INCOME);
    const value = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function saveFixedIncomeCents(cents: number): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY_INCOME, String(Math.max(0, Math.round(cents))));
  } catch {
    // Best-effort.
  }
}

export function loadEssentialThresholdPercent(): number {
  const storage = getStorage();
  if (!storage) return DEFAULT_ESSENTIAL_THRESHOLD_PERCENT;
  try {
    const raw = storage.getItem(STORAGE_KEY_THRESHOLD);
    const value = raw === null ? NaN : Number.parseInt(raw, 10);
    return Number.isFinite(value)
      ? Math.min(100, Math.max(0, value))
      : DEFAULT_ESSENTIAL_THRESHOLD_PERCENT;
  } catch {
    return DEFAULT_ESSENTIAL_THRESHOLD_PERCENT;
  }
}

export function saveEssentialThresholdPercent(percent: number): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY_THRESHOLD, String(Math.min(100, Math.max(0, Math.round(percent)))));
  } catch {
    // Best-effort.
  }
}
