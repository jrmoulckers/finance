// SPDX-License-Identifier: BUSL-1.1

/**
 * FIRE (Financial Independence / Retire Early) planning engine.
 *
 * Pure, side-effect-free functions for modelling the journey to financial
 * independence: the FI number, years/months-to-FI, the Coast-FI number, and a
 * year-by-year projection series for charting.
 *
 * ── Money & rate conventions ───────────────────────────────────────────────
 *   • All monetary values are **integer cents** (e.g. 100_000_00 === $1,000,000).
 *   • All rates are **decimals** (e.g. 0.04 === 4%).
 *   • Floating-point is only used for *rate math* (compounding/discounting); the
 *     result is always rounded back to integer cents with banker's rounding
 *     (round-half-to-even) before being returned.
 *
 * ── Modelling assumptions (documented, standard FIRE formulas) ──────────────
 *   • Returns are **real** (inflation-adjusted). Because the FI number is
 *     derived from *today's* annual spending, expressing growth in real terms
 *     keeps the target and the projected balance in the same purchasing-power
 *     units — the convention used by the Trinity Study and Mr. Money Mustache's
 *     "The Shockingly Simple Math Behind Early Retirement".
 *   • Accumulation uses the standard **future value of an ordinary annuity**:
 *     each period the balance compounds and a contribution is added at period
 *     end. We iterate **monthly** (so we can report whole months) and convert
 *     the annual real return to a monthly rate **geometrically**
 *     (`(1 + r)^(1/12) − 1`) so that twelve monthly steps compound to exactly
 *     the annual return — avoiding the slight overstatement of a naive `r / 12`.
 *   • FI number  = annual spending ÷ SWR  (the inverse of the 4% rule).
 *   • Coast-FI   = FI number discounted back to today at the real return:
 *                  `FI / (1 + r)^yearsToRetirement`. It is the lump sum that, with
 *                  **no further contributions**, grows to the FI number by the
 *                  traditional retirement date.
 *
 * References: issue #2114
 */

import type {
  CoastFIInput,
  FIProjectionInput,
  FIProjectionPoint,
  FIREPlanInput,
  FIREPlanResult,
  SwrSensitivityRow,
  YearsToFIInput,
  YearsToFIResult,
} from './fire-types';

import {
  DEFAULT_DISPLAY_HORIZON_YEARS,
  DEFAULT_PROJECTION_BUFFER_YEARS,
  DEFAULT_RETIREMENT_AGE,
  DEFAULT_SWR_SENSITIVITY_RATES,
  DEFAULT_YEARS_TO_RETIREMENT,
  MAX_FI_SEARCH_YEARS,
} from './fire-types';

export * from './fire-types';

// ---------------------------------------------------------------------------
// Rounding & numeric helpers
// ---------------------------------------------------------------------------

/**
 * Banker's rounding (round half to even, IEEE-754 / `RoundingMode.HALF_EVEN`).
 *
 * Examples: `0.5 → 0`, `1.5 → 2`, `2.5 → 2`, `3.5 → 4`.
 *
 * Non-finite input (NaN / ±Infinity) yields `0` — callers that can produce an
 * unreachable (infinite) target guard for that case explicitly *before* calling
 * this, so a stray Infinity never silently collapses to a misleading $0.
 *
 * @param value - The number to round.
 * @returns The nearest integer, ties to even.
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

/** Clamp to a non-negative number (used to defend cents against bad input). */
function nonNegative(value: number): number {
  return value > 0 ? value : 0;
}

/**
 * Convert an annual rate to its equivalent monthly rate **geometrically**, so
 * that compounding twelve monthly steps reproduces the annual rate exactly.
 *
 * Guards the pathological case of a ≤ −100% annual return (a non-positive
 * growth base) by treating it as a total monthly loss.
 *
 * @param annualRate - Annual rate as a decimal (e.g. 0.05).
 * @returns The equivalent monthly rate as a decimal.
 */
