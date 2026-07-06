// SPDX-License-Identifier: BUSL-1.1

/**
 * Single-loan debt payoff engine — the "fitness rings" payoff surface (#2175).
 *
 * Pure, deterministic functions powering a highly visual debt-payoff card:
 * an amortization schedule, the estimated payoff date, total interest, payoff
 * progress (paid principal vs. original principal), payoff milestones, and an
 * extra-payment "what if" comparison (months saved + interest saved vs. the
 * baseline minimum payment).
 *
 * Money is integer minor units (cents). Interest compounds monthly from an APR
 * expressed in basis points. All rounding uses banker's rounding (round half to
 * even) to avoid systematic bias. No floating-point money is ever stored or
 * returned — every monetary value in/out is an integer number of cents.
 *
 * These functions are intentionally free of React, DOM, and storage concerns so
 * they can be unit-tested in isolation and reused by other payoff surfaces.
 *
 * References: issue #2175
 */

import { getCurrentLocale } from '../i18n';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of months to simulate before declaring a payment plan
 * non-amortizing. Prevents infinite loops when the payment never retires the
 * balance (e.g., minimum payment below the monthly interest accrual).
 */
export const MAX_PAYOFF_MONTHS = 1200; // 100 years

/** Months per calendar year. */
const MONTHS_PER_YEAR = 12;

/** Basis-points divisor (10,000 bps = 100%). */
const BPS_DIVISOR = 10_000;

/** Floating tolerance used when detecting exact rounding ties. */
const TIE_EPSILON = 1e-9;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Normalised input describing a single loan/debt to model. */
export interface LoanPayoffInput {
  /** Stable identifier (used for selection in the UI). */
  readonly id: string;
  /** Human-readable name (e.g., "Auto Loan"). */
  readonly name: string;
  /** Current outstanding balance in cents. */
  readonly balanceCents: number;
  /** Original principal in cents, used as the payoff-progress baseline. */
  readonly originalPrincipalCents: number;
  /** Annual percentage rate in basis points (1999 = 19.99%). */
  readonly annualRateBps: number;
  /** Baseline minimum monthly payment in cents. */
  readonly minimumPaymentCents: number;
}

/** A single month within an amortization schedule. */
export interface PayoffScheduleEntry {
  /** 1-indexed month number. */
  readonly month: number;
  /** Payment applied this month in cents. */
  readonly paymentCents: number;
  /** Portion of the payment applied to principal in cents. */
  readonly principalCents: number;
  /** Portion of the payment applied to interest in cents. */
  readonly interestCents: number;
  /** Remaining balance after this payment in cents. */
  readonly remainingBalanceCents: number;
}

/** A full payoff projection for a fixed monthly payment. */
export interface PayoffProjection {
  /** Fixed monthly payment modelled, in cents. */
  readonly monthlyPaymentCents: number;
  /** Month-by-month amortization entries (empty when already paid off). */
  readonly schedule: readonly PayoffScheduleEntry[];
  /** Months until paid off, or `null` if the payment never amortizes. */
  readonly monthsToPayoff: number | null;
  /** Total interest paid across the plan in cents. */
  readonly totalInterestCents: number;
  /** Total principal repaid across the plan in cents. */
  readonly totalPrincipalCents: number;
  /** Total amount paid (principal + interest) in cents. */
  readonly totalPaidCents: number;
  /** ISO date (YYYY-MM-DD) of the final payment, or `null` if non-amortizing. */
  readonly estimatedPayoffDateIso: string | null;
  /** Whether the balance is fully retired within the modelling horizon. */
  readonly amortizes: boolean;
}

/** Payoff progress measured against the original principal. */
export interface PayoffProgress {
  readonly originalPrincipalCents: number;
  readonly currentBalanceCents: number;
  readonly paidPrincipalCents: number;
  /** Percent of original principal paid off (0–100, one decimal place). */
  readonly percentPaid: number;
  /** Text alternative for the ring, e.g. "62% paid — $6,200 of $10,000". */
  readonly textAlternative: string;
  /** Whether the balance is fully cleared. */
  readonly isPaidOff: boolean;
}

/** Supported payoff milestone thresholds. */
export type PayoffMilestoneThreshold = 25 | 50 | 75 | 100;

/** A single payoff milestone and its reached/remaining state. */
export interface PayoffMilestone {
  readonly thresholdPercent: PayoffMilestoneThreshold;
  readonly isReached: boolean;
  /** Principal still to pay before reaching this milestone (0 once reached). */
  readonly remainingToReachCents: number;
  /** Screen-reader friendly label (never relies on colour alone). */
  readonly label: string;
}

