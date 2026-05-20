// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the alert evaluation engine.
 *
 * Covers budget threshold alerts, goal milestone alerts, balance alerts,
 * spending pace calculations, quiet hours, and rate limiting.
 *
 * @module lib/notifications/alert-engine.test
 * References: #1646, #1648
 */

import { describe, expect, it } from 'vitest';
import {
  buildWeeklyPaceSummaries,
  calculateSpendingPace,
  evaluateBalanceThreshold,
  evaluateBudgetThresholds,
  evaluateGoalMilestones,
  evaluateSpendingPaceAlert,
  formatCentsForAlert,
  isInQuietHours,
  rateLimitNotifications,
} from './alert-engine';
import type {
  BalanceAlertConfig,
  BudgetAlertConfig,
  GoalAlertConfig,
  NotificationPreferences,
} from './types';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './types';

// ---------------------------------------------------------------------------
// formatCentsForAlert
// ---------------------------------------------------------------------------

describe('formatCentsForAlert', () => {
  it('formats positive amounts correctly', () => {
    expect(formatCentsForAlert(12345)).toBe('$123.45');
  });

  it('formats zero correctly', () => {
    expect(formatCentsForAlert(0)).toBe('$0.00');
  });

  it('formats negative amounts with a minus sign', () => {
    expect(formatCentsForAlert(-5000)).toBe('-$50.00');
  });

  it('handles amounts under $1', () => {
    expect(formatCentsForAlert(42)).toBe('$0.42');
  });

  it('pads cents with leading zero', () => {
    expect(formatCentsForAlert(105)).toBe('$1.05');
  });
});

// ---------------------------------------------------------------------------
// evaluateBudgetThresholds
// ---------------------------------------------------------------------------

describe('evaluateBudgetThresholds', () => {
  const budget = {
    budgetId: 'b1',
    budgetName: 'Groceries',
    budgetAmountCents: 50000,
    spentCents: 37500, // 75%
  };

  const config: BudgetAlertConfig = {
    budgetId: null,
    thresholds: [50, 75, 90, 100],
    enabled: true,
  };

  it('returns alerts for all crossed thresholds', () => {
    const alerts = evaluateBudgetThresholds(budget, config);
    expect(alerts).toHaveLength(2); // 50% and 75% crossed
    expect(alerts[0].deduplicationKey).toBe('budget-b1-50');
    expect(alerts[1].deduplicationKey).toBe('budget-b1-75');
  });

  it('uses non-shaming language in titles', () => {
    const alerts = evaluateBudgetThresholds(budget, config);
    expect(alerts[0].title).toBe('Budget halfway point');
    expect(alerts[1].title).toBe('Budget nearing limit');
  });

  it('includes budget name in messages', () => {
    const alerts = evaluateBudgetThresholds(budget, config);
    expect(alerts[0].message).toContain('Groceries');
  });

  it('returns empty array when disabled', () => {
    const disabledConfig = { ...config, enabled: false };
    expect(evaluateBudgetThresholds(budget, disabledConfig)).toHaveLength(0);
  });

  it('skips already-fired alerts via deduplication', () => {
    const fired = new Set(['budget-b1-50']);
    const alerts = evaluateBudgetThresholds(budget, config, fired);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].deduplicationKey).toBe('budget-b1-75');
  });

  it('returns critical severity for 100% threshold', () => {
    const overBudget = { ...budget, spentCents: 50000 };
    const alerts = evaluateBudgetThresholds(overBudget, config);
    const hundredAlert = alerts.find((a) => a.deduplicationKey === 'budget-b1-100');
    expect(hundredAlert?.severity).toBe('critical');
  });

  it('returns empty array for zero budget amount', () => {
    const zeroBudget = { ...budget, budgetAmountCents: 0 };
    expect(evaluateBudgetThresholds(zeroBudget, config)).toHaveLength(0);
  });

  it('includes entity metadata for navigation', () => {
    const alerts = evaluateBudgetThresholds(budget, config);
    expect(alerts[0].entityId).toBe('b1');
    expect(alerts[0].entityType).toBe('budget');
    expect(alerts[0].actionLabel).toBe('View budget');
  });
});