export function monthlyRateFromAnnual(annualRate: number): number {
  if (annualRate <= -1) return -1;
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/**
 * Convert a **nominal** annual return and an **inflation** assumption into the
 * equivalent **real** (inflation-adjusted) return using the Fisher equation:
 * `(1 + nominal) / (1 + inflation) − 1`.
 *
 * FIRE savers typically reason in nominal terms (e.g. a 7% expected return) and
 * a separate inflation figure (e.g. 3%); the engine models growth in real terms
 * because the FI number derives from *today's* spending. This helper keeps the
 * two conventions consistent so users don't have to pre-compute the real rate by
 * hand. When `1 + inflation ≤ 0` (a pathological ≤ −100% inflation) the nominal
 * rate is returned unchanged rather than dividing by a non-positive base.
 *
 * @param nominalRate - Expected annual nominal return, as a decimal (e.g. 0.07).
 * @param inflationRate - Expected annual inflation, as a decimal (e.g. 0.03).
 * @returns The equivalent annual real return, as a decimal.
 */
export function realReturnFromNominal(nominalRate: number, inflationRate: number): number {
  const denominator = 1 + inflationRate;
  if (denominator <= 0) return nominalRate;
  return (1 + nominalRate) / denominator - 1;
}

// ---------------------------------------------------------------------------
// Date helpers (calendar-date math — FI date is a LocalDate, not a timestamp)
// ---------------------------------------------------------------------------

/**
 * Format a `Date` as a `YYYY-MM-DD` calendar date string using **local** date
 * components.
 *
 * The projected FI date is a wall-clock calendar date, not an instant, so it
 * must be built ({@link addMonths} uses local `setMonth`), serialized, and
 * parsed (`FirePlannerPage` parses `${iso}T00:00:00` as local) with a single
 * consistent local convention. Serializing with UTC (`toISOString`) here would
 * shift the displayed month by one near midnight in western timezones. See
 * issue #3310.
 */
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Add whole months to a date, returning a new `Date` (no mutation). */
function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

// ---------------------------------------------------------------------------
// FI number
// ---------------------------------------------------------------------------

/**
 * The FI number — the portfolio size at which the safe withdrawal rate covers
 * annual spending: `annualSpending ÷ SWR`.
 *
 * Edge cases:
 *   • `annualSpendingCents ≤ 0` → `0` (you need nothing if you spend nothing).
 *   • `swrRate ≤ 0` → `Number.POSITIVE_INFINITY` (an unreachable target — a
 *     non-positive withdrawal rate can never sustain any spending). Callers and
 *     the downstream functions treat an infinite target as "never reached".
 *
 * @param annualSpendingCents - Annual spending in integer cents.
 * @param swrRate - Safe withdrawal rate as a decimal (e.g. 0.04).
 * @returns The FI number in integer cents, or `Infinity` when unreachable.
 */
export function fiNumber(annualSpendingCents: number, swrRate: number): number {
  const spending = nonNegative(annualSpendingCents);
  if (spending === 0) return 0;
  if (swrRate <= 0) return Number.POSITIVE_INFINITY;
  return bankersRound(spending / swrRate);
}

// ---------------------------------------------------------------------------
// Years to FI
// ---------------------------------------------------------------------------

function notReached(projectedCents: number): YearsToFIResult {
  return {
    reachedFI: false,
    alreadyFI: false,
    totalMonths: MAX_FI_SEARCH_YEARS * 12,
    years: MAX_FI_SEARCH_YEARS,
    months: 0,
    projectedCents: bankersRound(projectedCents),
  };
}

/**
 * Years (and months) until the FI number is reached, via monthly future-value-
 * of-an-annuity iteration.
 *
 * The balance compounds at the geometric monthly rate and an evenly-split
 * monthly contribution (`annualContribution / 12`) is added at the end of each
 * month. Iteration stops the first month the balance meets/exceeds the FI
 * number, or after {@link MAX_FI_SEARCH_YEARS} (reported as unreachable).
 *
 * Edge cases:
 *   • Already FI (current ≥ target) → `{ reachedFI: true, alreadyFI: true, 0m }`.
 *   • Infinite/zero-growth target that can never be met (e.g. no contributions
 *     and a ≤ 0% return while below target) → `reachedFI: false`, capped.
 *   • Negative contributions (modelling drawdown) are permitted; if they prevent
 *     reaching the target the result is reported as unreachable.
 *
 * @param input - {@link YearsToFIInput}.
 * @returns {@link YearsToFIResult}.
 */
export function yearsToFI(input: YearsToFIInput): YearsToFIResult {
  const current = nonNegative(input.currentInvestedCents);
  const target = input.fiNumberCents;

  if (current >= target) {
    return {
      reachedFI: true,
      alreadyFI: true,
      totalMonths: 0,
      years: 0,
      months: 0,
      projectedCents: bankersRound(current),
    };
  }

  if (!Number.isFinite(target)) {
    return notReached(current);
  }

  const monthlyRate = monthlyRateFromAnnual(input.realReturnRate);
  const monthlyContribution = input.annualContributionCents / 12;
  const maxMonths = MAX_FI_SEARCH_YEARS * 12;

  let balance = current;
  for (let month = 1; month <= maxMonths; month += 1) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
    if (balance >= target) {
      return {
        reachedFI: true,
        alreadyFI: false,
        totalMonths: month,
        years: Math.floor(month / 12),
        months: month % 12,
        projectedCents: bankersRound(balance),
      };
    }
  }

  return notReached(balance);
}

