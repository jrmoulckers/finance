// SPDX-License-Identifier: BUSL-1.1

/**
 * Types & constants for the FIRE (Financial Independence / Retire Early)
 * planning engine (see `fire.ts`).
 *
 * All monetary values are **integer cents**; all rates are **decimals**.
 * Returns are modelled as **real** (inflation-adjusted) — see `fire.ts` for the
 * full set of documented assumptions.
 *
 * References: issue #2114
 */

/** Inputs for `yearsToFI`. */
export interface YearsToFIInput {
  /** Currently invested assets, in integer cents. */
  readonly currentInvestedCents: number;
  /** Annual contribution to investments, in integer cents. */
  readonly annualContributionCents: number;
  /** Expected annual **real** (inflation-adjusted) return, as a decimal. */
  readonly realReturnRate: number;
  /** The FI target (annual spending ÷ SWR), in integer cents. */
  readonly fiNumberCents: number;
}

/** Result of `yearsToFI`. */
export interface YearsToFIResult {
  /** True when the FI number is reached within the search horizon. */
  readonly reachedFI: boolean;
  /** True when current assets already meet/exceed the FI number. */
  readonly alreadyFI: boolean;
  /** Whole months until FI (0 when already FI; capped when unreachable). */
  readonly totalMonths: number;
  /** Whole years portion of {@link totalMonths}. */
  readonly years: number;
  /** Remaining months portion (0–11) of {@link totalMonths}. */
  readonly months: number;
  /** Projected portfolio value at the point of reaching FI (or at the cap). */
  readonly projectedCents: number;
}

/** Inputs for `coastFINumber`. */
export interface CoastFIInput {
  /** Annual spending in retirement, in integer cents. */
  readonly annualSpendingCents: number;
  /** Safe withdrawal rate, as a decimal (e.g. 0.04). */
  readonly swrRate: number;
  /** Expected annual **real** return, as a decimal. */
  readonly realReturnRate: number;
  /** Years from now until traditional retirement (when the FI number is needed). */
  readonly yearsToTraditionalRetirement: number;
}

/** Inputs for `buildFIProjection`. */
export interface FIProjectionInput {
  /** Currently invested assets, in integer cents. */
  readonly currentInvestedCents: number;
  /** Annual contribution to investments, in integer cents. */
  readonly annualContributionCents: number;
  /** Expected annual **real** return, as a decimal. */
  readonly realReturnRate: number;
  /** The FI target, in integer cents. */
  readonly fiNumberCents: number;
  /** Maximum number of years to project (defaults to {@link DEFAULT_DISPLAY_HORIZON_YEARS}). */
  readonly maxYears?: number;
  /** Extra years to keep projecting after FI is reached (for chart context). */
  readonly bufferYears?: number;
}

/** A single year in a FIRE projection series, suitable for charting. */
export interface FIProjectionPoint {
  /** Whole-year offset from today (0 === now). */
  readonly year: number;
  /** Projected portfolio value at the end of this year, in integer cents. */
  readonly balanceCents: number;
  /** Cumulative contributions made since today, in integer cents. */
  readonly contributionsToDateCents: number;
  /** Cumulative investment growth since today, in integer cents. */
  readonly growthToDateCents: number;
  /** The (constant) FI target, in integer cents, for drawing a target line. */
  readonly fiNumberCents: number;
  /** True once the balance meets/exceeds the FI number. */
  readonly reachedFI: boolean;
}

/** Inputs for the high-level `calculateFIREPlan` orchestrator. */
export interface FIREPlanInput {
  /** Currently invested assets, in integer cents. */
  readonly currentInvestedCents: number;
  /** Annual spending in retirement (today's dollars), in integer cents. */
  readonly annualSpendingCents: number;
  /** Annual contribution to investments, in integer cents. */
  readonly annualContributionCents: number;
  /** Expected annual **real** return, as a decimal. */
  readonly realReturnRate: number;
  /** Safe withdrawal rate, as a decimal. */
  readonly swrRate: number;
  /** Current age in whole years (optional; enables Coast-FI age math). */
  readonly currentAge?: number | null;
  /** Traditional retirement age (defaults to {@link DEFAULT_RETIREMENT_AGE}). */
  readonly traditionalRetirementAge?: number;
  /**
   * Explicit years-to-traditional-retirement override. Used when {@link currentAge}
   * is not supplied. Defaults to {@link DEFAULT_YEARS_TO_RETIREMENT}.
   */
  readonly yearsToTraditionalRetirement?: number;
  /** Injectable "today" for deterministic date math (defaults to `new Date()`). */
  readonly now?: Date;
}

