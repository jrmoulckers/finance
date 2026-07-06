// SPDX-License-Identifier: BUSL-1.1

/**
 * Joint debt payoff planner for couples (#2153).
 *
 * Builds on the shared payoff engine (`shared-payoff-rules.ts`) without
 * duplicating any payoff/interest maths. This module adds the missing
 * *partner-ownership* dimension:
 *
 *  - mark each debt as `personal`, `shared`, or `jointly-funded`;
 *  - compare avalanche vs. snowball across BOTH partners' debts;
 *  - project how an extra debt payment delays other couple goals
 *    (wedding fund, home down payment, ...);
 *  - produce a plain-language "recommendation mode" decision aid.
 *
 * All money is in integer minor units (cents). No interest maths is invented
 * here — debt projections come straight from `calculateSharedPayoff`. Goal
 * savings are modelled as simple linear accumulation (no invented growth/APY).
 */

import {
  calculateSharedPayoff,
  type SharedDebtInput,
  type SharedPayoffResult,
  type SharedPayoffStrategy,
} from './shared-payoff-rules';
import { formatUsdCents } from './payoff';

// ---------------------------------------------------------------------------
// Ownership + partner dimension
// ---------------------------------------------------------------------------

/** Who is responsible for / funds a debt. */
export type DebtOwnership = 'personal' | 'shared' | 'jointly-funded';

/** Which partner a personal debt belongs to. */
export type PartnerId = 'partner-a' | 'partner-b';

/** A debt enriched with the couple ownership dimension. */
export interface JointDebtInput extends SharedDebtInput {
  readonly name: string;
  /** How the couple treats this balance. */
  readonly ownership: DebtOwnership;
  /** Which partner originated / primarily holds the balance. */
  readonly owner: PartnerId;
}

/** Strategy comparison limited to the two well-known couple strategies. */
export type CoupleStrategy = Extract<SharedPayoffStrategy, 'avalanche' | 'snowball'>;

const MONTH_HORIZON = 600;

/** Avalanche must beat snowball by at least this much interest to be recommended. */
export const MEANINGFUL_INTEREST_SAVINGS_CENTS = 100_00;

/** A goal delayed by at least this many months is flagged as a real trade-off. */
export const GOAL_DELAY_CONCERN_MONTHS = 6;

const OWNERSHIP_LABELS: Record<DebtOwnership, string> = {
  personal: 'Personal',
  shared: 'Shared',
  'jointly-funded': 'Jointly funded',
};

/** Human-readable label for an ownership value (text, never colour-only). */
export function ownershipLabel(ownership: DebtOwnership): string {
  return OWNERSHIP_LABELS[ownership];
}

const STRATEGY_LABELS: Record<CoupleStrategy, string> = {
  avalanche: 'avalanche',
  snowball: 'snowball',
};

function toSharedDebtInput(debt: JointDebtInput): SharedDebtInput {
  return {
    id: debt.id,
    balanceCents: debt.balanceCents,
    annualRateBps: debt.annualRateBps,
    minimumPaymentCents: debt.minimumPaymentCents,
  };
}

// ---------------------------------------------------------------------------
// Ownership summary
// ---------------------------------------------------------------------------

export interface OwnershipSummary {
  readonly personalBalanceCents: number;
  readonly sharedBalanceCents: number;
  readonly jointlyFundedBalanceCents: number;
  readonly totalBalanceCents: number;
  readonly partnerABalanceCents: number;
  readonly partnerBBalanceCents: number;
  readonly counts: Record<DebtOwnership, number>;
}

