// SPDX-License-Identifier: BUSL-1.1

/**
 * Grocery mode — a fast, glanceable "can I afford this?" / "safe to spend
 * before payday" engine for the dashboard.
 *
 * The goal is a supportive, low-stress answer to an everyday question while
 * standing in a checkout line: how much can I comfortably spend right now
 * without putting the bills that are due before my next paycheck at risk?
 *
 * ── What it computes ───────────────────────────────────────────────────────
 *   • availableBeforePayday = currentAvailableFunds
 *                             − upcoming critical bills due before payday
 *                             − optionally reserved amounts (e.g. savings)
 *   • pinnedCategoryRemaining = pinned category budget − spent (clamped ≥ 0)
 *   • dailyAllowance = availableBeforePayday ÷ days until payday (banker's round)
 *   • affordability = whether a hypothetical purchase fits inside the
 *     safe-to-spend amount, plus what would be left afterwards.
 *
 * ── Money & date conventions ───────────────────────────────────────────────
 *   • All monetary values are **integer minor units** (cents). Never floats.
 *   • Sums/differences of integer cents stay integers — no rounding needed.
 *   • The only division (the per-day allowance) is rounded back to integer
 *     cents with **banker's rounding** (round-half-to-even).
 *   • Dates are ISO `YYYY-MM-DD` calendar strings, compared lexically and
 *     parsed as UTC midnight so day-count math is timezone-stable.
 *   • `availableFunds` is **signed** (an overdrawn account can legitimately be
 *     negative); every other input is normalised to a non-negative integer so
 *     missing/garbage upstream data can never inflate the answer.
 *
 * Pure & side-effect free: every function is deterministic given its inputs.
 *
 * References: issue #2199
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A bill that may fall due before the next payday. */
export interface UpcomingBillInput {
  /** Stable identifier (used for React keys and de-duplication). */
  readonly id: string;
  /** Human-readable name, e.g. "Rent" or "Electric". */
  readonly name: string;
  /** Amount due in integer cents. */
  readonly amountCents: number;
  /** Due date as an ISO `YYYY-MM-DD` calendar string. */
  readonly dueDate: string;
  /** Whether this is a committed obligation that must be protected. */
  readonly critical: boolean;
  /** Whether the bill has already been paid (and so no longer reserved). */
  readonly paid: boolean;
}

/** The high-frequency category a user has pinned (e.g. Groceries). */
export interface PinnedCategoryInput {
  readonly categoryId: string;
  readonly name: string;
  /** Budgeted amount for the current period, in integer cents. */
  readonly budgetCents: number;
  /** Amount already spent in the current period, in integer cents. */
  readonly spentCents: number;
}

/** Inputs for {@link computeSafeToSpend}. */
export interface SafeToSpendInput {
  /** Current spendable balance (signed) in integer cents. */
  readonly availableFundsCents: number;
  /** Optional amount already earmarked (e.g. savings goals) in cents. */
  readonly reservedCents?: number;
  /** All bills to consider; the engine filters by status, date and criticality. */
  readonly bills: readonly UpcomingBillInput[];
  /** Today's date as an ISO `YYYY-MM-DD` calendar string. */
  readonly today: string;
  /** The next payday as `YYYY-MM-DD`, or `null` when unknown. */
  readonly nextPayday: string | null;
  /** The pinned category, when one is selected. */
  readonly pinnedCategory?: PinnedCategoryInput | null;
}

/** A bill surfaced as upcoming context, sorted by due date. */
export interface UpcomingBillSummary {
  readonly id: string;
  readonly name: string;
  readonly amountCents: number;
  readonly dueDate: string;
}

/** The remaining budget for the pinned category. */
export interface PinnedCategoryResult {
  readonly categoryId: string;
  readonly name: string;
  readonly budgetCents: number;
  readonly spentCents: number;
  /** `budget − spent`, clamped to a non-negative integer. */
  readonly remainingCents: number;
}

/** Result of {@link computeSafeToSpend}. */
export interface SafeToSpendResult {
  /** Normalised available funds (signed) in cents. */
  readonly availableFundsCents: number;
  /** Sum of the upcoming critical bills counted, in cents. */
  readonly upcomingCriticalBillsCents: number;
  /** Reserved amount applied, in cents. */
  readonly reservedCents: number;
  /** The headline figure: what's safe to spend before payday (signed). */
  readonly safeToSpendCents: number;
  /** Whether a usable payday date was supplied. */
  readonly hasPayday: boolean;
  /** Whole days from today until payday, or `null` when unknown. */
  readonly daysUntilPayday: number | null;
  /** Per-day allowance until payday (banker's rounded), or `null`. */
  readonly dailyAllowanceCents: number | null;
  /** The critical bills counted, sorted by soonest due date first. */
  readonly upcomingBills: readonly UpcomingBillSummary[];
  /** The pinned category's remaining budget, or `null` when none is pinned. */
  readonly pinnedCategory: PinnedCategoryResult | null;
}

