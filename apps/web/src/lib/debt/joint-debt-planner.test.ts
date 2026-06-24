// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  GOAL_DELAY_CONCERN_MONTHS,
  compareJointStrategies,
  ownershipLabel,
  projectGoalImpact,
  projectGoalImpacts,
  recommendForCouple,
  selectStrategyResult,
  summarizeOwnership,
  type CoupleGoal,
  type JointDebtInput,
} from './joint-debt-planner';

const debts: JointDebtInput[] = [
  {
    id: 'card',
    name: 'Rewards Card',
    balanceCents: 3000_00,
    annualRateBps: 1999,
    minimumPaymentCents: 120_00,
    ownership: 'personal',
    owner: 'partner-a',
  },
  {
    id: 'loan',
    name: 'Car Loan',
    balanceCents: 1000_00,
    annualRateBps: 500,
    minimumPaymentCents: 75_00,
    ownership: 'shared',
    owner: 'partner-b',
  },
  {
    id: 'medical',
    name: 'Medical Bill',
    balanceCents: 500_00,
    annualRateBps: 0,
    minimumPaymentCents: 25_00,
    ownership: 'jointly-funded',
    owner: 'partner-a',
  },
];

describe('summarizeOwnership', () => {
  it('rolls up balances by ownership and partner', () => {
    const summary = summarizeOwnership(debts);
    expect(summary.totalBalanceCents).toBe(4500_00);
    expect(summary.personalBalanceCents).toBe(3000_00);
    expect(summary.sharedBalanceCents).toBe(1000_00);
    expect(summary.jointlyFundedBalanceCents).toBe(500_00);
    expect(summary.partnerABalanceCents).toBe(3500_00);
    expect(summary.partnerBBalanceCents).toBe(1000_00);
    expect(summary.counts).toEqual({ personal: 1, shared: 1, 'jointly-funded': 1 });
  });

  it('handles an empty debt list', () => {
    const summary = summarizeOwnership([]);
    expect(summary.totalBalanceCents).toBe(0);
    expect(summary.counts).toEqual({ personal: 0, shared: 0, 'jointly-funded': 0 });
  });
});

describe('ownershipLabel', () => {
  it('returns text labels for every ownership value', () => {
    expect(ownershipLabel('personal')).toBe('Personal');
    expect(ownershipLabel('shared')).toBe('Shared');
    expect(ownershipLabel('jointly-funded')).toBe('Jointly funded');
  });
});

describe('compareJointStrategies', () => {
  it('recommends avalanche when interest savings are material', () => {
    const comparison = compareJointStrategies(debts, 200_00);
    expect(comparison.interestDifferenceCents).toBeGreaterThanOrEqual(0);
    // Avalanche never pays more interest than snowball.
    expect(comparison.avalanche.totalInterestCents).toBeLessThanOrEqual(
      comparison.snowball.totalInterestCents,
    );
    expect(comparison.recommendedStrategy).toBe('avalanche');
  });

  it('recommends snowball when the two strategies are near-equal', () => {
    const evenDebts: JointDebtInput[] = [
      {
        id: 'a',
        name: 'A',
        balanceCents: 1000_00,
        annualRateBps: 1000,
        minimumPaymentCents: 50_00,
        ownership: 'shared',
        owner: 'partner-a',
      },
      {
        id: 'b',
        name: 'B',
        balanceCents: 1000_00,
        annualRateBps: 1000,
        minimumPaymentCents: 50_00,
        ownership: 'shared',
        owner: 'partner-b',
      },
    ];
    const comparison = compareJointStrategies(evenDebts, 100_00);
    expect(comparison.interestDifferenceCents).toBe(0);
    expect(comparison.recommendedStrategy).toBe('snowball');
  });

  it('selectStrategyResult returns the matching result', () => {
    const comparison = compareJointStrategies(debts, 100_00);
    expect(selectStrategyResult(comparison, 'avalanche')).toBe(comparison.avalanche);
    expect(selectStrategyResult(comparison, 'snowball')).toBe(comparison.snowball);
  });

  it('clamps negative extra payments to zero', () => {
    const negative = compareJointStrategies(debts, -500_00);
    const zero = compareJointStrategies(debts, 0);
    expect(negative.avalanche.monthsToPayoff).toBe(zero.avalanche.monthsToPayoff);
  });
});

describe('projectGoalImpact', () => {
  const goal: CoupleGoal = {
    id: 'wedding',
    name: 'Wedding',
    targetCents: 20_000_00,
    savedCents: 2_000_00,
    monthlyContributionCents: 300_00,
  };

  it('funds the goal no sooner when the extra payment goes to debt first', () => {
    const comparison = compareJointStrategies(debts, 300_00);
    const result = selectStrategyResult(comparison, comparison.recommendedStrategy);
    const impact = projectGoalImpact(result, goal, 300_00);
    expect(impact.monthsWithDebtFocus).toBeGreaterThanOrEqual(impact.monthsWithGoalFocus);
    expect(impact.monthsDelta).toBe(impact.monthsWithDebtFocus - impact.monthsWithGoalFocus);
    expect(impact.remainingCents).toBe(18_000_00);
    expect(impact.reachable).toBe(true);
  });

  it('reports zero months when the goal is already funded', () => {
    const comparison = compareJointStrategies(debts, 100_00);
    const result = selectStrategyResult(comparison, 'avalanche');
    const funded: CoupleGoal = { ...goal, savedCents: goal.targetCents };
    const impact = projectGoalImpact(result, funded, 100_00);
    expect(impact.monthsWithDebtFocus).toBe(0);
    expect(impact.monthsWithGoalFocus).toBe(0);
    expect(impact.monthsDelta).toBe(0);
  });

  it('projects every goal via projectGoalImpacts', () => {
    const comparison = compareJointStrategies(debts, 100_00);
    const result = selectStrategyResult(comparison, 'avalanche');
    const impacts = projectGoalImpacts(
      result,
      [goal, { ...goal, id: 'home', name: 'Home' }],
      100_00,
    );
    expect(impacts).toHaveLength(2);
    expect(impacts[0]?.goalId).toBe('wedding');
    expect(impacts[1]?.goalId).toBe('home');
  });
});

describe('recommendForCouple', () => {
  it('recommends avalanche and a debt focus when goals stay on track', () => {
    const comparison = compareJointStrategies(debts, 200_00);
    const rec = recommendForCouple(comparison, []);
    expect(rec.strategy).toBe('avalanche');
    expect(rec.focus).toBe('debt');
    expect(rec.headline).toContain('avalanche');
    expect(rec.headline.toLowerCase()).toContain('focus the extra payment on debt');
    expect(rec.rationale.length).toBeGreaterThan(0);
  });

  it('recommends a balanced focus when a goal is delayed past the concern threshold', () => {
    const comparison = compareJointStrategies(debts, 200_00);
    const impacts = [
      {
        goalId: 'wedding',
        name: 'Wedding',
        remainingCents: 10_000_00,
        monthsWithDebtFocus: 24 + GOAL_DELAY_CONCERN_MONTHS,
        monthsWithGoalFocus: 24,
        monthsDelta: GOAL_DELAY_CONCERN_MONTHS,
        reachable: true,
      },
    ];
    const rec = recommendForCouple(comparison, impacts);
    expect(rec.focus).toBe('balanced');
    expect(rec.headline.toLowerCase()).toContain('split the extra payment');
    expect(rec.rationale.some((line) => line.includes('Wedding'))).toBe(true);
  });
});