/** Roll up balances by ownership category and by partner. */
export function summarizeOwnership(debts: readonly JointDebtInput[]): OwnershipSummary {
  const summary = {
    personalBalanceCents: 0,
    sharedBalanceCents: 0,
    jointlyFundedBalanceCents: 0,
    totalBalanceCents: 0,
    partnerABalanceCents: 0,
    partnerBBalanceCents: 0,
    counts: { personal: 0, shared: 0, 'jointly-funded': 0 } as Record<DebtOwnership, number>,
  };

  for (const debt of debts) {
    summary.totalBalanceCents += debt.balanceCents;
    summary.counts[debt.ownership] += 1;
    if (debt.ownership === 'personal') summary.personalBalanceCents += debt.balanceCents;
    else if (debt.ownership === 'shared') summary.sharedBalanceCents += debt.balanceCents;
    else summary.jointlyFundedBalanceCents += debt.balanceCents;

    if (debt.owner === 'partner-a') summary.partnerABalanceCents += debt.balanceCents;
    else summary.partnerBBalanceCents += debt.balanceCents;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Strategy comparison across BOTH partners' debts
// ---------------------------------------------------------------------------

export interface JointStrategyComparison {
  readonly avalanche: SharedPayoffResult;
  readonly snowball: SharedPayoffResult;
  /** snowball interest minus avalanche interest (>= 0; avalanche never pays more). */
  readonly interestDifferenceCents: number;
  /** snowball months minus avalanche months. */
  readonly monthsDifference: number;
  readonly recommendedStrategy: CoupleStrategy;
}

/**
 * Run avalanche and snowball across the couple's combined debts and report the
 * recommended strategy. Avalanche is recommended when its interest savings are
 * material or it is meaningfully faster; otherwise snowball wins for momentum.
 */
export function compareJointStrategies(
  debts: readonly JointDebtInput[],
  extraPaymentCents: number,
): JointStrategyComparison {
  const inputs = debts.map(toSharedDebtInput);
  const safeExtra = Math.max(0, Math.round(extraPaymentCents));
  const avalanche = calculateSharedPayoff(inputs, 'avalanche', safeExtra);
  const snowball = calculateSharedPayoff(inputs, 'snowball', safeExtra);
  const interestDifferenceCents = snowball.totalInterestCents - avalanche.totalInterestCents;
  const monthsDifference = snowball.monthsToPayoff - avalanche.monthsToPayoff;
  const avalancheWins =
    interestDifferenceCents >= MEANINGFUL_INTEREST_SAVINGS_CENTS || monthsDifference > 1;
  return {
    avalanche,
    snowball,
    interestDifferenceCents,
    monthsDifference,
    recommendedStrategy: avalancheWins ? 'avalanche' : 'snowball',
  };
}

/** Pick the matching result out of a comparison. */
export function selectStrategyResult(
  comparison: JointStrategyComparison,
  strategy: CoupleStrategy,
): SharedPayoffResult {
  return strategy === 'avalanche' ? comparison.avalanche : comparison.snowball;
}

// ---------------------------------------------------------------------------
// Goal impact of extra debt payments
// ---------------------------------------------------------------------------

export interface CoupleGoal {
  readonly id: string;
  readonly name: string;
  /** Total amount the couple wants to save, in cents. */
  readonly targetCents: number;
  /** Amount already saved, in cents. */
  readonly savedCents: number;
  /** Monthly contribution made independently of the extra debt payment, in cents. */
  readonly monthlyContributionCents: number;
}

export interface GoalImpact {
  readonly goalId: string;
  readonly name: string;
  readonly remainingCents: number;
  /** Months to fund the goal when the extra payment goes to debt first. */
  readonly monthsWithDebtFocus: number;
  /** Months to fund the goal when the extra payment goes straight to the goal. */
  readonly monthsWithGoalFocus: number;
  /** monthsWithDebtFocus - monthsWithGoalFocus (>= 0 — debt focus never funds sooner). */
  readonly monthsDelta: number;
  /** True when both scenarios fund the goal inside the projection horizon. */
  readonly reachable: boolean;
}

/**
 * Months to accumulate `remainingCents`. Contributes `phaseOneCents` per month
 * up to and including `switchMonth`, then `phaseTwoCents` thereafter. Returns a
 * value greater than the horizon when the goal cannot be funded in time.
 */
function monthsToAccumulate(
  remainingCents: number,
  phaseOneCents: number,
  switchMonth: number,
  phaseTwoCents: number,
): number {
  if (remainingCents <= 0) return 0;
  let accumulated = 0;
  for (let month = 1; month <= MONTH_HORIZON; month += 1) {
    accumulated += month <= switchMonth ? phaseOneCents : phaseTwoCents;
    if (accumulated >= remainingCents) return month;
  }
  return MONTH_HORIZON + 1;
}

/**
 * Project how directing the *discretionary extra* payment at debt (vs. straight
 * at the goal) changes the time to fund a single couple goal.
 *
 * The lever modelled is the extra payment only — minimum payments are paid in
 * both scenarios regardless, so they are held constant and excluded. This keeps
 * the comparison apples-to-apples and one-directional (focusing the extra on
 * debt never funds the goal sooner):
 *
 *  - Goal-first: the goal grows by `monthlyContribution + extra` every month.
 *  - Debt-first: the goal grows by `monthlyContribution` until the debts are
 *    paid (`activeResult.monthsToPayoff`); after that the freed-up extra
 *    redirects to the goal (`monthlyContribution + extra`).
 *
 * No interest/growth maths is invented for the goal — savings accumulate
 * linearly in integer cents.
 */
export function projectGoalImpact(
  activeResult: SharedPayoffResult,
  goal: CoupleGoal,
  extraPaymentCents: number,
): GoalImpact {
  const remainingCents = Math.max(0, goal.targetCents - goal.savedCents);
  const safeExtra = Math.max(0, Math.round(extraPaymentCents));
  const base = Math.max(0, goal.monthlyContributionCents);
  const payoffMonths = activeResult.monthsToPayoff;

  const monthsWithDebtFocus = monthsToAccumulate(
    remainingCents,
    base,
    payoffMonths,
    base + safeExtra,
  );
  const monthsWithGoalFocus = monthsToAccumulate(
    remainingCents,
    base + safeExtra,
    MONTH_HORIZON,
    base + safeExtra,
  );

  const reachable = monthsWithDebtFocus <= MONTH_HORIZON && monthsWithGoalFocus <= MONTH_HORIZON;
  return {
    goalId: goal.id,
    name: goal.name,
    remainingCents,
    monthsWithDebtFocus,
    monthsWithGoalFocus,
    monthsDelta: Math.max(0, monthsWithDebtFocus - monthsWithGoalFocus),
    reachable,
  };
}

/** Project the goal impact for every goal against the active strategy result. */
export function projectGoalImpacts(
  activeResult: SharedPayoffResult,
  goals: readonly CoupleGoal[],
  extraPaymentCents: number,
): readonly GoalImpact[] {
  return goals.map((goal) => projectGoalImpact(activeResult, goal, extraPaymentCents));
}

// ---------------------------------------------------------------------------
// Couples recommendation mode (simpler decision aid)
// ---------------------------------------------------------------------------

export type CoupleFocus = 'debt' | 'balanced';

export interface CoupleRecommendation {
  /** One-line plain-language recommendation. */
  readonly headline: string;
  readonly strategy: CoupleStrategy;
  readonly focus: CoupleFocus;
  /** Supporting bullet points, already formatted for display. */
  readonly rationale: readonly string[];
}

/**
 * Turn the strategy comparison and goal impacts into a single, plain-language
 * recommendation for a couple. Pure and deterministic so it is unit-testable
 * and safe to announce through an aria-live region.
 */
export function recommendForCouple(
  comparison: JointStrategyComparison,
  impacts: readonly GoalImpact[],
): CoupleRecommendation {
  const strategy = comparison.recommendedStrategy;
  const rationale: string[] = [];

  if (strategy === 'avalanche') {
    rationale.push(
      `Avalanche clears the highest-rate balances first, saving about ${formatUsdCents(
        comparison.interestDifferenceCents,
      )} in interest versus snowball.`,
    );
  } else {
    rationale.push(
      'Snowball clears the smallest balances first for quick, motivating wins. The interest difference here is small.',
    );
  }

  const mostDelayed = [...impacts]
    .filter((impact) => impact.reachable && impact.remainingCents > 0)
    .sort((a, b) => b.monthsDelta - a.monthsDelta)[0];

  let focus: CoupleFocus;
  if (mostDelayed && mostDelayed.monthsDelta >= GOAL_DELAY_CONCERN_MONTHS) {
    focus = 'balanced';
    rationale.push(
      `Putting every extra dollar on debt delays your ${mostDelayed.name} fund by about ${mostDelayed.monthsDelta} months. Consider splitting the extra payment so debt and savings both move forward.`,
    );
  } else {
    focus = 'debt';
    rationale.push(
      'Your savings goals stay on track, so directing the extra payment at debt is a safe call.',
    );
  }

  const headline =
    focus === 'balanced'
      ? `Use the ${STRATEGY_LABELS[strategy]} method and split the extra payment between debt and savings.`
      : `Use the ${STRATEGY_LABELS[strategy]} method and focus the extra payment on debt.`;

  return { headline, strategy, focus, rationale };
}