// ---------------------------------------------------------------------------
// Coast FI
// ---------------------------------------------------------------------------

/**
 * The Coast-FI number — the lump sum needed **today** that, with no further
 * contributions, compounds to the FI number by the traditional retirement date:
 * `FI ÷ (1 + r)^yearsToRetirement`.
 *
 * Edge cases:
 *   • `yearsToTraditionalRetirement ≤ 0` → equals the FI number (no time to grow).
 *   • `realReturnRate === 0` → equals the FI number (no growth).
 *   • `realReturnRate < 0` → greater than the FI number (you need more today
 *     because the portfolio is expected to shrink in real terms).
 *   • Unreachable FI number (Infinity) → `Infinity`.
 *
 * @param input - {@link CoastFIInput}.
 * @returns The Coast-FI number in integer cents (or `Infinity`).
 */
export function coastFINumber(input: CoastFIInput): number {
  const fi = fiNumber(input.annualSpendingCents, input.swrRate);
  if (!Number.isFinite(fi)) return Number.POSITIVE_INFINITY;

  const years = nonNegative(input.yearsToTraditionalRetirement);
  if (years === 0) return fi;

  const growthFactor = Math.pow(1 + input.realReturnRate, years);
  if (!(growthFactor > 0)) return Number.POSITIVE_INFINITY;

  return bankersRound(fi / growthFactor);
}

/**
 * Whether current assets already meet/exceed the Coast-FI number — i.e. the
 * portfolio can "coast" to the FI number with no further contributions.
 *
 * @param currentInvestedCents - Current invested assets in integer cents.
 * @param coastFINumberCents - The Coast-FI number in integer cents.
 * @returns `true` when already Coast-FI.
 */
export function isCoastFI(currentInvestedCents: number, coastFINumberCents: number): boolean {
  if (!Number.isFinite(coastFINumberCents)) return false;
  return currentInvestedCents >= coastFINumberCents;
}

// ---------------------------------------------------------------------------
// Progress toward FI (#3320)
// ---------------------------------------------------------------------------

/**
 * Progress toward the FI number as a percentage (`current ÷ FI × 100`), clamped
 * to `[0, 100]`.
 *
 * Edge cases:
 *   • `fiNumberCents ≤ 0` → `100` (a zero target is already met).
 *   • `fiNumberCents` infinite (unreachable SWR) → `0`.
 *
 * @param currentInvestedCents - Current invested assets in integer cents.
 * @param fiNumberCents - The FI target in integer cents (or `Infinity`).
 * @returns Progress percentage in `[0, 100]`, rounded to one decimal place.
 */
export function fiProgressPercent(currentInvestedCents: number, fiNumberCents: number): number {
  const current = nonNegative(currentInvestedCents);
  if (!Number.isFinite(fiNumberCents)) return 0;
  if (fiNumberCents <= 0) return 100;
  const percent = (current / fiNumberCents) * 100;
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.round(clamped * 10) / 10;
}

/**
 * Annual passive income the current portfolio already generates at the safe
 * withdrawal rate: `currentInvested × SWR`.
 *
 * @param currentInvestedCents - Current invested assets in integer cents.
 * @param swrRate - Safe withdrawal rate as a decimal (e.g. 0.04).
 * @returns Annual passive income in integer cents (0 when SWR ≤ 0).
 */
export function currentPassiveIncomeCents(currentInvestedCents: number, swrRate: number): number {
  const current = nonNegative(currentInvestedCents);
  if (swrRate <= 0) return 0;
  return bankersRound(current * swrRate);
}

