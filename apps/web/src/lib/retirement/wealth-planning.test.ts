// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the collaborative wealth planning engine.
 *
 * Covers joint net worth aggregation, shared goal tracking,
 * milestone detection, and partner contribution analysis.
 *
 * References: #1744
 */

import { describe, expect, it } from 'vitest';
import type { SharedGoal, WealthPlanAsset, WealthPlanLiability } from './types';
import {
  calculateJointNetWorth,
  calculateSharedGoalProgress,
  calculateAllSharedGoalProgress,
  getReachedMilestones,
  getNextMilestone,
  getMilestoneProgress,
  calculatePartnerContributions,
  WEALTH_MILESTONES_CENTS,
} from './wealth-planning';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const sampleAssets: WealthPlanAsset[] = [
  { id: 'a1', name: 'Checking', valueCents: 50000_00, ownership: 'individual-a', category: 'cash' },
  { id: 'a2', name: 'Savings', valueCents: 30000_00, ownership: 'individual-b', category: 'cash' },
  {
    id: 'a3',
    name: 'Joint Brokerage',
    valueCents: 100000_00,
    ownership: 'joint',
    category: 'investment',
  },
  { id: 'a4', name: 'Home', valueCents: 300000_00, ownership: 'joint', category: 'property' },
];

const sampleLiabilities: WealthPlanLiability[] = [
  { id: 'l1', name: 'Car Loan', balanceCents: 15000_00, ownership: 'individual-a' },
  { id: 'l2', name: 'Student Loan', balanceCents: 25000_00, ownership: 'individual-b' },
  { id: 'l3', name: 'Mortgage', balanceCents: 200000_00, ownership: 'joint' },
];

// ---------------------------------------------------------------------------
// Joint net worth
// ---------------------------------------------------------------------------

describe('calculateJointNetWorth', () => {
  it('aggregates assets and liabilities by ownership', () => {
    const result = calculateJointNetWorth(sampleAssets, sampleLiabilities);

    expect(result.assetACents).toBe(50000_00);
    expect(result.assetBCents).toBe(30000_00);
    expect(result.assetJointCents).toBe(400000_00);
    expect(result.totalAssetsCents).toBe(480000_00);

    expect(result.liabilityACents).toBe(15000_00);
    expect(result.liabilityBCents).toBe(25000_00);
    expect(result.liabilityJointCents).toBe(200000_00);
    expect(result.totalLiabilitiesCents).toBe(240000_00);

    expect(result.netWorthCents).toBe(240000_00);
  });

  it('handles empty inputs', () => {
    const result = calculateJointNetWorth([], []);
    expect(result.totalAssetsCents).toBe(0);
    expect(result.totalLiabilitiesCents).toBe(0);
    expect(result.netWorthCents).toBe(0);
  });

  it('handles negative net worth', () => {
    const liabilities: WealthPlanLiability[] = [
      { id: 'l1', name: 'Debt', balanceCents: 100000_00, ownership: 'individual-a' },
    ];
    const result = calculateJointNetWorth([], liabilities);
    expect(result.netWorthCents).toBe(-100000_00);
  });
});

// ---------------------------------------------------------------------------
// Shared goals
// ---------------------------------------------------------------------------

