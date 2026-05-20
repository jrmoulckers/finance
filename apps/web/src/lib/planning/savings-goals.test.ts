// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for savings goal tracking utilities.
 *
 * References: #1644
 */

import { describe, it, expect } from 'vitest';
import {
  calculateProgress,
  generateMilestones,
  calculateMonthlyPace,
  projectCompletionDate,
  buildLinkedGoal,
} from './savings-goals';
import type { GoalContribution } from './types';

// ---------------------------------------------------------------------------
// calculateProgress
// ---------------------------------------------------------------------------

describe('calculateProgress', () => {
  it('returns 0 when target is 0', () => {
    expect(calculateProgress(5000, 0)).toBe(0);
  });

  it('returns 50 when halfway', () => {
    expect(calculateProgress(50000, 100000)).toBe(50);
  });

  it('caps at 100 when current exceeds target', () => {
    expect(calculateProgress(120000, 100000)).toBe(100);
  });

  it('rounds to nearest integer', () => {
    expect(calculateProgress(33333, 100000)).toBe(33);
  });

  it('returns 0 when nothing saved', () => {
    expect(calculateProgress(0, 100000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateMilestones
// ---------------------------------------------------------------------------

describe('generateMilestones', () => {
  it('marks all milestones as not reached at 0%', () => {
    const milestones = generateMilestones(0, 100000);
    expect(milestones).toHaveLength(4);
    expect(milestones.every((m) => !m.reached)).toBe(true);
  });

  it('marks 25% milestone as reached at 30%', () => {
    const milestones = generateMilestones(30000, 100000);
    expect(milestones[0].reached).toBe(true);
    expect(milestones[0].percent).toBe(25);
    expect(milestones[1].reached).toBe(false);
  });

  it('marks all milestones as reached at 100%', () => {
    const milestones = generateMilestones(100000, 100000);
    expect(milestones.every((m) => m.reached)).toBe(true);
  });

  it('includes celebration labels', () => {
    const milestones = generateMilestones(100000, 100000);
    expect(milestones[3].label).toContain('complete');
  });

  it('dates milestones from contribution history', () => {
    const contributions: GoalContribution[] = [
      { date: '2024-01-01', amountCents: 10000, runningTotalCents: 10000 },
      { date: '2024-02-01', amountCents: 20000, runningTotalCents: 30000 },
    ];
    const milestones = generateMilestones(30000, 100000, contributions);
    expect(milestones[0].reachedDate).toBe('2024-02-01');
  });
});

// ---------------------------------------------------------------------------
// calculateMonthlyPace
// ---------------------------------------------------------------------------

describe('calculateMonthlyPace', () => {
  it('returns 0 with no contributions', () => {
    expect(calculateMonthlyPace([])).toBe(0);
  });

  it('returns the single contribution amount with 1 entry', () => {
    const result = calculateMonthlyPace([
      { date: '2024-01-01', amountCents: 50000, runningTotalCents: 50000 },
    ]);
    expect(result).toBe(50000);
  });

  it('calculates average monthly pace from history', () => {
    // 3 months of contributions totaling $600
    const contributions: GoalContribution[] = [
      { date: '2024-01-01', amountCents: 20000, runningTotalCents: 20000 },
      { date: '2024-02-01', amountCents: 20000, runningTotalCents: 40000 },
      { date: '2024-04-01', amountCents: 20000, runningTotalCents: 60000 },
    ];
    const pace = calculateMonthlyPace(contributions);
    // ~$600 over ~3 months ≈ $200/month
    expect(pace).toBeGreaterThan(15000);
    expect(pace).toBeLessThan(25000);
  });
});

// ---------------------------------------------------------------------------
// projectCompletionDate
// ---------------------------------------------------------------------------

describe('projectCompletionDate', () => {
  it('returns today if already complete', () => {
    const result = projectCompletionDate(100000, 100000, 10000);
    expect(result).toBeTruthy();
  });

  it('returns null if pace is zero', () => {
    const result = projectCompletionDate(50000, 100000, 0);
    expect(result).toBeNull();
  });

  it('projects a future date for positive pace', () => {
    const result = projectCompletionDate(50000, 100000, 10000);
    expect(result).toBeTruthy();
    // Should be about 5 months from now
    const projected = new Date(result!);
    const now = new Date();
    const monthsDiff =
      (projected.getFullYear() - now.getFullYear()) * 12 + (projected.getMonth() - now.getMonth());
    expect(monthsDiff).toBeGreaterThanOrEqual(4);
    expect(monthsDiff).toBeLessThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// buildLinkedGoal
// ---------------------------------------------------------------------------

describe('buildLinkedGoal', () => {
  it('builds a complete linked goal with account data', () => {
    const contributions: GoalContribution[] = [
      { date: '2024-01-01', amountCents: 25000, runningTotalCents: 25000 },
      { date: '2024-02-01', amountCents: 25000, runningTotalCents: 50000 },
    ];

    const result = buildLinkedGoal(
      {
        id: 'g1',
        name: 'Vacation',
        targetCents: 200000,
        currentCents: 0,
        accountId: 'acct-1',
      },
      75000, // account balance overrides current
      'Travel Savings',
      contributions,
    );

    expect(result.goalId).toBe('g1');
    expect(result.currentCents).toBe(75000); // Uses account balance
    expect(result.accountName).toBe('Travel Savings');
    expect(result.progressPercent).toBe(38); // 75000/200000
    expect(result.milestones).toHaveLength(4);
    expect(result.milestones[0].reached).toBe(true); // 25% reached
  });

  it('uses goal currentCents when no account linked', () => {
    const result = buildLinkedGoal(
      {
        id: 'g2',
        name: 'Emergency Fund',
        targetCents: 1000000,
        currentCents: 500000,
        accountId: null,
      },
      null,
      null,
      [],
    );

    expect(result.currentCents).toBe(500000);
    expect(result.accountId).toBeNull();
    expect(result.progressPercent).toBe(50);
  });
});