/**
 * Share of annual spending the current portfolio already covers at the SWR
 * (`currentPassiveIncome ÷ annualSpending × 100`).
 *
 * Edge cases:
 *   • `annualSpendingCents ≤ 0` → `0` (income replacement is not meaningful when
 *     there is nothing to replace).
 *
 * @param currentInvestedCents - Current invested assets in integer cents.
 * @param annualSpendingCents - Annual spending in integer cents.
 * @param swrRate - Safe withdrawal rate as a decimal.
 * @returns Income-replacement percentage (≥ 0), rounded to one decimal place.
 */
export function incomeReplacementPercent(
  currentInvestedCents: number,
  annualSpendingCents: number,
  swrRate: number,
): number {
  const spending = nonNegative(annualSpendingCents);
  if (spending === 0) return 0;
  const passive = currentPassiveIncomeCents(currentInvestedCents, swrRate);
  return Math.round(((passive / spending) * 100) * 10) / 10;
}

// ---------------------------------------------------------------------------
// SWR sensitivity (#3319)
// ---------------------------------------------------------------------------

/**
 * Compute how sensitive the FI number and time-to-FI are to the safe-withdrawal
 * rate, across a set of rates (defaults to 3.5% / 4% / 4.5%).
 *
 * For each rate this recomputes the FI number (annual spending ÷ SWR) and the
 * years/months-to-FI from the same current assets, contributions, and real
 * return — letting a FIRE saver weigh a cautious 3.5% against a more aggressive
 * 4.5%. Rows are returned in ascending SWR order.
 *
 * @param input - Current assets, contributions, real return, and annual spending.
 * @param swrRates - Rates to evaluate (defaults to {@link DEFAULT_SWR_SENSITIVITY_RATES}).
 * @returns One {@link SwrSensitivityRow} per rate, ascending by SWR.
 */
export function computeSwrSensitivity(
  input: {
    readonly currentInvestedCents: number;
    readonly annualSpendingCents: number;
    readonly annualContributionCents: number;
    readonly realReturnRate: number;
  },
  swrRates: readonly number[] = DEFAULT_SWR_SENSITIVITY_RATES,
): SwrSensitivityRow[] {
  return [...swrRates]
    .sort((a, b) => a - b)
    .map((swrRate) => {
      const fiCents = fiNumber(input.annualSpendingCents, swrRate);
      return {
        swrRate,
        fiNumberCents: fiCents,
        yearsToFI: yearsToFI({
          currentInvestedCents: input.currentInvestedCents,
          annualContributionCents: input.annualContributionCents,
          realReturnRate: input.realReturnRate,
          fiNumberCents: fiCents,
        }),
      };
    });
}

// ---------------------------------------------------------------------------
// Year-by-year projection (for charting)
// ---------------------------------------------------------------------------

/**
 * Build a year-by-year projection of the portfolio against the FI target.
 *
 * Internally steps **monthly** (consistent with {@link yearsToFI}) and snapshots
 * the balance at each year boundary. The series always starts at year 0 (today)
 * and runs until either `maxYears`, or `bufferYears` past the year FI is reached.
 *
 * Each point exposes the running split of cumulative contributions vs investment
 * growth so the chart can render a meaningful, non-colour-only breakdown.
 *
 * @param input - {@link FIProjectionInput}.
 * @returns An array of {@link FIProjectionPoint}, one per whole year.
 */
export function buildFIProjection(input: FIProjectionInput): FIProjectionPoint[] {
  const current = nonNegative(input.currentInvestedCents);
  const target = input.fiNumberCents;
  const targetIsFinite = Number.isFinite(target);

  const monthlyRate = monthlyRateFromAnnual(input.realReturnRate);
  const monthlyContribution = input.annualContributionCents / 12;
  const maxYears = Math.max(1, Math.floor(input.maxYears ?? DEFAULT_DISPLAY_HORIZON_YEARS));
  const bufferYears = Math.max(0, Math.floor(input.bufferYears ?? DEFAULT_PROJECTION_BUFFER_YEARS));

  const currentCents = bankersRound(current);
  const points: FIProjectionPoint[] = [];

  let balance = current;
  let contributions = 0;

  const pushPoint = (year: number): void => {
    const balanceCents = bankersRound(balance);
    const contributionsToDateCents = bankersRound(contributions);
    points.push({
      year,
      balanceCents,
      contributionsToDateCents,
      growthToDateCents: balanceCents - currentCents - contributionsToDateCents,
      fiNumberCents: targetIsFinite ? target : 0,
      reachedFI: targetIsFinite && balance >= target,
    });
  };

  pushPoint(0);

  let reachedYear: number | null = targetIsFinite && current >= target ? 0 : null;

  for (let year = 1; year <= maxYears; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      balance = balance * (1 + monthlyRate) + monthlyContribution;
      contributions += monthlyContribution;
    }
    pushPoint(year);

    if (reachedYear === null && targetIsFinite && balance >= target) {
      reachedYear = year;
    }
    if (reachedYear !== null && year >= reachedYear + bufferYears) {
      break;
    }
  }

  return points;
}

