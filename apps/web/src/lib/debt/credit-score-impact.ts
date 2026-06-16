// SPDX-License-Identifier: BUSL-1.1

/**
 * Credit-score factor impact simulator.
 *
 * This module intentionally returns qualitative factor direction instead of exact
 * score deltas because consumer score models are proprietary.
 *
 * References: issue #2223
 */

import type { CreditCard } from '../debt-types';
import { calculateCreditUtilizationSummary } from '../debt-credit-card-engine';

export type CreditScoreImpactDirection = 'positive' | 'neutral' | 'negative' | 'unknown';
export type CreditScoreImpactMagnitude = 'low' | 'medium' | 'high' | 'unknown';
export type CreditScoreFactor =
  | 'utilization'
  | 'payment_history'
  | 'new_credit'
  | 'account_age_mix';

export interface CreditScoreScenarioInput {
  readonly cards: readonly CreditCard[];
  readonly plannedPaymentsCents?: Readonly<Record<string, number>>;
  readonly targetUtilization?: {
    readonly cardId: string;
    readonly targetPercent: number;
  };
  readonly onTimePaymentMonths?: number;
  readonly newHardInquiries?: number;
  readonly closeAccountIds?: readonly string[];
}

export interface CreditScoreFactorImpact {
  readonly factor: CreditScoreFactor;
  readonly direction: CreditScoreImpactDirection;
  readonly magnitude: CreditScoreImpactMagnitude;
  readonly beforePercent: number | null;
  readonly afterPercent: number | null;
  readonly knownInputs: string[];
  readonly assumptions: string[];
  readonly explanation: string;
}

export interface CreditScoreSimulationResult {
  readonly factorImpacts: CreditScoreFactorImpact[];
  readonly overallDirection: CreditScoreImpactDirection;
  readonly disclaimer: string;
  readonly suggestedActions: string[];
}

export function calculatePaymentToReachUtilization(
  card: CreditCard,
  targetPercent: number,
): number | null {
  const creditLimitCents = Math.max(0, card.creditLimitCents ?? 0);
  if (creditLimitCents <= 0) return null;
  const safeTargetPercent = Math.max(0, Math.min(100, targetPercent));
  const targetBalanceCents = Math.floor((creditLimitCents * safeTargetPercent) / 100);
  return Math.max(0, card.balanceCents - targetBalanceCents);
}

function applyPlannedCardChanges(input: CreditScoreScenarioInput): CreditCard[] {
  const closeIds = new Set(input.closeAccountIds ?? []);
  return input.cards
    .filter((card) => !closeIds.has(card.id))
    .map((card) => {
      const plannedPaymentCents = Math.max(0, input.plannedPaymentsCents?.[card.id] ?? 0);
      const targetPaymentCents =
        input.targetUtilization?.cardId === card.id
          ? (calculatePaymentToReachUtilization(card, input.targetUtilization.targetPercent) ?? 0)
          : 0;
      const paymentCents = Math.max(plannedPaymentCents, targetPaymentCents);
      return {
        ...card,
        balanceCents: Math.max(0, card.balanceCents - paymentCents),
      };
    });
}

function scoreDirectionValue(
  direction: CreditScoreImpactDirection,
  magnitude: CreditScoreImpactMagnitude,
): number {
  if (direction === 'unknown' || direction === 'neutral') return 0;
  const base = magnitude === 'high' ? 3 : magnitude === 'medium' ? 2 : 1;
  return direction === 'positive' ? base : -base;
}

function utilizationMagnitude(deltaPercent: number): CreditScoreImpactMagnitude {
  const absoluteDelta = Math.abs(deltaPercent);
  if (absoluteDelta >= 20) return 'high';
  if (absoluteDelta >= 10) return 'medium';
  if (absoluteDelta > 0) return 'low';
  return 'low';
}

function buildUtilizationImpact(input: CreditScoreScenarioInput): CreditScoreFactorImpact {
  const before = calculateCreditUtilizationSummary(input.cards);
  const changedCards = applyPlannedCardChanges(input);
  const after = calculateCreditUtilizationSummary(changedCards);
  const beforePercent = before.aggregateUtilizationPercent;
  const afterPercent = after.aggregateUtilizationPercent;
  const knownInputs = ['card balances', 'minimum payments'];
  const assumptions = ['Score impact is modeled from utilization direction, not a bureau formula.'];

  if (before.unknownLimitCount > 0 || beforePercent === null || afterPercent === null) {
    return {
      factor: 'utilization',
      direction: 'unknown',
      magnitude: 'unknown',
      beforePercent,
      afterPercent,
      knownInputs,
      assumptions: [...assumptions, 'One or more card credit limits are unknown.'],
      explanation: 'Add credit limits before modeling utilization-driven score direction.',
    };
  }

  const deltaPercent = afterPercent - beforePercent;
  if (deltaPercent < 0) {
    return {
      factor: 'utilization',
      direction: 'positive',
      magnitude: utilizationMagnitude(deltaPercent),
      beforePercent,
      afterPercent,
      knownInputs: [...knownInputs, 'credit limits'],
      assumptions,
      explanation:
        'Lower revolving utilization is generally favorable, especially when crossing below common thresholds.',
    };
  }
  if (deltaPercent > 0) {
    return {
      factor: 'utilization',
      direction: 'negative',
      magnitude: utilizationMagnitude(deltaPercent),
      beforePercent,
      afterPercent,
      knownInputs: [...knownInputs, 'credit limits'],
      assumptions,
      explanation:
        'Higher revolving utilization can pressure score factors until balances report lower.',
    };
  }
  return {
    factor: 'utilization',
    direction: 'neutral',
    magnitude: 'low',
    beforePercent,
    afterPercent,
    knownInputs: [...knownInputs, 'credit limits'],
    assumptions,
    explanation: 'No modeled utilization change from this scenario.',
  };
}

