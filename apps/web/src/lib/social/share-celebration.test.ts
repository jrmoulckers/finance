// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildShareCelebration,
  goalCelebrationEvent,
  toShareData,
  type CelebrationEvent,
} from './share-celebration';

/** Matches any USD-style currency figure, e.g. `$1,234.56` or `$50.00`. */
const CURRENCY_PATTERN = /[$€£]\s?\d/;

describe('buildShareCelebration', () => {
  describe('event-type coverage', () => {
    it('builds a goal milestone celebration', () => {
      const result = buildShareCelebration({
        kind: 'goal-milestone',
        goalName: 'New Laptop',
        percent: 50,
      });

      expect(result.type).toBe('goal-milestone');
      expect(result.title).toContain('Halfway');
      expect(result.message).toContain('50%');
      expect(result.message).toContain('New Laptop');
      expect(result.percentComplete).toBe(50);
      expect(result.hashtags).toContain('#SavingsGoals');
      expect(result.shareText).toContain('#MoneyWins');
    });

    it('builds a goal completion celebration', () => {
      const result = buildShareCelebration({
        kind: 'goal-completion',
        goalName: 'Concert Fund',
      });

      expect(result.type).toBe('goal-completion');
      expect(result.percentComplete).toBe(100);
      expect(result.message).toContain('completed');
      expect(result.message).toContain('Concert Fund');
      expect(result.hashtags).toContain('#GoalCrushed');
    });

    it('builds a badge unlock celebration with description', () => {
      const result = buildShareCelebration({
        kind: 'badge-unlock',
        badgeName: 'Goal Crusher',
        badgeDescription: 'Complete a savings goal',
      });

      expect(result.type).toBe('badge-unlock');
      expect(result.percentComplete).toBeNull();
      expect(result.message).toContain('Goal Crusher');
      expect(result.message).toContain('Complete a savings goal');
      expect(result.hashtags).toContain('#BadgeUnlocked');
    });

    it('builds a badge unlock celebration without description', () => {
      const result = buildShareCelebration({
        kind: 'badge-unlock',
        badgeName: 'First Step',
      });

      expect(result.message).toBe('I just earned the "First Step" badge!');
    });

    it('builds a streak milestone celebration with correct pluralization', () => {
      const plural = buildShareCelebration({
        kind: 'streak-milestone',
        streakLabel: 'Daily Logging',
        days: 7,
      });
      expect(plural.type).toBe('streak-milestone');
      expect(plural.title).toContain('7-days streak');
      expect(plural.message).toContain('Daily Logging');
      expect(plural.hashtags).toContain('#StreakAlive');

      const singular = buildShareCelebration({
        kind: 'streak-milestone',
        streakLabel: 'Daily Logging',
        days: 1,
      });
      expect(singular.title).toContain('1-day streak');
    });
  });

  describe('redaction by default', () => {
    it('never includes a raw amount for goal milestones by default', () => {
      const result = buildShareCelebration({
        kind: 'goal-milestone',
        goalName: 'Emergency Fund',
        percent: 75,
        amountCents: 750_00,
        currency: 'USD',
      });

      expect(result.amountLabel).toBeNull();
      expect(result.containsRawAmount).toBe(false);
      expect(result.shareText).not.toMatch(CURRENCY_PATTERN);
      // The safe percent figure is still present.
      expect(result.percentComplete).toBe(75);
    });

    it('never includes a raw amount for goal completion by default', () => {
      const result = buildShareCelebration({
        kind: 'goal-completion',
        goalName: 'Car Fund',
        amountCents: 5_000_00,
        currency: 'USD',
      });

      expect(result.amountLabel).toBeNull();
      expect(result.containsRawAmount).toBe(false);
      expect(result.shareText).not.toMatch(CURRENCY_PATTERN);
    });
  });

  describe('opt-in reveal', () => {
    it('includes a formatted amount only when revealAmount is true', () => {
      const event: CelebrationEvent = {
        kind: 'goal-completion',
        goalName: 'Car Fund',
        amountCents: 5_000_00,
        currency: 'USD',
      };

      const revealed = buildShareCelebration(event, { revealAmount: true });

      expect(revealed.amountLabel).toBe('$5,000.00');
      expect(revealed.containsRawAmount).toBe(true);
      expect(revealed.shareText).toContain('$5,000.00');
      expect(revealed.shareText).toMatch(CURRENCY_PATTERN);
    });

    it('respects a non-default currency on opt-in reveal', () => {
      const revealed = buildShareCelebration(
        {
          kind: 'goal-milestone',
          goalName: 'Eurotrip',
          percent: 50,
          amountCents: 1_234_56,
          currency: 'EUR',
        },
        { revealAmount: true },
      );

      expect(revealed.amountLabel).toContain('1,234.56');
      expect(revealed.containsRawAmount).toBe(true);
    });

    it('reveals nothing when there is no amount, even on opt-in', () => {
      const revealed = buildShareCelebration(
        { kind: 'goal-milestone', goalName: 'No Amount Goal', percent: 25 },
        { revealAmount: true },
      );

      expect(revealed.amountLabel).toBeNull();
      expect(revealed.containsRawAmount).toBe(false);
    });
  });

  describe('no-leak guarantee', () => {
    it('badge and streak events can never carry a currency figure', () => {
      const badge = buildShareCelebration(
        { kind: 'badge-unlock', badgeName: 'Saver' },
        { revealAmount: true },
      );
      const streak = buildShareCelebration(
        { kind: 'streak-milestone', streakLabel: 'Saving', days: 30 },
        { revealAmount: true },
      );

      expect(badge.containsRawAmount).toBe(false);
      expect(badge.shareText).not.toMatch(CURRENCY_PATTERN);
      expect(streak.containsRawAmount).toBe(false);
      expect(streak.shareText).not.toMatch(CURRENCY_PATTERN);
    });
  });

  describe('determinism', () => {
    it('produces identical output for identical input', () => {
      const event: CelebrationEvent = {
        kind: 'goal-milestone',
        goalName: 'Bike',
        percent: 25,
        amountCents: 100_00,
        currency: 'USD',
      };

      expect(buildShareCelebration(event)).toEqual(buildShareCelebration(event));
      expect(buildShareCelebration(event, { revealAmount: true })).toEqual(
        buildShareCelebration(event, { revealAmount: true }),
      );
    });
  });
});

