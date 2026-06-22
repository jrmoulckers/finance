// SPDX-License-Identifier: BUSL-1.1

/**
 * Secured-card utilization helper for people building credit from zero.
 *
 * Given a secured card's balance and credit limit (both **integer cents**),
 * this computes the utilization percentage, classifies it with a friendly
 * three-tier scale (good / caution / high), and produces plain-language
 * guidance toward a low target utilization.
 *
 * The percentage math (safe divide-by-zero, balance clamping, rounding) is
 * reused from the shared credit-card engine via
 * {@link calculateCreditUtilizationSummary} so there is a single source of
 * truth for how utilization is calculated across the app.
 *
 * Pure and deterministic - no I/O, no side effects, no time dependence.
 *
 * References: issue #2174
 */

import { calculateCreditUtilizationSummary } from '../debt-credit-card-engine';
import { formatCurrency } from '../currency';
import type { CreditCard } from '../debt-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Beginner-friendly utilization band.
 *
 * - `good`    - utilization below the good threshold (default < 30%).
 * - `caution` - between the good and caution thresholds (default 30-50%).
 * - `high`    - above the caution threshold (default > 50%).
 * - `unknown` - no usable credit limit, so utilization cannot be computed.
 */
export type SecuredCardUtilizationLevel = 'good' | 'caution' | 'high' | 'unknown';

/** Configurable band edges for the friendly three-tier scale. */
export interface SecuredCardUtilizationThresholds {
  /** Utilization strictly below this percent is `good` (default 30). */
  readonly goodBelowPercent: number;
  /** Utilization at or below this percent (and not `good`) is `caution` (default 50). */
  readonly cautionAtOrBelowPercent: number;
}

/** Inputs for {@link computeSecuredCardUtilization}. */
export interface SecuredCardUtilizationInput {
  /** Current statement/posted balance in integer cents. */
  readonly balanceCents: number;
  /** Credit limit in integer cents (0 or missing means "no limit set"). */
  readonly creditLimitCents: number;
  /** Utilization the guidance steers toward, as a percent (default 30). */
  readonly targetUtilizationPercent?: number;
  /** Optional override of the band thresholds. */
  readonly thresholds?: SecuredCardUtilizationThresholds;
}

