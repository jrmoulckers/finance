// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import {
  allocateEven,
  allocateProportionally,
  buildContributorProgress,
  buildMilestoneProgress,
  householdPercentComplete,
  monthsUntil,
  relativeEffortLabel,
  suggestedMonthlyContributions,
  summarizeSharedGoal,
  totalContributedCents,
  type GoalContributor,
  type GoalMilestone,
} from './shared-goal';

const sum = (values: readonly number[]): number => values.reduce((acc, value) => acc + value, 0);

describe('allocateEven', () => {
  it('splits exactly with no lost or created cents', () => {
    const parts = allocateEven(100, 3);
    expect(parts).toEqual([34, 33, 33]);
    expect(sum(parts)).toBe(100);
  });

  it('returns an empty array for non-positive counts', () => {
    expect(allocateEven(100, 0)).toEqual([]);
  });

  it('handles a zero total', () => {
    expect(allocateEven(0, 4)).toEqual([0, 0, 0, 0]);
  });
});

describe('allocateProportionally', () => {
  it('allocates by weight and preserves the exact total', () => {
    const parts = allocateProportionally(1000, [3, 1]);
    expect(sum(parts)).toBe(1000);
    expect(parts).toEqual([750, 250]);
  });

  it('never loses or creates a cent on awkward divisions', () => {
    const parts = allocateProportionally(100, [1, 1, 1]);
    expect(sum(parts)).toBe(100);
    // Largest-remainder hands the spare cent to the first bucket deterministically.
    expect(parts).toEqual([34, 33, 33]);
  });

  it('distributes remainder cents by largest fractional part', () => {
    // 10 cents across weights 1,1,1 -> floors [3,3,3] sum 9, one spare cent.
    const parts = allocateProportionally(10, [1, 1, 1]);
    expect(sum(parts)).toBe(10);
    expect(parts).toEqual([4, 3, 3]);
  });

  it('falls back to an even split when all weights are zero', () => {
    const parts = allocateProportionally(100, [0, 0]);
    expect(parts).toEqual([50, 50]);
    expect(sum(parts)).toBe(100);
  });

  it('treats negative or invalid weights as zero', () => {
    const parts = allocateProportionally(90, [-5, 10, 20]);
    expect(sum(parts)).toBe(90);
    expect(parts[0]).toBe(0);
  });

  it('returns an empty array when there are no weights', () => {
    expect(allocateProportionally(100, [])).toEqual([]);
  });
});

describe('totalContributedCents & householdPercentComplete', () => {
  const contributors: GoalContributor[] = [
    { id: 'a', name: 'Alex', contributedCents: 300000 },
    { id: 'b', name: 'Bailey', contributedCents: 200000 },
  ];

  it('sums contributor amounts', () => {
    expect(totalContributedCents(contributors)).toBe(500000);
  });

  it('ignores negative/invalid contributions when summing', () => {
    expect(
      totalContributedCents([
        { id: 'a', name: 'Alex', contributedCents: -100 },
        { id: 'b', name: 'Bailey', contributedCents: 250 },
      ]),
    ).toBe(250);
  });

  it('computes capped household percentage', () => {
    expect(householdPercentComplete(2000000, contributors)).toBe(25);
  });

  it('caps the household percentage at 100', () => {
    expect(householdPercentComplete(100, [{ id: 'a', name: 'Alex', contributedCents: 500 }])).toBe(
      100,
    );
  });

  it('returns 0 for a zero target with no contributions', () => {
    expect(householdPercentComplete(0, [])).toBe(0);
  });
});