describe('toShareData', () => {
  it('maps a celebration to a Web Share payload', () => {
    const celebration = buildShareCelebration({
      kind: 'goal-milestone',
      goalName: 'Bike',
      percent: 25,
    });
    const data = toShareData(celebration);

    expect(data.title).toBe(celebration.title);
    expect(data.text).toBe(celebration.shareText);
  });
});

describe('goalCelebrationEvent', () => {
  it('returns null below the first shareable milestone', () => {
    expect(goalCelebrationEvent({ goalName: 'G', percentComplete: 10 })).toBeNull();
    expect(goalCelebrationEvent({ goalName: 'G', percentComplete: 24 })).toBeNull();
  });

  it('selects the highest reached milestone', () => {
    expect(goalCelebrationEvent({ goalName: 'G', percentComplete: 25 })).toMatchObject({
      kind: 'goal-milestone',
      percent: 25,
    });
    expect(goalCelebrationEvent({ goalName: 'G', percentComplete: 60 })).toMatchObject({
      kind: 'goal-milestone',
      percent: 50,
    });
    expect(goalCelebrationEvent({ goalName: 'G', percentComplete: 99 })).toMatchObject({
      kind: 'goal-milestone',
      percent: 75,
    });
  });

  it('returns a completion event at or above 100%', () => {
    expect(goalCelebrationEvent({ goalName: 'G', percentComplete: 100 })).toMatchObject({
      kind: 'goal-completion',
    });
    expect(goalCelebrationEvent({ goalName: 'G', percentComplete: 120 })).toMatchObject({
      kind: 'goal-completion',
    });
  });

  it('passes through amount and currency for downstream redaction', () => {
    const event = goalCelebrationEvent({
      goalName: 'G',
      percentComplete: 50,
      amountCents: 500_00,
      currency: 'USD',
    });

    // Amount is carried but stays redacted unless the user opts in.
    expect(buildShareCelebration(event!).containsRawAmount).toBe(false);
    expect(buildShareCelebration(event!, { revealAmount: true }).containsRawAmount).toBe(true);
  });
});