describe('calculateSharedGoalProgress', () => {
  const goal: SharedGoal = {
    id: 'g1',
    name: 'Down Payment',
    targetCents: 100000_00,
    currentCents: 60000_00,
    contributionACents: 40000_00,
    contributionBCents: 20000_00,
    targetDate: '2026-01-01',
  };

  it('calculates progress percentage', () => {
    const progress = calculateSharedGoalProgress(goal);
    expect(progress.progressPercent).toBe(60);
    expect(progress.remainingCents).toBe(40000_00);
  });

  it('calculates contribution percentages', () => {
    const progress = calculateSharedGoalProgress(goal);
    expect(progress.contributionAPercent).toBeCloseTo(66.67, 1);
    expect(progress.contributionBPercent).toBeCloseTo(33.33, 1);
  });

  it('handles zero target', () => {
    const zeroGoal: SharedGoal = { ...goal, targetCents: 0 };
    const progress = calculateSharedGoalProgress(zeroGoal);
    expect(progress.progressPercent).toBe(0);
  });

  it('caps progress at 100%', () => {
    const overGoal: SharedGoal = { ...goal, currentCents: 150000_00 };
    const progress = calculateSharedGoalProgress(overGoal);
    expect(progress.progressPercent).toBe(100);
    expect(progress.remainingCents).toBe(0);
  });

  it('handles zero contributions', () => {
    const noContrib: SharedGoal = { ...goal, contributionACents: 0, contributionBCents: 0 };
    const progress = calculateSharedGoalProgress(noContrib);
    expect(progress.contributionAPercent).toBe(0);
    expect(progress.contributionBPercent).toBe(0);
  });
});

describe('calculateAllSharedGoalProgress', () => {
  it('processes multiple goals', () => {
    const goals: SharedGoal[] = [
      {
        id: 'g1',
        name: 'Goal 1',
        targetCents: 100000_00,
        currentCents: 50000_00,
        contributionACents: 30000_00,
        contributionBCents: 20000_00,
        targetDate: null,
      },
      {
        id: 'g2',
        name: 'Goal 2',
        targetCents: 50000_00,
        currentCents: 50000_00,
        contributionACents: 25000_00,
        contributionBCents: 25000_00,
        targetDate: null,
      },
    ];
    const results = calculateAllSharedGoalProgress(goals);
    expect(results).toHaveLength(2);
    expect(results[0]!.progressPercent).toBe(50);
    expect(results[1]!.progressPercent).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Wealth milestones
// ---------------------------------------------------------------------------

describe('getReachedMilestones', () => {
  it('returns milestones below net worth', () => {
    const reached = getReachedMilestones(150000_00); // $150K
    expect(reached).toContain(100000_00);
    expect(reached).toContain(50000_00);
    expect(reached).not.toContain(250000_00);
  });

  it('returns empty for zero net worth', () => {
    expect(getReachedMilestones(0)).toHaveLength(0);
  });
});

describe('getNextMilestone', () => {
  it('returns next milestone', () => {
    expect(getNextMilestone(75000_00)).toBe(100000_00);
  });

  it('returns null when all milestones reached', () => {
    expect(getNextMilestone(999999999_00)).toBeNull();
  });

  it('returns first milestone for zero', () => {
    expect(getNextMilestone(0)).toBe(WEALTH_MILESTONES_CENTS[0]);
  });
});

describe('getMilestoneProgress', () => {
  it('calculates progress between milestones', () => {
    const progress = getMilestoneProgress(75000_00); // Between $50K and $100K
    expect(progress.nextMilestoneCents).toBe(100000_00);
    expect(progress.previousMilestoneCents).toBe(50000_00);
    expect(progress.remainingCents).toBe(25000_00);
    expect(progress.progressPercent).toBe(50);
  });

  it('returns 100% when all milestones reached', () => {
    const progress = getMilestoneProgress(999999999_00);
    expect(progress.nextMilestoneCents).toBeNull();
    expect(progress.progressPercent).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Partner contributions
// ---------------------------------------------------------------------------

describe('calculatePartnerContributions', () => {
  it('calculates effective contributions with joint split', () => {
    const netWorth = calculateJointNetWorth(sampleAssets, sampleLiabilities);
    const contributions = calculatePartnerContributions(netWorth);

    expect(contributions.partnerAPercent + contributions.partnerBPercent).toBeCloseTo(100, 0);
    expect(contributions.partnerAEffectiveCents + contributions.partnerBEffectiveCents).toBe(
      netWorth.netWorthCents,
    );
  });

  it('returns 50/50 for zero total', () => {
    const zeroNetWorth = calculateJointNetWorth([], []);
    const contributions = calculatePartnerContributions(zeroNetWorth);
    expect(contributions.partnerAPercent).toBe(50);
    expect(contributions.partnerBPercent).toBe(50);
  });
});
