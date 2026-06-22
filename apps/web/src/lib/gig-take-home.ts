// SPDX-License-Identifier: BUSL-1.1

/**
 * Gig-driver take-home pay calculator.
 *
 * Estimates the practical "money in pocket after taxes" for a self-employed
 * gig driver (rideshare / delivery) by combining:
 *
 *   - gross payouts (fares, deliveries, tips),
 *   - vehicle operating costs (gas, maintenance, repairs, ...),
 *   - a tax-deduction basis (IRS standard mileage OR actual vehicle expenses),
 *   - manual business deductions (phone allocation, supplies, ...),
 *   - an estimated self-employment (SE) tax, and
 *   - a configurable income-tax reserve.
 *
 * It also aggregates profitability at the day / week / shift level so a driver
 * can see what a shift actually earns after costs and tax set-asides.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * IMPORTANT — this is an ESTIMATE, not tax advice. The income-tax reserve rate
 * is a deliberately configurable default (see {@link DEFAULT_INCOME_TAX_RESERVE_RATE})
 * because the true rate depends on filing status, other income, state, and
 * deductions that this module does not model. SE tax is computed precisely via
 * the shared {@link calculateSETax} engine (15.3% on 92.35% of net SE earnings,
 * capped at the Social Security wage base).
 * ──────────────────────────────────────────────────────────────────────────
 *
 * All monetary values are integer cents (never floats). Miles and hours are
 * non-monetary quantities and may be fractional.
 *
 * References: issues #2135, #2139; IRC §1401, §6017.
 */

import { calculateSETax } from './tax/self-employment-tax';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default income-tax reserve rate applied to taxable gig profit (after the
 * deductible half of SE tax).
 *
 * This is a configurable estimate — NOT a statutory rate. ~15% is a common
 * rough set-aside for a moderate-income sole proprietor blending federal and
 * state income tax on Schedule C profit. Always allow the user to override it.
 */
export const DEFAULT_INCOME_TAX_RESERVE_RATE = 0.15;

/**
 * Minimum net SE earnings (the 92.35% taxable base) below which no SE tax is
 * owed for the tax year (IRC §6017, the "$400 rule"), expressed in cents.
 *
 * This is an ANNUAL threshold. For per-shift "set aside as you go" estimates,
 * disable the floor via {@link GigTakeHomeConfig.applySelfEmploymentFloor}.
 */
export const SE_TAX_MIN_NET_EARNINGS_CENTS = 400_00;

/** Which expenses form the tax-deduction basis for net SE earnings. */
export type DeductionMethod = 'standard-mileage' | 'actual-expenses';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GigTakeHomeConfig {
  /** Income-tax reserve rate as a decimal (0.15 = 15%). Default {@link DEFAULT_INCOME_TAX_RESERVE_RATE}. */
  readonly incomeTaxReserveRate?: number;
  /** Tax-deduction basis to use. Default `'standard-mileage'`. */
  readonly deductionMethod?: DeductionMethod;
  /** Whether to apply self-employment tax at all. Default `true`. */
  readonly applySelfEmploymentTax?: boolean;
  /**
   * Whether to apply the annual $400 SE-tax floor. Default `true` (annual
   * semantics). Set `false` for per-shift set-aside estimates where the driver
   * will clearly exceed $400 across the year.
   */
  readonly applySelfEmploymentFloor?: boolean;
}

export interface GigTakeHomeInput {
  /** Gross gig payouts including tips (cents). Negative inputs are clamped to 0. */
  readonly grossPayoutsCents: number;
  /** Actual vehicle operating cash costs in the period (cents). */
  readonly operatingCostsCents?: number;
  /** IRS standard-mileage deduction for the period (cents). */
  readonly mileageDeductionCents?: number;
  /** Other manual business deductions: phone allocation, supplies, etc. (cents). */
  readonly otherDeductionsCents?: number;
  /** Calculation configuration. */
  readonly config?: GigTakeHomeConfig;
}