describe('buildContributorProgress', () => {
  const contributors: GoalContributor[] = [
    { id: 'a', name: 'Alex', contributedCents: 600000 },
    { id: 'b', name: 'Bailey', contributedCents: 400000 },
  ];

  it('shares always sum to exactly 10000 basis points', () => {
    const progress = buildContributorProgress([
      { id: 'a', name: 'A', contributedCents: 1 },
      { id: 'b', name: 'B', contributedCents: 1 },
      { id: 'c', name: 'C', contributedCents: 1 },
    ]);
    expect(sum(progress.map((p) => p.shareBps))).toBe(10000);
  });

  it('exposes exact amounts in detailed mode', () => {
    const progress = buildContributorProgress(contributors, 'detailed');
    expect(progress[0].contributedCents).toBe(600000);
    expect(progress[1].contributedCents).toBe(400000);
    expect(progress[0].sharePercent).toBe(60);
    expect(progress[1].sharePercent).toBe(40);
  });

  it('withholds exact amounts in summarized mode but keeps relative effort', () => {
    const progress = buildContributorProgress(contributors, 'summarized');
    expect(progress[0].contributedCents).toBeNull();
    expect(progress[1].contributedCents).toBeNull();
    // Relative effort/share are still available for "relative effort" display.
    expect(progress[0].sharePercent).toBe(60);
    expect(progress[0].relativeEffort).toBe('leading');
    expect(progress[1].relativeEffort).toBe('catching-up');
  });

  it('marks even contributors as on-track', () => {
    const progress = buildContributorProgress([
      { id: 'a', name: 'A', contributedCents: 1000 },
      { id: 'b', name: 'B', contributedCents: 1000 },
    ]);
    expect(progress.every((p) => p.relativeEffort === 'on-track')).toBe(true);
  });

  it('treats a sole contributor as on-track', () => {
    const progress = buildContributorProgress([{ id: 'a', name: 'A', contributedCents: 1000 }]);
    expect(progress[0].relativeEffort).toBe('on-track');
    expect(progress[0].shareBps).toBe(10000);
  });

  it('returns zero shares when nothing has been contributed', () => {
    const progress = buildContributorProgress([
      { id: 'a', name: 'A', contributedCents: 0 },
      { id: 'b', name: 'B', contributedCents: 0 },
    ]);
    expect(progress.map((p) => p.shareBps)).toEqual([0, 0]);
  });

  it('returns an empty array for no contributors', () => {
    expect(buildContributorProgress([])).toEqual([]);
  });
});

describe('buildMilestoneProgress', () => {
  const milestones: GoalMilestone[] = [
    { id: 'down', label: 'Down payment', amountCents: 4000000 },
    { id: 'closing', label: 'Closing costs', amountCents: 1500000 },
    { id: 'buffer', label: 'Emergency buffer', amountCents: 1000000 },
  ];

  it('funds checkpoints waterfall-style in order', () => {
    const progress = buildMilestoneProgress(4500000, milestones);

    expect(progress[0]).toMatchObject({
      fundedCents: 4000000,
      status: 'complete',
      percentComplete: 100,
    });
    expect(progress[1]).toMatchObject({ fundedCents: 500000, status: 'in-progress' });
    expect(progress[1].percentComplete).toBe(33);
    expect(progress[1].remainingCents).toBe(1000000);
    expect(progress[2]).toMatchObject({ fundedCents: 0, status: 'upcoming', percentComplete: 0 });
  });

  it('marks every checkpoint complete once fully funded', () => {
    const progress = buildMilestoneProgress(99999999, milestones);
    expect(progress.every((m) => m.status === 'complete')).toBe(true);
  });

  it('treats a zero-cost checkpoint as complete', () => {
    const progress = buildMilestoneProgress(0, [{ id: 'x', label: 'Free', amountCents: 0 }]);
    expect(progress[0].status).toBe('complete');
    expect(progress[0].percentComplete).toBe(100);
  });

  it('returns an empty array when there are no milestones', () => {
    expect(buildMilestoneProgress(1000, [])).toEqual([]);
  });
});