/** Comparison of an extra-payment plan against the baseline minimum payment. */
export interface ExtraPaymentComparison {
  /** Extra payment modelled on top of the minimum, in cents. */
  readonly extraPaymentCents: number;
  /** Baseline projection (minimum payment only). */
  readonly baseline: PayoffProjection;
  /** Accelerated projection (minimum + extra payment). */
  readonly accelerated: PayoffProjection;
  /** Months saved vs. baseline, or `null` if either plan never amortizes. */
  readonly monthsSaved: number | null;
  /** Interest saved vs. baseline in cents (0 unless both plans amortize). */
  readonly interestSavedCents: number;
  /** Whether the comparison produces a meaningful saving to surface. */
  readonly hasImpact: boolean;
}

/** Assembled view model for the payoff rings card. */
export interface PayoffRingViewModel {
  readonly input: LoanPayoffInput;
  readonly progress: PayoffProgress;
  /** Projection for the currently-modelled payment (minimum + extra). */
  readonly activeProjection: PayoffProjection;
  readonly milestones: readonly PayoffMilestone[];
  readonly comparison: ExtraPaymentComparison;
  /** Next unreached milestone, or `null` when all are reached. */
  readonly nextMilestone: PayoffMilestone | null;
  /** Composite aria-label describing the ring, payoff date, and savings. */
  readonly ringAriaLabel: string;
  /** Human-readable estimated payoff date ("Mar 2031" / fallback copy). */
  readonly payoffDateLabel: string;
  /** Human-readable remaining duration ("3 years, 2 months"). */
  readonly payoffDurationLabel: string;
  /** Interest-saved messaging for the active extra-payment scenario. */
  readonly savingsMessage: string;
}

// ---------------------------------------------------------------------------
// Rounding & formatting helpers
// ---------------------------------------------------------------------------

/**
 * Rounds to the nearest integer using banker's rounding (round half to even /
 * IEEE 754 HALF_EVEN). Exact ties resolve toward the nearest even integer.
 *
 *   bankersRound(0.5) → 0
 *   bankersRound(1.5) → 2
 *   bankersRound(2.5) → 2
 *   bankersRound(3.5) → 4
 */
export function bankersRound(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (Math.abs(fraction - 0.5) < TIE_EPSILON) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(value);
}

/** Rounds a percentage to a single decimal place. */
function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Formats an integer cent amount as a US dollar string. Whole-dollar amounts
 * omit the trailing cents (e.g. "$10,000"); fractional amounts keep two
 * decimals (e.g. "$3,800.50"). Used for ring text alternatives and labels.
 */
export function formatUsdCents(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const dollarText = dollars.toLocaleString('en-US');
  return remainder === 0
    ? `${sign}$${dollarText}`
    : `${sign}$${dollarText}.${remainder.toString().padStart(2, '0')}`;
}

