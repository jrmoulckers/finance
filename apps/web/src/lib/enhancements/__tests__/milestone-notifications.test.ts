import { describe, it, expect } from 'vitest';
import {
  detectNetWorthMilestones,
  generateNetWorthNotifications,
  generateGoalCompletionNotification,
  generateStreakNotification,
  dismissNotification,
  snoozeNotification,
  getActiveNotifications,
  getNetWorthMilestones,
} from '../milestone-notifications';

describe('milestone-notifications', () => {
  describe('detectNetWorthMilestones', () => {
    it('detects single milestone crossing', () => {
      const crossed = detectNetWorthMilestones(9_999_99, 10_000_00);
      expect(crossed).toEqual([10_000_00]);
    });

    it('detects multiple milestones at once', () => {
      const crossed = detectNetWorthMilestones(5_000_00, 100_000_00);
      expect(crossed).toContain(10_000_00);
      expect(crossed).toContain(50_000_00);
      expect(crossed).toContain(100_000_00);
      expect(crossed).toHaveLength(3);
    });

    it('returns empty when no milestone crossed', () => {
      expect(detectNetWorthMilestones(15_000_00, 20_000_00)).toHaveLength(0);
    });

    it('returns empty when net worth decreased', () => {
      expect(detectNetWorthMilestones(50_000_00, 40_000_00)).toHaveLength(0);
    });
  });

  describe('generateNetWorthNotifications', () => {
    it('generates notifications for crossed milestones', () => {
      const notifications = generateNetWorthNotifications(
        9_000_00,
        10_000_00,
        '2025-01-15T00:00:00Z',
      );
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('net_worth');
      expect(notifications[0].thresholdCents).toBe(10_000_00);
      expect(notifications[0].dismissed).toBe(false);
      expect(notifications[0].message).toContain('$10,000');
    });
  });

  describe('generateGoalCompletionNotification', () => {
    it('creates a goal completion notification', () => {
      const n = generateGoalCompletionNotification('g-1', 'Emergency Fund', '2025-01-15T00:00:00Z');
      expect(n.type).toBe('goal_completion');
      expect(n.message).toContain('Emergency Fund');
      expect(n.dismissed).toBe(false);
    });
  });

  describe('generateStreakNotification', () => {
    it('creates a streak milestone notification', () => {
      const n = generateStreakNotification('s-1', 30, 'days of saving', '2025-01-15T00:00:00Z');
      expect(n.type).toBe('streak');
      expect(n.streakCount).toBe(30);
      expect(n.message).toContain('30');
    });
  });

  describe('dismissNotification', () => {
    it('marks notification as dismissed', () => {
      const n = generateGoalCompletionNotification('g-1', 'Test', '2025-01-15T00:00:00Z');
      const dismissed = dismissNotification(n);
      expect(dismissed.dismissed).toBe(true);
    });
  });

  describe('snoozeNotification', () => {
    it('sets snooze date', () => {
      const n = generateGoalCompletionNotification('g-1', 'Test', '2025-01-15T00:00:00Z');
      const snoozed = snoozeNotification(n, '2025-01-20');
      expect(snoozed.snoozedUntil).toBe('2025-01-20');
    });
  });

  describe('getActiveNotifications', () => {
    it('filters out dismissed and snoozed notifications', () => {
      const n1 = generateGoalCompletionNotification('1', 'A', '2025-01-01T00:00:00Z');
      const n2 = dismissNotification(
        generateGoalCompletionNotification('2', 'B', '2025-01-01T00:00:00Z'),
      );
      const n3 = snoozeNotification(
        generateGoalCompletionNotification('3', 'C', '2025-01-01T00:00:00Z'),
        '2025-02-01',
      );
      const active = getActiveNotifications([n1, n2, n3], '2025-01-15');
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('1');
    });

    it('includes snoozed notification past snooze date', () => {
      const n = snoozeNotification(
        generateGoalCompletionNotification('1', 'A', '2025-01-01T00:00:00Z'),
        '2025-01-10',
      );
      const active = getActiveNotifications([n], '2025-01-15');
      expect(active).toHaveLength(1);
    });
  });

  describe('getNetWorthMilestones', () => {
    it('returns standard milestones in integer cents', () => {
      const milestones = getNetWorthMilestones();
      expect(milestones).toContain(10_000_00);
      expect(milestones).toContain(1_000_000_00);
      expect(milestones.length).toBeGreaterThanOrEqual(5);
    });
  });
});