// ---------------------------------------------------------------------------
// High-level orchestrator
// ---------------------------------------------------------------------------

/**
 * Resolve how many years separate "now" from traditional retirement.
 * Prefers age math when an age is supplied, then an explicit override, then a
 * sensible default.
 */
function resolveYearsToRetirement(input: FIREPlanInput): number {
  if (input.currentAge != null && Number.isFinite(input.currentAge)) {
    const retirementAge = input.traditionalRetirementAge ?? DEFAULT_RETIREMENT_AGE;
    return nonNegative(retirementAge - input.currentAge);
  }
  if (input.yearsToTraditionalRetirement != null) {
    return nonNegative(input.yearsToTraditionalRetirement);
  }
  return DEFAULT_YEARS_TO_RETIREMENT;
}

/**
 * Compute a complete FIRE plan: FI number, years/months-to-FI, projected FI
 * date, Coast-FI number and status, and a year-by-year projection series.
 *
 * This ties together the individual pure functions for convenience; each piece
 * is also exported independently for fine-grained use and testing.
 *
 * @param input - {@link FIREPlanInput}.
 * @returns {@link FIREPlanResult}.
 */
export function calculateFIREPlan(input: FIREPlanInput): FIREPlanResult {
  const now = input.now ?? new Date();
  const fiCents = fiNumber(input.annualSpendingCents, input.swrRate);

  const ytf = yearsToFI({
    currentInvestedCents: input.currentInvestedCents,
    annualContributionCents: input.annualContributionCents,
    realReturnRate: input.realReturnRate,
    fiNumberCents: fiCents,
  });

  const yearsToTraditionalRetirement = resolveYearsToRetirement(input);
  const coastCents = coastFINumber({
    annualSpendingCents: input.annualSpendingCents,
    swrRate: input.swrRate,
    realReturnRate: input.realReturnRate,
    yearsToTraditionalRetirement,
  });

  // Extend the chart horizon to (at least) the year FI is actually reached so
  // the portfolio/FI crossover is visible and consistent with the headline.
  // `yearsToFI` searches up to MAX_FI_SEARCH_YEARS (100) while the projection
  // defaults to DEFAULT_DISPLAY_HORIZON_YEARS (50); without this the chart and
  // the "time to FI" headline disagree for 50 < years-to-FI <= 100. See #3286.
  const projectionMaxYears = ytf.reachedFI
    ? Math.min(MAX_FI_SEARCH_YEARS, ytf.years + DEFAULT_PROJECTION_BUFFER_YEARS)
    : DEFAULT_DISPLAY_HORIZON_YEARS;

  const projection = buildFIProjection({
    currentInvestedCents: input.currentInvestedCents,
    annualContributionCents: input.annualContributionCents,
    realReturnRate: input.realReturnRate,
    fiNumberCents: fiCents,
    maxYears: projectionMaxYears,
  });

  const fiDateIso = ytf.reachedFI ? toIsoDate(addMonths(now, ytf.totalMonths)) : null;

  const totalContributionsToFICents = bankersRound(
    (input.annualContributionCents / 12) * ytf.totalMonths,
  );
  const totalGrowthToFICents =
    ytf.projectedCents - nonNegative(input.currentInvestedCents) - totalContributionsToFICents;

  return {
    fiNumberCents: fiCents,
    swrRate: input.swrRate,
    yearsToFI: ytf,
    fiProgressPercent: fiProgressPercent(input.currentInvestedCents, fiCents),
    currentPassiveIncomeCents: currentPassiveIncomeCents(input.currentInvestedCents, input.swrRate),
    incomeReplacementPercent: incomeReplacementPercent(
      input.currentInvestedCents,
      input.annualSpendingCents,
      input.swrRate,
    ),
    fiDateIso,
    coastFINumberCents: coastCents,
    isCoastFI: isCoastFI(nonNegative(input.currentInvestedCents), coastCents),
    yearsToTraditionalRetirement,
    projection,
    totalContributionsToFICents,
    totalGrowthToFICents,
  };
}