/** Formats a percentage, dropping a redundant trailing ".0". */
export function formatPercent(value: number): string {
  const rounded = roundToOneDecimal(value);
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

/** Formats an ISO date (YYYY-MM-DD) as "Mon YYYY" in UTC. */
export function formatMonthYear(dateIso: string): string {
  return new Intl.DateTimeFormat(getCurrentLocale(), {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateIso}T00:00:00.000Z`));
}

/** Formats a number of months as a friendly duration string. */
export function formatMonthsDuration(months: number | null): string {
  if (months === null) return 'no payoff at this payment';
  if (months <= 0) return 'paid off';
  const years = Math.floor(months / MONTHS_PER_YEAR);
  const remainingMonths = months % MONTHS_PER_YEAR;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (remainingMonths > 0) {
    parts.push(`${remainingMonths} month${remainingMonths === 1 ? '' : 's'}`);
  }
  return parts.join(', ');
}

/**
 * Adds a whole number of months to an ISO date (YYYY-MM-DD), in UTC.
 * Returns the resulting ISO date string.
 */
export function addMonthsToIso(startIso: string, months: number): string {
  const [year, month, day] = startIso.split('-').map((part) => Number.parseInt(part, 10));
  const safeYear = Number.isFinite(year) ? year : 1970;
  const safeMonth = Number.isFinite(month) ? Math.max(1, month) : 1;
  const safeDay = Number.isFinite(day) ? Math.max(1, day) : 1;
  const date = new Date(Date.UTC(safeYear, safeMonth - 1, safeDay));
  date.setUTCMonth(date.getUTCMonth() + Math.max(0, Math.round(months)));
  return date.toISOString().slice(0, 10);
}

/** Returns today's date as an ISO (YYYY-MM-DD) string in UTC. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

/**
 * Calculates one month of interest on a balance in cents using monthly
 * compounding derived from an APR in basis points. Result is banker's-rounded.
 */
export function monthlyInterestCents(balanceCents: number, annualRateBps: number): number {
  if (balanceCents <= 0 || annualRateBps <= 0) return 0;
  const monthlyRate = annualRateBps / BPS_DIVISOR / MONTHS_PER_YEAR;
  return bankersRound(balanceCents * monthlyRate);
}

/** Normalises the original principal so it is never below the current balance. */
function normalizeOriginalPrincipal(input: LoanPayoffInput): number {
  return Math.max(0, input.originalPrincipalCents, Math.max(0, input.balanceCents));
}

/**
 * Builds a full amortization projection for a fixed monthly payment.
 *
 * Handles the key edge cases:
 *  - Already paid off (balance ≤ 0) → zero-month, fully-amortized result.
 *  - 0% APR → pure principal reduction.
 *  - Non-amortizing payment (≤ monthly interest) → `amortizes: false`,
 *    `monthsToPayoff: null`, `estimatedPayoffDateIso: null`.
 *
 * @param input Loan to amortize.
 * @param monthlyPaymentCents Fixed monthly payment in cents.
 * @param options Optional anchor date for the estimated payoff date.
 */
export function projectPayoff(
  input: LoanPayoffInput,
  monthlyPaymentCents: number,
  options: { readonly startDateIso?: string } = {},
): PayoffProjection {
  const startIso = options.startDateIso ?? todayIso();
  const payment = Math.max(0, Math.round(monthlyPaymentCents));
  let balance = Math.max(0, Math.round(input.balanceCents));

  if (balance <= 0) {
    return {
      monthlyPaymentCents: payment,
      schedule: [],
      monthsToPayoff: 0,
      totalInterestCents: 0,
      totalPrincipalCents: 0,
      totalPaidCents: 0,
      estimatedPayoffDateIso: startIso,
      amortizes: true,
    };
  }

  const schedule: PayoffScheduleEntry[] = [];
  let totalInterest = 0;
  let totalPrincipal = 0;
  let totalPaid = 0;
  let month = 0;
  let amortizes = false;

  while (balance > 0 && month < MAX_PAYOFF_MONTHS) {
    const interest = monthlyInterestCents(balance, input.annualRateBps);
    const appliedPayment = Math.min(payment, balance + interest);
    const principal = Math.max(0, appliedPayment - interest);

    // The payment does not cover interest — the balance can never shrink.
    if (principal <= 0) {
      break;
    }

    month += 1;
    balance = Math.max(0, balance - principal);
    totalInterest += interest;
    totalPrincipal += principal;
    totalPaid += appliedPayment;
    schedule.push({
      month,
      paymentCents: appliedPayment,
      principalCents: principal,
      interestCents: interest,
      remainingBalanceCents: balance,
    });

    if (balance <= 0) {
      amortizes = true;
      break;
    }
  }

  if (!amortizes) {
    return {
      monthlyPaymentCents: payment,
      schedule,
      monthsToPayoff: null,
      totalInterestCents: totalInterest,
      totalPrincipalCents: totalPrincipal,
      totalPaidCents: totalPaid,
      estimatedPayoffDateIso: null,
      amortizes: false,
    };
  }

  return {
    monthlyPaymentCents: payment,
    schedule,
    monthsToPayoff: month,
    totalInterestCents: totalInterest,
    totalPrincipalCents: totalPrincipal,
    totalPaidCents: totalPaid,
    estimatedPayoffDateIso: addMonthsToIso(startIso, month),
    amortizes: true,
  };
}

/** Computes payoff progress (paid principal vs. original principal). */
export function calculatePayoffProgress(input: LoanPayoffInput): PayoffProgress {
  const original = normalizeOriginalPrincipal(input);
  const current = Math.max(0, Math.round(input.balanceCents));
  const paid = Math.max(0, original - current);
  const percentPaid = original > 0 ? roundToOneDecimal((paid * 100) / original) : 100;
  return {
    originalPrincipalCents: original,
    currentBalanceCents: current,
    paidPrincipalCents: paid,
    percentPaid,
    textAlternative: `${formatPercent(percentPaid)} paid, ${formatUsdCents(paid)} of ${formatUsdCents(original)}`,
    isPaidOff: current <= 0,
  };
}

const MILESTONE_THRESHOLDS: readonly PayoffMilestoneThreshold[] = [25, 50, 75, 100];

/** Computes the payoff milestone ladder (25/50/75/100% of principal repaid). */
export function calculatePayoffMilestones(input: LoanPayoffInput): readonly PayoffMilestone[] {
  const progress = calculatePayoffProgress(input);
  const original = progress.originalPrincipalCents;
  return MILESTONE_THRESHOLDS.map((thresholdPercent) => {
    const isReached = progress.percentPaid >= thresholdPercent;
    const targetPaidCents = Math.ceil((thresholdPercent / 100) * original);
    const remainingToReachCents = isReached
      ? 0
      : Math.max(0, targetPaidCents - progress.paidPrincipalCents);
    return {
      thresholdPercent,
      isReached,
      remainingToReachCents,
      label: isReached
        ? `${thresholdPercent}% paid off, milestone reached`
        : `${thresholdPercent}% paid off, ${formatUsdCents(remainingToReachCents)} to go`,
    };
  });
}

/**
 * Compares an extra-payment plan against the baseline minimum payment,
 * returning months saved and interest saved.
 */
export function compareExtraPayment(
  input: LoanPayoffInput,
  extraPaymentCents: number,
  options: { readonly startDateIso?: string } = {},
): ExtraPaymentComparison {
  const extra = Math.max(0, Math.round(extraPaymentCents));
  const baseline = projectPayoff(input, input.minimumPaymentCents, options);
  const accelerated = projectPayoff(input, input.minimumPaymentCents + extra, options);

  const monthsSaved =
    baseline.monthsToPayoff !== null && accelerated.monthsToPayoff !== null
      ? Math.max(0, baseline.monthsToPayoff - accelerated.monthsToPayoff)
      : null;

  const interestSavedCents =
    baseline.amortizes && accelerated.amortizes
      ? Math.max(0, baseline.totalInterestCents - accelerated.totalInterestCents)
      : 0;

  const hasImpact =
    extra > 0 && baseline.amortizes && accelerated.amortizes && interestSavedCents > 0;

  return {
    extraPaymentCents: extra,
    baseline,
    accelerated,
    monthsSaved,
    interestSavedCents,
    hasImpact,
  };
}

// ---------------------------------------------------------------------------
// View model assembly
// ---------------------------------------------------------------------------

function buildSavingsMessage(comparison: ExtraPaymentComparison): string {
  if (!comparison.baseline.amortizes) {
    return 'Your minimum payment does not cover the monthly interest, so the balance will keep growing. Increase the payment to start making progress.';
  }
  if (comparison.extraPaymentCents <= 0) {
    return 'Add an extra monthly payment to see how much interest and time you could save.';
  }
  if (!comparison.hasImpact) {
    return `An extra ${formatUsdCents(comparison.extraPaymentCents)} per month does not change this payoff.`;
  }
  const months = comparison.monthsSaved ?? 0;
  const monthsText =
    months > 0 ? `${formatMonthsDuration(months)} sooner` : 'the same payoff timeline';
  return `An extra ${formatUsdCents(comparison.extraPaymentCents)} per month pays this off ${monthsText} and saves ${formatUsdCents(comparison.interestSavedCents)} in interest.`;
}

/**
 * Assembles the complete payoff-rings view model for a single loan and a chosen
 * extra payment. Keeps the React component thin and fully unit-testable.
 */
export function buildPayoffRingViewModel(
  input: LoanPayoffInput,
  extraPaymentCents: number,
  options: { readonly startDateIso?: string } = {},
): PayoffRingViewModel {
  const progress = calculatePayoffProgress(input);
  const milestones = calculatePayoffMilestones(input);
  const comparison = compareExtraPayment(input, extraPaymentCents, options);
  const activeProjection =
    comparison.extraPaymentCents > 0 ? comparison.accelerated : comparison.baseline;
  const nextMilestone = milestones.find((milestone) => !milestone.isReached) ?? null;

  const payoffDateLabel = progress.isPaidOff
    ? 'Paid off'
    : activeProjection.estimatedPayoffDateIso
      ? formatMonthYear(activeProjection.estimatedPayoffDateIso)
      : 'No payoff at this payment';

  const payoffDurationLabel = progress.isPaidOff
    ? 'Paid off'
    : formatMonthsDuration(activeProjection.monthsToPayoff);

  const savingsMessage = buildSavingsMessage(comparison);

  const payoffPhrase = progress.isPaidOff
    ? 'This debt is paid off.'
    : activeProjection.estimatedPayoffDateIso
      ? `Estimated payoff ${payoffDateLabel}.`
      : 'No payoff date at the current payment.';

  const savingsPhrase = comparison.hasImpact
    ? ` Extra payments save ${formatUsdCents(comparison.interestSavedCents)} in interest.`
    : '';

  return {
    input,
    progress,
    activeProjection,
    milestones,
    comparison,
    nextMilestone,
    ringAriaLabel: `${input.name} payoff ring: ${progress.textAlternative}. ${payoffPhrase}${savingsPhrase}`,
    payoffDateLabel,
    payoffDurationLabel,
    savingsMessage,
  };
}