/** Deterministic result describing a single secured card's utilization. */
export interface SecuredCardUtilization {
  /** Balance used for the calculation (clamped to >= 0). */
  readonly balanceCents: number;
  /** Credit limit used for the calculation (clamped to >= 0). */
  readonly creditLimitCents: number;
  /** Utilization percent rounded to one decimal, or `null` when no limit. */
  readonly utilizationPercent: number | null;
  /** Friendly band the utilization falls into. */
  readonly level: SecuredCardUtilizationLevel;
  /** Short, human-readable label for the band (e.g. "On track"). */
  readonly levelLabel: string;
  /** True when the balance exceeds the credit limit. */
  readonly isOverLimit: boolean;
  /** Target utilization the guidance steers toward, as a percent. */
  readonly targetUtilizationPercent: number;
  /** Highest balance that stays at/under the target, or `null` when no limit. */
  readonly targetBalanceCents: number | null;
  /** Cents to pay down to reach the target (0 when already at/under target). */
  readonly payDownToTargetCents: number;
  /** Unused credit remaining (limit - balance, >= 0), or `null` when no limit. */
  readonly remainingHeadroomCents: number | null;
  /** One-line, plain-language summary of where things stand. */
  readonly headline: string;
  /** Plain-language guidance toward the target utilization. */
  readonly guidance: string;
  /** The thresholds actually applied (after normalization). */
  readonly thresholds: SecuredCardUtilizationThresholds;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default friendly band edges: good < 30%, caution 30-50%, high > 50%. */
export const DEFAULT_SECURED_CARD_THRESHOLDS: SecuredCardUtilizationThresholds = {
  goodBelowPercent: 30,
  cautionAtOrBelowPercent: 50,
};

/** Default utilization the guidance steers people toward. */
export const DEFAULT_TARGET_UTILIZATION_PERCENT = 30;

const LEVEL_LABEL: Record<SecuredCardUtilizationLevel, string> = {
  good: 'On track',
  caution: 'Getting high',
  high: 'Too high',
  unknown: 'Add a limit',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function normalizeThresholds(
  thresholds: SecuredCardUtilizationThresholds,
): SecuredCardUtilizationThresholds {
  const goodBelowPercent = Math.max(0, thresholds.goodBelowPercent);
  return {
    goodBelowPercent,
    cautionAtOrBelowPercent: Math.max(goodBelowPercent, thresholds.cautionAtOrBelowPercent),
  };
}

function buildSyntheticCard(balanceCents: number, creditLimitCents: number): CreditCard {
  return {
    id: 'secured-card',
    name: 'Secured card',
    balanceCents,
    creditLimitCents,
    minimumPaymentCents: 0,
    dueDate: '',
    annualRateBps: 0,
    statementDate: '',
  };
}

function classify(
  utilizationPercent: number | null,
  thresholds: SecuredCardUtilizationThresholds,
): SecuredCardUtilizationLevel {
  if (utilizationPercent === null) return 'unknown';
  if (utilizationPercent < thresholds.goodBelowPercent) return 'good';
  if (utilizationPercent <= thresholds.cautionAtOrBelowPercent) return 'caution';
  return 'high';
}

/** Render a utilization percent without a trailing ".0" (e.g. "30%", "12.5%"). */
export function formatUtilizationPercent(utilizationPercent: number | null): string {
  if (utilizationPercent === null) return 'N/A';
  const rounded = Math.round(utilizationPercent * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function buildHeadline(
  level: SecuredCardUtilizationLevel,
  utilizationPercent: number | null,
): string {
  const pct = formatUtilizationPercent(utilizationPercent);
  switch (level) {
    case 'unknown':
      return 'Add your credit limit to see utilization';
    case 'good':
      return `You're using ${pct} of your limit`;
    case 'caution':
      return `Your utilization is creeping up at ${pct}`;
    case 'high':
      return `Your utilization is high at ${pct}`;
  }
}

function buildGuidance(
  level: SecuredCardUtilizationLevel,
  options: {
    readonly isOverLimit: boolean;
    readonly targetUtilizationPercent: number;
    readonly payDownToTargetCents: number;
    readonly goodBelowPercent: number;
  },
): string {
  const { isOverLimit, targetUtilizationPercent, payDownToTargetCents, goodBelowPercent } = options;
  const payDown = formatCurrency(payDownToTargetCents);
  const needsPayDown = payDownToTargetCents > 0;

  switch (level) {
    case 'unknown':
      return 'Enter your secured card credit limit so we can show your utilization, which is the share of your limit you are using. Keeping it low is one of the simplest ways to build credit.';
    case 'good':
      return `Nice work. Staying under ${goodBelowPercent}% utilization is one of the fastest ways to build credit. Keep paying on time and let your balance report low each month.`;
    case 'caution': {
      const base = needsPayDown
        ? `You are above the ${goodBelowPercent}% mark lenders like to see. Paying about ${payDown} before your statement closes would bring you to your ${targetUtilizationPercent}% target.`
        : `You are right around your ${targetUtilizationPercent}% target. Bringing the balance a little lower gives you more breathing room.`;
      return base;
    }
    case 'high': {
      const overLimitPrefix = isOverLimit
        ? 'You are over your credit limit. Pay it down right away to avoid fees and protect your score. '
        : '';
      const base = needsPayDown
        ? `High utilization can hold your score back. Aim for ${targetUtilizationPercent}% or less. Paying about ${payDown} would get you there.`
        : `High utilization can hold your score back. Keep paying it down toward ${targetUtilizationPercent}% or less.`;
      return `${overLimitPrefix}${base}`;
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a secured card's utilization, classification and guidance.
 *
 * Edge cases handled deterministically:
 * - **0 limit** -> `utilizationPercent` is `null`, level `unknown` (N/A).
 * - **0 balance** -> `0%`, level `good`.
 * - **over-limit** (balance > limit) -> utilization above 100%, level `high`,
 *   `isOverLimit` true.
 *
 * @param input - Balance and limit in integer cents, plus optional target.
 * @returns A {@link SecuredCardUtilization} describing the card.
 */
export function computeSecuredCardUtilization(
  input: SecuredCardUtilizationInput,
): SecuredCardUtilization {
  const thresholds = normalizeThresholds(input.thresholds ?? DEFAULT_SECURED_CARD_THRESHOLDS);
  const targetUtilizationPercent = clampPercent(
    input.targetUtilizationPercent ?? DEFAULT_TARGET_UTILIZATION_PERCENT,
  );
  const balanceCents = Math.max(0, Math.round(input.balanceCents));
  const creditLimitCents = Math.max(0, Math.round(input.creditLimitCents));

  // Reuse the shared utilization math from the credit-card engine so the
  // divide-by-zero handling, balance clamping and rounding stay consistent.
  const summary = calculateCreditUtilizationSummary([
    buildSyntheticCard(balanceCents, creditLimitCents),
  ]);
  const utilizationPercent = summary.cards[0]?.utilizationPercent ?? null;

  const level = classify(utilizationPercent, thresholds);
  const isOverLimit = creditLimitCents > 0 && balanceCents > creditLimitCents;

  const targetBalanceCents =
    creditLimitCents > 0 ? Math.floor((creditLimitCents * targetUtilizationPercent) / 100) : null;
  const payDownToTargetCents =
    targetBalanceCents === null ? 0 : Math.max(0, balanceCents - targetBalanceCents);
  const remainingHeadroomCents =
    creditLimitCents > 0 ? Math.max(0, creditLimitCents - balanceCents) : null;

  return {
    balanceCents,
    creditLimitCents,
    utilizationPercent,
    level,
    levelLabel: LEVEL_LABEL[level],
    isOverLimit,
    targetUtilizationPercent,
    targetBalanceCents,
    payDownToTargetCents,
    remainingHeadroomCents,
    headline: buildHeadline(level, utilizationPercent),
    guidance: buildGuidance(level, {
      isOverLimit,
      targetUtilizationPercent,
      payDownToTargetCents,
      goodBelowPercent: thresholds.goodBelowPercent,
    }),
    thresholds,
  };
}