function buildPaymentHistoryImpact(input: CreditScoreScenarioInput): CreditScoreFactorImpact {
  const months = Math.max(0, input.onTimePaymentMonths ?? 0);
  return {
    factor: 'payment_history',
    direction: months > 0 ? 'positive' : 'unknown',
    magnitude: months >= 6 ? 'medium' : months > 0 ? 'low' : 'unknown',
    beforePercent: null,
    afterPercent: null,
    knownInputs: months > 0 ? ['planned on-time payment months'] : [],
    assumptions: ['The simulator assumes no new late payments during the modeled period.'],
    explanation:
      months > 0
        ? 'More consecutive on-time payments generally strengthen payment-history factors over time.'
        : 'Payment-history direction needs a modeled on-time payment streak or late-payment data.',
  };
}

function buildNewCreditImpact(input: CreditScoreScenarioInput): CreditScoreFactorImpact {
  const inquiries = Math.max(0, input.newHardInquiries ?? 0);
  return {
    factor: 'new_credit',
    direction: inquiries > 0 ? 'negative' : 'neutral',
    magnitude: inquiries >= 3 ? 'medium' : inquiries > 0 ? 'low' : 'low',
    beforePercent: null,
    afterPercent: null,
    knownInputs: ['modeled hard inquiries'],
    assumptions: ['Inquiry impact is usually temporary and varies by credit profile.'],
    explanation:
      inquiries > 0
        ? 'New hard inquiries can temporarily lower new-credit factors.'
        : 'No new hard inquiries were modeled.',
  };
}

function buildClosureImpact(input: CreditScoreScenarioInput): CreditScoreFactorImpact {
  const closedCount = input.closeAccountIds?.length ?? 0;
  if (closedCount === 0) {
    return {
      factor: 'account_age_mix',
      direction: 'neutral',
      magnitude: 'low',
      beforePercent: null,
      afterPercent: null,
      knownInputs: [],
      assumptions: ['No account closures were modeled.'],
      explanation: 'Keeping accounts open preserves available credit in this scenario.',
    };
  }

  const before = calculateCreditUtilizationSummary(input.cards);
  const after = calculateCreditUtilizationSummary(applyPlannedCardChanges(input));
  const utilizationWorsened =
    before.aggregateUtilizationPercent !== null &&
    after.aggregateUtilizationPercent !== null &&
    after.aggregateUtilizationPercent > before.aggregateUtilizationPercent;

  return {
    factor: 'account_age_mix',
    direction: utilizationWorsened ? 'negative' : 'unknown',
    magnitude: utilizationWorsened ? 'medium' : 'unknown',
    beforePercent: before.aggregateUtilizationPercent,
    afterPercent: after.aggregateUtilizationPercent,
    knownInputs: ['modeled account closures'],
    assumptions: [
      'Closed accounts may also affect age and mix in ways not fully known from app data.',
    ],
    explanation: utilizationWorsened
      ? 'Closing accounts reduces available credit and raises modeled utilization.'
      : 'Account closure effects depend on bureau history and account age data that may be outside the app.',
  };
}

export function simulateCreditScoreImpact(
  input: CreditScoreScenarioInput,
): CreditScoreSimulationResult {
  const factorImpacts = [
    buildUtilizationImpact(input),
    buildPaymentHistoryImpact(input),
    buildNewCreditImpact(input),
    buildClosureImpact(input),
  ];
  const total = factorImpacts.reduce(
    (sum, impact) => sum + scoreDirectionValue(impact.direction, impact.magnitude),
    0,
  );
  const overallDirection: CreditScoreImpactDirection =
    total > 0 ? 'positive' : total < 0 ? 'negative' : 'neutral';
  const suggestedActions: string[] = [];
  const utilization = factorImpacts[0];
  if (utilization.direction === 'positive') {
    suggestedActions.push(
      'Consider timing payments before statement close dates so lower utilization is reported.',
    );
  } else if (utilization.direction === 'unknown') {
    suggestedActions.push('Add missing credit limits to improve utilization modeling.');
  }
  if ((input.newHardInquiries ?? 0) > 0) {
    suggestedActions.push('Avoid unnecessary additional applications while new inquiries age.');
  }

  return {
    factorImpacts,
    overallDirection,
    disclaimer:
      'This simulator estimates score-factor direction only and does not predict exact FICO or VantageScore points.',
    suggestedActions,
  };
}