export interface GigTakeHomeResult {
  /** Gross payouts used (cents, clamped ≥ 0). */
  readonly grossPayoutsCents: number;
  /** Actual operating costs used (cents). */
  readonly operatingCostsCents: number;
  /** Other deductions used (cents). */
  readonly otherDeductionsCents: number;
  /** Deduction method applied. */
  readonly deductionMethod: DeductionMethod;
  /** Expenses used as the tax-deduction basis (cents). */
  readonly taxDeductibleExpensesCents: number;
  /** Actual cash kept before taxes: gross − operating − other (cents, may be negative). */
  readonly netCashProfitCents: number;
  /** Net Schedule-C SE earnings used for tax: gross − deductible expenses, floored at 0 (cents). */
  readonly netSelfEmploymentEarningsCents: number;
  /** Estimated self-employment tax (cents). */
  readonly selfEmploymentTaxCents: number;
  /** Deductible half of the SE tax that reduces the income-tax base (cents). */
  readonly selfEmploymentTaxDeductionCents: number;
  /** Income-tax base: net SE earnings − half of SE tax, floored at 0 (cents). */
  readonly incomeTaxBaseCents: number;
  /** Income-tax reserve rate applied (decimal). */
  readonly incomeTaxReserveRate: number;
  /** Estimated income-tax reserve (cents). */
  readonly incomeTaxReserveCents: number;
  /** Total recommended tax set-aside: SE tax + income-tax reserve (cents). */
  readonly totalTaxSetAsideCents: number;
  /** Estimated take-home: net cash profit − total tax set-aside (cents, may be negative). */
  readonly estimatedTakeHomeCents: number;
  /** Effective tax set-aside rate on gross payouts (decimal; 0 when gross is 0). */
  readonly effectiveTaxRate: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a value to an integer cent amount ≥ 0. */
function clampCents(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

/** Normalize a reserve rate to a finite decimal in [0, 1]. */
function normalizeRate(rate: number | undefined): number {
  if (rate === undefined || !Number.isFinite(rate)) {
    return DEFAULT_INCOME_TAX_RESERVE_RATE;
  }
  return Math.min(1, Math.max(0, rate));
}

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * Compute estimated take-home pay for a set of gig earnings and costs.
 *
 * @example
 * ```ts
 * computeGigTakeHome({
 *   grossPayoutsCents: 5_000_000,      // $50,000 gross
 *   operatingCostsCents: 800_000,      // $8,000 actual vehicle cash costs
 *   mileageDeductionCents: 1_000_000,  // $10,000 standard mileage deduction
 *   otherDeductionsCents: 100_000,     // $1,000 phone/supplies
 *   config: { incomeTaxReserveRate: 0.15 },
 * });
 * ```
 */
export function computeGigTakeHome(input: GigTakeHomeInput): GigTakeHomeResult {
  const config = input.config ?? {};
  const grossPayoutsCents = clampCents(input.grossPayoutsCents);
  const operatingCostsCents = clampCents(input.operatingCostsCents);
  const mileageDeductionCents = clampCents(input.mileageDeductionCents);
  const otherDeductionsCents = clampCents(input.otherDeductionsCents);

  const deductionMethod: DeductionMethod = config.deductionMethod ?? 'standard-mileage';
  const applySelfEmploymentTax = config.applySelfEmploymentTax ?? true;
  const applySelfEmploymentFloor = config.applySelfEmploymentFloor ?? true;
  const incomeTaxReserveRate = normalizeRate(config.incomeTaxReserveRate);

  // Actual cash kept before tax (real money out of pocket). May be negative on
  // a high-expense / low-earning shift — that is a genuine loss, not an error.
  const netCashProfitCents = grossPayoutsCents - operatingCostsCents - otherDeductionsCents;

  // Tax basis: a driver deducts EITHER standard mileage OR actual vehicle
  // expenses (never both), plus other business deductions.
  const vehicleDeductionCents =
    deductionMethod === 'standard-mileage' ? mileageDeductionCents : operatingCostsCents;
  const taxDeductibleExpensesCents = vehicleDeductionCents + otherDeductionsCents;

  // Net Schedule-C profit cannot be negative for SE-tax purposes here.
  const netSelfEmploymentEarningsCents = Math.max(
    0,
    grossPayoutsCents - taxDeductibleExpensesCents,
  );

  const seResult = calculateSETax(netSelfEmploymentEarningsCents);
  const seFloorMet =
    !applySelfEmploymentFloor || seResult.taxableBase >= SE_TAX_MIN_NET_EARNINGS_CENTS;
  const selfEmploymentTaxCents = applySelfEmploymentTax && seFloorMet ? seResult.seTax : 0;
  const selfEmploymentTaxDeductionCents = selfEmploymentTaxCents > 0 ? seResult.seDeduction : 0;

  // Income tax is estimated on net SE earnings reduced by the deductible half
  // of SE tax (an AGI adjustment), then floored at 0.
  const incomeTaxBaseCents = Math.max(
    0,
    netSelfEmploymentEarningsCents - selfEmploymentTaxDeductionCents,
  );
  const incomeTaxReserveCents = Math.round(incomeTaxBaseCents * incomeTaxReserveRate);

  const totalTaxSetAsideCents = selfEmploymentTaxCents + incomeTaxReserveCents;
  const estimatedTakeHomeCents = netCashProfitCents - totalTaxSetAsideCents;
  const effectiveTaxRate = grossPayoutsCents > 0 ? totalTaxSetAsideCents / grossPayoutsCents : 0;

  return {
    grossPayoutsCents,
    operatingCostsCents,
    otherDeductionsCents,
    deductionMethod,
    taxDeductibleExpensesCents,
    netCashProfitCents,
    netSelfEmploymentEarningsCents,
    selfEmploymentTaxCents,
    selfEmploymentTaxDeductionCents,
    incomeTaxBaseCents,
    incomeTaxReserveRate,
    incomeTaxReserveCents,
    totalTaxSetAsideCents,
    estimatedTakeHomeCents,
    effectiveTaxRate,
  };
}

// ---------------------------------------------------------------------------
// Day / week / shift profitability aggregation
// ---------------------------------------------------------------------------

/** A single logged gig shift / session. */
export interface ShiftRecord {
  readonly id: string;
  /** Calendar date (YYYY-MM-DD). */
  readonly date: string;
  readonly grossCents: number;
  readonly operatingCostsCents?: number;
  readonly mileageDeductionCents?: number;
  readonly otherDeductionsCents?: number;
  /** Miles driven during the shift (non-monetary, may be fractional). */
  readonly miles?: number;
  /** Active (on-the-clock) hours during the shift. */
  readonly activeHours?: number;
}

export type ProfitabilityGranularity = 'shift' | 'day' | 'week';

export interface ProfitabilityPeriod {
  /** Bucket key (shift id, `YYYY-MM-DD` day, or week-start `YYYY-MM-DD`). */
  readonly key: string;
  /** Human-readable label. */
  readonly label: string;
  readonly granularity: ProfitabilityGranularity;
  readonly shiftCount: number;
  readonly grossCents: number;
  readonly operatingCostsCents: number;
  readonly netCashProfitCents: number;
  readonly totalTaxSetAsideCents: number;
  readonly estimatedTakeHomeCents: number;
  readonly miles: number;
  readonly activeHours: number;
  /** Estimated take-home per mile (cents); null when miles is 0. */
  readonly takeHomePerMileCents: number | null;
  /** Estimated take-home per active hour (cents); null when hours is 0. */
  readonly takeHomePerHourCents: number | null;
}

/** Compute the Monday-based ISO week-start date key for a `YYYY-MM-DD` string. */
export function weekStartKey(date: string): string {
  const dt = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) {
    return date;
  }
  const day = dt.getUTCDay(); // 0 = Sunday … 6 = Saturday
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + offsetToMonday);
  return dt.toISOString().slice(0, 10);
}