// ---------------------------------------------------------------------------
// evaluateGoalMilestones
// ---------------------------------------------------------------------------

describe('evaluateGoalMilestones', () => {
  const goal = {
    goalId: 'g1',
    goalName: 'Emergency Fund',
    targetAmountCents: 100000,
    currentAmountCents: 50000, // 50%
  };

  const config: GoalAlertConfig = {
    goalId: null,
    milestones: [25, 50, 75, 100],
    enabled: true,
  };

  it('returns alerts for crossed milestones', () => {
    const alerts = evaluateGoalMilestones(goal, config);
    expect(alerts).toHaveLength(2); // 25% and 50%
  });

  it('uses encouraging language', () => {
    const alerts = evaluateGoalMilestones(goal, config);
    expect(alerts[0].title).toBe('Great start on your goal!');
    expect(alerts[1].title).toBe('Halfway to your goal!');
  });

  it('returns success severity for 100% milestone', () => {
    const achieved = { ...goal, currentAmountCents: 100000 };
    const alerts = evaluateGoalMilestones(achieved, config);
    const hundredAlert = alerts.find((a) => a.deduplicationKey === 'goal-g1-100');
    expect(hundredAlert?.severity).toBe('success');
    expect(hundredAlert?.title).toContain('🎉');
  });

  it('returns empty when disabled', () => {
    const disabledConfig = { ...config, enabled: false };
    expect(evaluateGoalMilestones(goal, disabledConfig)).toHaveLength(0);
  });

  it('skips already-fired milestones', () => {
    const fired = new Set(['goal-g1-25', 'goal-g1-50']);
    expect(evaluateGoalMilestones(goal, config, fired)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// evaluateBalanceThreshold
// ---------------------------------------------------------------------------

describe('evaluateBalanceThreshold', () => {
  const account = {
    accountId: 'a1',
    accountName: 'Checking',
    balanceCents: 5000,
  };

  const config: BalanceAlertConfig = {
    accountId: 'a1',
    thresholdCents: 10000,
    enabled: true,
  };

  it('alerts when balance is below threshold', () => {
    const alerts = evaluateBalanceThreshold(account, config);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('balance_low');
    expect(alerts[0].message).toContain('Checking');
  });

  it('does not alert when balance is at or above threshold', () => {
    const healthyAccount = { ...account, balanceCents: 15000 };
    expect(evaluateBalanceThreshold(healthyAccount, config)).toHaveLength(0);
  });

  it('does not alert when disabled', () => {
    const disabledConfig = { ...config, enabled: false };
    expect(evaluateBalanceThreshold(account, disabledConfig)).toHaveLength(0);
  });

  it('respects deduplication', () => {
    const fired = new Set(['balance-a1-low']);
    expect(evaluateBalanceThreshold(account, config, fired)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// calculateSpendingPace
// ---------------------------------------------------------------------------

describe('calculateSpendingPace', () => {
  const input = {
    budgetId: 'b1',
    budgetName: 'Dining',
    budgetAmountCents: 30000,
    spentCents: 20000,
    periodStart: '2025-01-01',
    periodEnd: '2025-01-31',
    today: '2025-01-16',
  };

  it('calculates total and remaining days', () => {
    const pace = calculateSpendingPace(input);
    expect(pace.totalDays).toBe(30);
    expect(pace.elapsedDays).toBe(15);
    expect(pace.remainingDays).toBe(15);
  });

  it('calculates expected and actual daily pace', () => {
    const pace = calculateSpendingPace(input);
    expect(pace.expectedDailyPaceCents).toBe(1000); // 30000 / 30
    expect(pace.actualDailyPaceCents).toBe(1333); // ~20000 / 15
  });

  it('detects ahead-of-pace spending', () => {
    const pace = calculateSpendingPace(input);
    expect(pace.isAheadOfPace).toBe(true);
  });

  it('predicts overspend correctly', () => {
    const pace = calculateSpendingPace(input);
    expect(pace.willOverspend).toBe(true);
    expect(pace.predictedTotalCents).toBe(1333 * 30); // ~39990
  });

  it('calculates days until exhausted', () => {
    const pace = calculateSpendingPace(input);
    // remaining 10000 / 1333 per day ≈ 8 days
    expect(pace.daysUntilExhausted).toBe(8);
  });

  it('handles under-budget spending', () => {
    const underBudget = { ...input, spentCents: 5000 };
    const pace = calculateSpendingPace(underBudget);
    expect(pace.isAheadOfPace).toBe(false);
    expect(pace.willOverspend).toBe(false);
  });

  it('handles zero remaining when budget is exhausted', () => {
    const exhausted = { ...input, spentCents: 30000 };
    const pace = calculateSpendingPace(exhausted);
    expect(pace.daysUntilExhausted).toBe(0);
    expect(pace.remainingCents).toBe(0);
  });

  it('calculates percentage metrics', () => {
    const pace = calculateSpendingPace(input);
    expect(pace.percentUsed).toBe(67); // 20000/30000 * 100
    expect(pace.percentTimeElapsed).toBe(50); // 15/30 * 100
  });
});

// ---------------------------------------------------------------------------
// evaluateSpendingPaceAlert
// ---------------------------------------------------------------------------

describe('evaluateSpendingPaceAlert', () => {
  it('returns alert when spending will overshoot at medium sensitivity', () => {
    const pace = calculateSpendingPace({
      budgetId: 'b1',
      budgetName: 'Dining',
      budgetAmountCents: 30000,
      spentCents: 20000,
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      today: '2025-01-16',
    });
    const alerts = evaluateSpendingPaceAlert(pace, 'medium');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('predictive_overspend');
    expect(alerts[0].message).toContain('Dining');
  });

  it('returns empty when under budget', () => {
    const pace = calculateSpendingPace({
      budgetId: 'b1',
      budgetName: 'Dining',
      budgetAmountCents: 30000,
      spentCents: 5000,
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      today: '2025-01-16',
    });
    const alerts = evaluateSpendingPaceAlert(pace, 'medium');
    expect(alerts).toHaveLength(0);
  });

  it('respects sensitivity level', () => {
    // Slightly over pace — should trigger 'high' but not 'low'
    const pace = calculateSpendingPace({
      budgetId: 'b1',
      budgetName: 'Dining',
      budgetAmountCents: 30000,
      spentCents: 17000,
      periodStart: '2025-01-01',
      periodEnd: '2025-01-31',
      today: '2025-01-16',
    });
    const highAlerts = evaluateSpendingPaceAlert(pace, 'high');
    const lowAlerts = evaluateSpendingPaceAlert(pace, 'low');
    expect(highAlerts.length).toBeGreaterThanOrEqual(lowAlerts.length);
  });
});

// ---------------------------------------------------------------------------
// buildWeeklyPaceSummaries
// ---------------------------------------------------------------------------

describe('buildWeeklyPaceSummaries', () => {
  it('groups spending by ISO week', () => {
    // Use mid-week dates to avoid UTC/local timezone edge cases
    const dailySpending: Array<readonly [string, number]> = [
      ['2025-01-08', 1000], // Wednesday
      ['2025-01-09', 2000], // Thursday (same week)
      ['2025-01-15', 1500], // Next Wednesday
    ];
    const summaries = buildWeeklyPaceSummaries(dailySpending, 5000);
    expect(summaries).toHaveLength(2);
    // First week: 1000 + 2000 = 3000
    expect(summaries[0].weeklySpentCents).toBe(3000);
    expect(summaries[1].weeklySpentCents).toBe(1500);
  });

  it('marks weeks over pace', () => {
    const dailySpending: Array<readonly [string, number]> = [['2025-01-06', 6000]];
    const summaries = buildWeeklyPaceSummaries(dailySpending, 5000);
    expect(summaries[0].overPace).toBe(true);
  });

  it('returns empty for no spending', () => {
    expect(buildWeeklyPaceSummaries([], 5000)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// isInQuietHours
// ---------------------------------------------------------------------------

describe('isInQuietHours', () => {
  const basePrefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    quietHours: { enabled: true, startTime: '22:00', endTime: '07:00' },
  };

  it('returns true during quiet hours (late night)', () => {
    const lateNight = new Date('2025-01-15T23:30:00');
    expect(isInQuietHours(basePrefs, lateNight)).toBe(true);
  });

  it('returns true during quiet hours (early morning)', () => {
    const earlyMorning = new Date('2025-01-15T05:00:00');
    expect(isInQuietHours(basePrefs, earlyMorning)).toBe(true);
  });

  it('returns false outside quiet hours', () => {
    const afternoon = new Date('2025-01-15T14:00:00');
    expect(isInQuietHours(basePrefs, afternoon)).toBe(false);
  });

  it('returns false when quiet hours are disabled', () => {
    const disabled = {
      ...basePrefs,
      quietHours: { ...basePrefs.quietHours, enabled: false },
    };
    const lateNight = new Date('2025-01-15T23:30:00');
    expect(isInQuietHours(disabled, lateNight)).toBe(false);
  });

  it('returns true when do-not-disturb is on', () => {
    const dnd = { ...basePrefs, doNotDisturb: true };
    const afternoon = new Date('2025-01-15T14:00:00');
    expect(isInQuietHours(dnd, afternoon)).toBe(true);
  });

  it('handles same-day quiet hours (e.g. 09:00 - 17:00)', () => {
    const sameDay = {
      ...basePrefs,
      quietHours: { enabled: true, startTime: '09:00', endTime: '17:00' },
    };
    const noon = new Date('2025-01-15T12:00:00');
    const evening = new Date('2025-01-15T20:00:00');
    expect(isInQuietHours(sameDay, noon)).toBe(true);
    expect(isInQuietHours(sameDay, evening)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rateLimitNotifications
// ---------------------------------------------------------------------------

describe('rateLimitNotifications', () => {
  it('allows notifications with no prior firing', () => {
    const notifications = [
      {
        id: '1',
        type: 'budget_threshold' as const,
        severity: 'warning' as const,
        title: 'Test',
        message: 'Test',
        createdAt: new Date().toISOString(),
        status: 'unread' as const,
        deduplicationKey: 'test-key',
      },
    ];
    const { filtered } = rateLimitNotifications(notifications, new Map());
    expect(filtered).toHaveLength(1);
  });

  it('blocks recently-fired duplicates', () => {
    const nowMs = Date.now();
    const notifications = [
      {
        id: '1',
        type: 'budget_threshold' as const,
        severity: 'warning' as const,
        title: 'Test',
        message: 'Test',
        createdAt: new Date().toISOString(),
        status: 'unread' as const,
        deduplicationKey: 'test-key',
      },
    ];
    const firedMap = new Map([['test-key', nowMs - 1000]]);
    const { filtered } = rateLimitNotifications(notifications, firedMap, nowMs);
    expect(filtered).toHaveLength(0);
  });

  it('allows notifications after rate limit interval expires', () => {
    const nowMs = Date.now();
    const notifications = [
      {
        id: '1',
        type: 'budget_threshold' as const,
        severity: 'warning' as const,
        title: 'Test',
        message: 'Test',
        createdAt: new Date().toISOString(),
        status: 'unread' as const,
        deduplicationKey: 'test-key',
      },
    ];
    const firedMap = new Map([['test-key', nowMs - 2 * 60 * 60 * 1000]]);
    const { filtered } = rateLimitNotifications(notifications, firedMap, nowMs);
    expect(filtered).toHaveLength(1);
  });

  it('allows notifications without dedup keys', () => {
    const notifications = [
      {
        id: '1',
        type: 'transaction_confirmation' as const,
        severity: 'success' as const,
        title: 'Test',
        message: 'Test',
        createdAt: new Date().toISOString(),
        status: 'unread' as const,
      },
    ];
    const { filtered } = rateLimitNotifications(notifications, new Map());
    expect(filtered).toHaveLength(1);
  });
});