/** Result of {@link evaluateAffordability}. */
export interface AffordabilityResult {
  /** The (normalised, non-negative) purchase amount asked about, in cents. */
  readonly amountCents: number;
  /** Whether the purchase fits within the safe-to-spend amount. */
  readonly affordable: boolean;
  /** What would remain safe to spend afterwards (signed), in cents. */
  readonly remainingAfterCents: number;
  /** The shortfall when not affordable (≥ 0), in cents. */
  readonly shortfallCents: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Numeric & date helpers
// ---------------------------------------------------------------------------

/**
 * Banker's rounding (round half to even, IEEE-754 / `RoundingMode.HALF_EVEN`).
 *
 * Examples: `0.5 → 0`, `1.5 → 2`, `2.5 → 2`, `3.5 → 4`, `-2.5 → -2`.
 *
 * Non-finite input yields `0` so a stray `NaN`/`Infinity` can never surface as
 * a misleading amount.
 */
export function bankersRound(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const floored = Math.floor(value);
  const diff = value - floored;
  if (Math.abs(diff - 0.5) < Number.EPSILON) {
    return floored % 2 === 0 ? floored : floored + 1;
  }
  return Math.round(value);
}

/** Normalise to a signed integer number of cents (defends against NaN). */
function toSignedCents(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

/** Normalise to a non-negative integer number of cents. */
function toNonNegativeCents(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/** Parse an ISO `YYYY-MM-DD` string to a UTC epoch ms, or `NaN` when invalid. */
function parseIsoDate(value: string | null | undefined): number {
  if (typeof value !== 'string' || value.length < 10) return Number.NaN;
  return Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
}

/** Convert a UTC epoch ms back to an ISO `YYYY-MM-DD` calendar string. */
function toIsoDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/** Whole days between two ISO dates (`end − start`); `null` when either is invalid. */
function wholeDaysBetween(start: string, end: string): number | null {
  const startMs = parseIsoDate(start);
  const endMs = parseIsoDate(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.round((endMs - startMs) / MS_PER_DAY);
}

/** Median of a non-empty list of numbers. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Snap a raw interval to the nearest common pay cadence in days. */
function snapToCadence(intervalDays: number): number {
  const cadences = [7, 14, 15, 30];
  for (const cadence of cadences) {
    if (Math.abs(intervalDays - cadence) <= 2) return cadence;
  }
  return intervalDays;
}

// ---------------------------------------------------------------------------
// Payday estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the next payday from a history of income transaction dates.
 *
 * Uses the median gap between consecutive paychecks, snapped to a common
 * cadence (weekly / biweekly / semi-monthly / monthly), then projects forward
 * from the most recent paycheck until the date lands strictly after `today`.
 * With a single paycheck it assumes a monthly cadence. Returns `null` when no
 * usable income dates are supplied — callers should fall back to another
 * horizon (e.g. end of month) in that case.
 *
 * @param incomeDates - ISO `YYYY-MM-DD` dates of recent income transactions.
 * @param today - Today's date as an ISO `YYYY-MM-DD` string.
 * @returns The projected next payday as `YYYY-MM-DD`, or `null`.
 */
export function estimateNextPayday(incomeDates: readonly string[], today: string): string | null {
  const todayMs = parseIsoDate(today);
  if (!Number.isFinite(todayMs)) return null;

  const sorted = incomeDates
    .map(parseIsoDate)
    .filter((ms) => Number.isFinite(ms))
    .sort((left, right) => left - right);
  if (sorted.length === 0) return null;

  let intervalDays = 30;
  if (sorted.length >= 2) {
    const gaps = sorted
      .slice(1)
      .map((ms, index) => Math.round((ms - sorted[index]) / MS_PER_DAY))
      .filter((gap) => gap > 0);
    if (gaps.length > 0) intervalDays = snapToCadence(Math.round(median(gaps)));
  }

  const stepMs = Math.max(1, intervalDays) * MS_PER_DAY;
  let next = sorted[sorted.length - 1];
  for (let guard = 0; next <= todayMs && guard < 1000; guard += 1) {
    next += stepMs;
  }
  return toIsoDate(next);
}

// ---------------------------------------------------------------------------
// Pinned category
// ---------------------------------------------------------------------------

/**
 * Remaining budget for a pinned category: `budget − spent`, clamped ≥ 0.
 *
 * @param category - The pinned category, or `null`/`undefined` when none.
 * @returns A {@link PinnedCategoryResult}, or `null` when no category is pinned.
 */
export function pinnedCategoryRemaining(
  category: PinnedCategoryInput | null | undefined,
): PinnedCategoryResult | null {
  if (!category) return null;
  const budgetCents = toNonNegativeCents(category.budgetCents);
  const spentCents = toNonNegativeCents(category.spentCents);
  return {
    categoryId: category.categoryId,
    name: category.name,
    budgetCents,
    spentCents,
    remainingCents: Math.max(0, budgetCents - spentCents),
  };
}

// ---------------------------------------------------------------------------
// Money input parsing
// ---------------------------------------------------------------------------

/**
 * Parse a user-entered amount (e.g. `"45"`, `"45.50"`, `"$1,234.5"`) into
 * integer cents using **integer math** and **banker's rounding** on the
 * sub-cent digit, following the financial-modeling skill.
 *
 * Leading currency symbols, thousands separators and surrounding whitespace are
 * tolerated. Returns `null` for empty or malformed input (so the UI can stay
 * quiet until a valid number is typed) and rejects negative input, since the
 * affordability question is always about a non-negative purchase.
 *
 * @param input - The raw string from a text input.
 * @returns Integer cents, or `null` when the input is not a valid amount.
 */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, '');
  if (cleaned === '') return null;

  const match = cleaned.match(/^(\d*)(?:\.(\d*))?$/);
  if (!match || (!match[1] && !match[2])) return null;

  const whole = match[1] || '0';
  const fraction = match[2] ?? '';
  const baseCents =
    Number.parseInt(whole, 10) * 100 +
    Number.parseInt((fraction.slice(0, 2) || '0').padEnd(2, '0'), 10);
  const thirdDigit = Number.parseInt(fraction[2] ?? '0', 10);
  const hasRemainder = [...fraction.slice(3)].some((digit) => digit !== '0');
  const roundUp = thirdDigit > 5 || (thirdDigit === 5 && (hasRemainder || baseCents % 2 === 1));
  const cents = baseCents + (roundUp ? 1 : 0);

  return Number.isSafeInteger(cents) ? cents : null;
}

// ---------------------------------------------------------------------------
// Safe to spend
// ---------------------------------------------------------------------------

/**
 * Compute the safe-to-spend answer for grocery mode.
 *
 * Counts only bills that are **critical, unpaid, and due on/after today** and,
 * when a payday is known, **on/before that payday**. Without a payday it still
 * answers using every upcoming critical bill so the figure stays meaningful.
 *
 * @param input - {@link SafeToSpendInput}.
 * @returns {@link SafeToSpendResult}.
 */
export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const availableFundsCents = toSignedCents(input.availableFundsCents);
  const reservedCents = toNonNegativeCents(input.reservedCents ?? 0);

  const paydayMs = parseIsoDate(input.nextPayday);
  const hasPayday = Number.isFinite(paydayMs);
  const todayMs = parseIsoDate(input.today);
  const hasToday = Number.isFinite(todayMs);

  const counted = input.bills
    .filter((bill) => {
      if (!bill.critical || bill.paid) return false;
      const dueMs = parseIsoDate(bill.dueDate);
      if (!Number.isFinite(dueMs)) return false;
      if (hasToday && dueMs < todayMs) return false;
      if (hasPayday && dueMs > paydayMs) return false;
      return true;
    })
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));

  const upcomingCriticalBillsCents = counted.reduce(
    (sum, bill) => sum + toNonNegativeCents(bill.amountCents),
    0,
  );

  const safeToSpendCents = availableFundsCents - upcomingCriticalBillsCents - reservedCents;

  const daysUntilPayday =
    hasPayday && hasToday
      ? Math.max(0, wholeDaysBetween(input.today, input.nextPayday as string) ?? 0)
      : null;

  const dailyAllowanceCents =
    daysUntilPayday !== null && daysUntilPayday >= 1 && safeToSpendCents > 0
      ? bankersRound(safeToSpendCents / daysUntilPayday)
      : null;

  return {
    availableFundsCents,
    upcomingCriticalBillsCents,
    reservedCents,
    safeToSpendCents,
    hasPayday,
    daysUntilPayday,
    dailyAllowanceCents,
    upcomingBills: counted.map((bill) => ({
      id: bill.id,
      name: bill.name,
      amountCents: toNonNegativeCents(bill.amountCents),
      dueDate: bill.dueDate,
    })),
    pinnedCategory: pinnedCategoryRemaining(input.pinnedCategory),
  };
}

// ---------------------------------------------------------------------------
// Affordability
// ---------------------------------------------------------------------------

/**
 * Answer "can I afford this right now?" against a safe-to-spend amount.
 *
 * The purchase amount is normalised to a non-negative integer of cents. A
 * purchase is affordable when it fits within (≤) the safe-to-spend figure;
 * spending it exactly to zero still counts as affordable.
 *
 * @param safeToSpendCents - The headline safe-to-spend figure, in cents.
 * @param amountCents - The hypothetical purchase amount, in cents.
 * @returns {@link AffordabilityResult}.
 */
export function evaluateAffordability(
  safeToSpendCents: number,
  amountCents: number,
): AffordabilityResult {
  const amount = toNonNegativeCents(amountCents);
  const safe = toSignedCents(safeToSpendCents);
  const remainingAfterCents = safe - amount;
  return {
    amountCents: amount,
    affordable: remainingAfterCents >= 0,
    remainingAfterCents,
    shortfallCents: remainingAfterCents < 0 ? -remainingAfterCents : 0,
  };
}
