// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';

import type { Goal, GoalStatus } from '../../kmp/bridge';
import { formatGoalStatusLabel, getGoalDueStatus, getGoalProgress } from './progress';

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    householdId: 'household-1',
    name: 'Emergency Fund',
    description: null,
    targetAmount: { amount: 200000 },
    currentAmount: { amount: 100000 },
    currency: { code: 'USD', decimalPlaces: 2 },
    targetDate: null,
    status: 'ACTIVE',
    icon: null,
    color: null,
    accountId: null,
    sortOrder: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    deletedAt: null,
    syncVersion: 1,
    isSynced: true,
    ...overrides,
  };
}

describe('getGoalProgress', () => {
  it('computes an exact whole percentage', () => {
    const progress = getGoalProgress(
      makeGoal({ targetAmount: { amount: 200000 }, currentAmount: { amount: 150000 } }),
    );
    expect(progress.displayPercent).toBe(75);
    expect(progress.isComplete).toBe(false);
    expect(progress.remainingCents).toBe(50000);
    expect(progress.overageCents).toBe(0);
  });

  it('does not report completion when a rounded percentage would reach 100 (item 1)', () => {
    // 99.6% would round to 100 but the goal is not funded.
    const progress = getGoalProgress(
      makeGoal({ targetAmount: { amount: 100000 }, currentAmount: { amount: 99600 } }),
    );
    expect(progress.isComplete).toBe(false);
    expect(progress.displayPercent).toBe(99);
    expect(progress.remainingCents).toBe(400);
  });

  it('reports completion when saved meets or exceeds the target', () => {
    const progress = getGoalProgress(
      makeGoal({ targetAmount: { amount: 100000 }, currentAmount: { amount: 100000 } }),
    );
    expect(progress.isComplete).toBe(true);
    expect(progress.displayPercent).toBe(100);
    expect(progress.remainingCents).toBe(0);
  });

  it('exposes the overage when over-funded (item 10)', () => {
    const progress = getGoalProgress(
      makeGoal({ targetAmount: { amount: 100000 }, currentAmount: { amount: 130000 } }),
    );
    expect(progress.isComplete).toBe(true);
    expect(progress.displayPercent).toBe(100);
    expect(progress.overageCents).toBe(30000);
  });

  it('treats an explicit COMPLETED status as complete', () => {
    const progress = getGoalProgress(
      makeGoal({
        status: 'COMPLETED',
        targetAmount: { amount: 100000 },
        currentAmount: { amount: 40000 },
      }),
    );
    expect(progress.isComplete).toBe(true);
    expect(progress.displayPercent).toBe(100);
  });

  it('handles a zero target without dividing by zero', () => {
    const progress = getGoalProgress(
      makeGoal({ targetAmount: { amount: 0 }, currentAmount: { amount: 0 } }),
    );
    expect(progress.rawPercent).toBe(0);
    expect(progress.displayPercent).toBe(0);
    expect(progress.isComplete).toBe(false);
  });
});

describe('getGoalDueStatus', () => {
  const now = new Date('2025-06-15T12:00:00Z').getTime();

  it('returns no-date state when target date is null', () => {
    const status = getGoalDueStatus(null, now);
    expect(status.hasDate).toBe(false);
    expect(status.daysDelta).toBeNull();
    expect(status.isPastDue).toBe(false);
  });

  it('reports a positive delta for a future date', () => {
    const status = getGoalDueStatus('2025-06-25', now);
    expect(status.daysDelta).toBeGreaterThan(0);
    expect(status.isPastDue).toBe(false);
    expect(status.isDueToday).toBe(false);
  });

  it('flags an overdue goal as past due (item 2)', () => {
    const status = getGoalDueStatus('2025-06-01', now);
    expect(status.daysDelta).toBeLessThan(0);
    expect(status.isPastDue).toBe(true);
    expect(status.isDueToday).toBe(false);
  });

  it('flags a goal due today distinctly from past due', () => {
    const status = getGoalDueStatus('2025-06-15', now);
    expect(status.daysDelta).toBe(0);
    expect(status.isDueToday).toBe(true);
    expect(status.isPastDue).toBe(false);
  });
});

describe('formatGoalStatusLabel', () => {
  it('capitalises every known status', () => {
    const cases: Array<[GoalStatus, string]> = [
      ['ACTIVE', 'Active'],
      ['PAUSED', 'Paused'],
      ['COMPLETED', 'Completed'],
      ['CANCELLED', 'Cancelled'],
    ];
    for (const [status, label] of cases) {
      expect(formatGoalStatusLabel(status)).toBe(label);
    }
  });
});