describe('suggestedMonthlyContributions', () => {
  const contributors: GoalContributor[] = [
    { id: 'a', name: 'Alex', contributedCents: 0, monthlyIncomeCents: 600000 },
    { id: 'b', name: 'Bailey', contributedCents: 0, monthlyIncomeCents: 400000 },
  ];

  it('rounds the household monthly target up so the goal is met', () => {
    const plan = suggestedMonthlyContributions(1000, 3, contributors);
    // ceil(1000 / 3) = 334
    expect(plan.householdMonthlyCents).toBe(334);
    expect(plan.months).toBe(3);
  });

  it('per-person amounts sum exactly to the household monthly target (even)', () => {
    const plan = suggestedMonthlyContributions(1000, 3, contributors);
    expect(sum(plan.perPerson.map((p) => p.monthlyCents))).toBe(plan.householdMonthlyCents);
    expect(plan.incomeWeighted).toBe(false);
  });

  it('weights by income when requested and incomes are present', () => {
    const plan = suggestedMonthlyContributions(1000000, 10, contributors, { incomeWeighted: true });
    expect(plan.incomeWeighted).toBe(true);
    expect(sum(plan.perPerson.map((p) => p.monthlyCents))).toBe(plan.householdMonthlyCents);
    // 60/40 income split of 100000 cents.
    expect(plan.perPerson[0].monthlyCents).toBe(60000);
    expect(plan.perPerson[1].monthlyCents).toBe(40000);
  });

  it('falls back to an even split when income data is incomplete', () => {
    const plan = suggestedMonthlyContributions(
      1000000,
      10,
      [
        { id: 'a', name: 'Alex', contributedCents: 0, monthlyIncomeCents: 600000 },
        { id: 'b', name: 'Bailey', contributedCents: 0, monthlyIncomeCents: null },
      ],
      { incomeWeighted: true },
    );
    expect(plan.incomeWeighted).toBe(false);
    expect(plan.perPerson[0].monthlyCents).toBe(plan.perPerson[1].monthlyCents);
  });

  it('clamps months to at least 1', () => {
    const plan = suggestedMonthlyContributions(5000, 0, contributors);
    expect(plan.months).toBe(1);
    expect(plan.householdMonthlyCents).toBe(5000);
  });

  it('returns no per-person rows when there are no contributors', () => {
    const plan = suggestedMonthlyContributions(5000, 5, []);
    expect(plan.perPerson).toEqual([]);
  });
});

describe('monthsUntil', () => {
  it('counts whole months', () => {
    expect(monthsUntil('2025-01-01', '2025-04-01')).toBe(3);
  });

  it('rounds up a partial month', () => {
    expect(monthsUntil('2025-01-01', '2025-04-15')).toBe(4);
  });

  it('clamps to at least 1 month', () => {
    expect(monthsUntil('2025-04-01', '2025-01-01')).toBe(1);
  });

  it('returns null for invalid input', () => {
    expect(monthsUntil('not-a-date', '2025-01-01')).toBeNull();
  });
});

describe('summarizeSharedGoal', () => {
  const contributors: GoalContributor[] = [
    { id: 'a', name: 'Alex', contributedCents: 3000000 },
    { id: 'b', name: 'Bailey', contributedCents: 2000000 },
  ];
  const milestones: GoalMilestone[] = [
    { id: 'down', label: 'Down payment', amountCents: 4000000 },
    { id: 'closing', label: 'Closing costs', amountCents: 1500000 },
  ];

  it('summarizes household totals, contributors and milestones in detailed mode', () => {
    const summary = summarizeSharedGoal(8000000, contributors, milestones, 'detailed');
    expect(summary.contributedCents).toBe(5000000);
    expect(summary.remainingCents).toBe(3000000);
    expect(summary.householdPercentComplete).toBe(63);
    expect(summary.contributors[0].contributedCents).toBe(3000000);
    expect(summary.milestones[0].status).toBe('complete');
    expect(summary.milestones[1].status).toBe('in-progress');
  });

  it('hides exact partner amounts in summarized mode', () => {
    const summary = summarizeSharedGoal(8000000, contributors, milestones, 'summarized');
    expect(summary.contributedCents).toBe(5000000);
    expect(summary.contributors.every((c) => c.contributedCents === null)).toBe(true);
  });

  it('defaults to detailed privacy and no milestones', () => {
    const summary = summarizeSharedGoal(1000, contributors);
    expect(summary.privacy).toBe('detailed');
    expect(summary.milestones).toEqual([]);
  });
});

describe('relativeEffortLabel', () => {
  it('maps effort values to readable text', () => {
    expect(relativeEffortLabel('leading')).toBe('Leading');
    expect(relativeEffortLabel('catching-up')).toBe('Catching up');
    expect(relativeEffortLabel('on-track')).toBe('On track');
  });
});