/** A single row of the safe-withdrawal-rate sensitivity table. */
export interface SwrSensitivityRow {
  /** The safe withdrawal rate this row was computed at, as a decimal. */
  readonly swrRate: number;
  /** The FI number (annual spending ÷ SWR) at this rate, in integer cents. */
  readonly fiNumberCents: number;
  /** Years/months-to-FI detail at this rate. */
  readonly yearsToFI: YearsToFIResult;
}

/** Full FIRE plan result returned by `calculateFIREPlan`. */
export interface FIREPlanResult {
  /** Annual spending ÷ SWR, in integer cents. */
  readonly fiNumberCents: number;
  /** Echoed safe withdrawal rate. */
  readonly swrRate: number;
  /** Years/months-to-FI detail. */
  readonly yearsToFI: YearsToFIResult;
  /**
   * Progress toward the FI number as a percentage (`current ÷ FI × 100`),
   * clamped to `[0, 100]`. `100` when already FI; `0` when the FI number is
   * unreachable (non-positive SWR).
   */
  readonly fiProgressPercent: number;
  /**
   * Annual passive income the current portfolio already generates at the SWR
   * (`currentInvested × SWR`), in integer cents.
   */
  readonly currentPassiveIncomeCents: number;
  /**
   * Share of annual spending the current portfolio already covers at the SWR
   * (`currentPassiveIncome ÷ annualSpending × 100`). `0` when spending is
   * non-positive (not meaningful).
   */
  readonly incomeReplacementPercent: number;
  /** Calendar date (YYYY-MM-DD) FI is projected to be reached, or null. */
  readonly fiDateIso: string | null;
  /** Lump sum needed today to "coast" to the FI number, in integer cents. */
  readonly coastFINumberCents: number;
  /** True when current assets already meet the Coast-FI number. */
  readonly isCoastFI: boolean;
  /** Years from now until traditional retirement used for the Coast-FI math. */
  readonly yearsToTraditionalRetirement: number;
  /** Year-by-year projection series for charting. */
  readonly projection: readonly FIProjectionPoint[];
  /** Total contributions expected by the time FI is reached, in integer cents. */
  readonly totalContributionsToFICents: number;
  /** Total investment growth expected by the time FI is reached, in integer cents. */
  readonly totalGrowthToFICents: number;
}

/** Default safe withdrawal rate (the "4% rule", Trinity Study). */
export const DEFAULT_SWR = 0.04;

/** Default expected annual real return (≈ historical equity-heavy portfolio). */
export const DEFAULT_REAL_RETURN = 0.05;

/** Default expected annual nominal return (before inflation). */
export const DEFAULT_NOMINAL_RETURN = 0.08;

/** Default expected annual inflation rate, as a decimal. */
export const DEFAULT_INFLATION = 0.03;

/**
 * Safe-withdrawal rates surfaced by the SWR sensitivity table: a cautious
 * 3.5% (sequence-of-returns hedge), the classic 4% rule, and a more
 * aggressive 4.5%.
 */
export const DEFAULT_SWR_SENSITIVITY_RATES: readonly number[] = [0.035, 0.04, 0.045];

/** Default traditional retirement age. */
export const DEFAULT_RETIREMENT_AGE = 65;

/** Default years-to-retirement when age is not provided. */
export const DEFAULT_YEARS_TO_RETIREMENT = 30;

/**
 * Hard cap on the FI search horizon. If FI is not reached within this many
 * years the plan reports it as unreachable rather than looping forever.
 */
export const MAX_FI_SEARCH_YEARS = 100;

/** Default number of years rendered in a projection chart. */
export const DEFAULT_DISPLAY_HORIZON_YEARS = 50;

/** Default buffer years kept in the projection after FI is reached. */
export const DEFAULT_PROJECTION_BUFFER_YEARS = 3;