function bucketKeyFor(shift: ShiftRecord, granularity: ProfitabilityGranularity): string {
  if (granularity === 'shift') {
    return shift.id;
  }
  if (granularity === 'week') {
    return weekStartKey(shift.date);
  }
  return shift.date;
}

function bucketLabelFor(key: string, granularity: ProfitabilityGranularity): string {
  if (granularity === 'week') {
    return `Week of ${key}`;
  }
  return key;
}

interface ShiftTotals {
  grossCents: number;
  operatingCostsCents: number;
  mileageDeductionCents: number;
  otherDeductionsCents: number;
  miles: number;
  activeHours: number;
  shiftCount: number;
}

function emptyTotals(): ShiftTotals {
  return {
    grossCents: 0,
    operatingCostsCents: 0,
    mileageDeductionCents: 0,
    otherDeductionsCents: 0,
    miles: 0,
    activeHours: 0,
    shiftCount: 0,
  };
}

function clampMiles(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

/**
 * Aggregate shift profitability into day / week / shift buckets.
 *
 * Taxes are estimated per bucket on that bucket's net earnings. The annual SE
 * floor/cap are approximations at sub-annual granularity — pass
 * `config.applySelfEmploymentFloor = false` for realistic per-shift set-asides.
 *
 * @returns Buckets sorted ascending by key.
 */
export function aggregateProfitability(
  shifts: readonly ShiftRecord[],
  granularity: ProfitabilityGranularity,
  config?: GigTakeHomeConfig,
): ProfitabilityPeriod[] {
  const buckets = new Map<string, ShiftTotals>();

  for (const shift of shifts) {
    const key = bucketKeyFor(shift, granularity);
    const totals = buckets.get(key) ?? emptyTotals();
    totals.grossCents += clampCents(shift.grossCents);
    totals.operatingCostsCents += clampCents(shift.operatingCostsCents);
    totals.mileageDeductionCents += clampCents(shift.mileageDeductionCents);
    totals.otherDeductionsCents += clampCents(shift.otherDeductionsCents);
    totals.miles += clampMiles(shift.miles);
    totals.activeHours += clampMiles(shift.activeHours);
    totals.shiftCount += 1;
    buckets.set(key, totals);
  }

  return [...buckets.entries()]
    .map(([key, totals]) => {
      const result = computeGigTakeHome({
        grossPayoutsCents: totals.grossCents,
        operatingCostsCents: totals.operatingCostsCents,
        mileageDeductionCents: totals.mileageDeductionCents,
        otherDeductionsCents: totals.otherDeductionsCents,
        config,
      });

      const miles = Math.round(totals.miles * 10) / 10;
      const activeHours = Math.round(totals.activeHours * 100) / 100;

      return {
        key,
        label: bucketLabelFor(key, granularity),
        granularity,
        shiftCount: totals.shiftCount,
        grossCents: result.grossPayoutsCents,
        operatingCostsCents: result.operatingCostsCents,
        netCashProfitCents: result.netCashProfitCents,
        totalTaxSetAsideCents: result.totalTaxSetAsideCents,
        estimatedTakeHomeCents: result.estimatedTakeHomeCents,
        miles,
        activeHours,
        takeHomePerMileCents: miles > 0 ? Math.round(result.estimatedTakeHomeCents / miles) : null,
        takeHomePerHourCents:
          activeHours > 0 ? Math.round(result.estimatedTakeHomeCents / activeHours) : null,
      } satisfies ProfitabilityPeriod;
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}
