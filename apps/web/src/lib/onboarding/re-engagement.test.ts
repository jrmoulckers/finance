// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for gentle onboarding re-engagement decisions.
 *
 * References: issue #2299
 */

import { describe, expect, it } from 'vitest';
import {
  buildSetupMilestones,
  buildWelcomeBackMessage,
  decideReEngagement,
  nextDismissedUntil,
} from './re-engagement';

describe('re-engagement decision model', () => {
  const now = new Date('2026-04-20T12:00:00.000Z');

  it('shows a welcome-back flow after inactivity with incomplete setup', () => {
    const milestones = buildSetupMilestones(['comfort-settings', 'privacy-choice']);
    const decision = decideReEngagement({
      now,
      lastActiveAt: new Date('2026-04-15T11:00:00.000Z'),
      milestones,
      consent: { analytics: true, email: false, notifications: false },
    });

    expect(decision.shouldShow).toBe(true);
    expect(decision.inactiveDays).toBe(5);
    expect(decision.completed).toHaveLength(2);
    expect(decision.remaining[0].id).toBe('life-stage');
    expect(decision.primaryAction).toEqual({
      id: 'pick-life-stage',
      label: 'Pick guidance that fits you',
    });
    expect(decision.secondaryAction.label).toBe('Not now');
    expect(decision.canTrackAnalytics).toBe(true);
    expect(decision.canSendReminder).toBe(false);
    expect(decision.message).toContain('there is no rush');
  });

  it('does not interrupt users before threshold, after completion, or during dismissal', () => {
    const incomplete = decideReEngagement({
      now,
      lastActiveAt: new Date('2026-04-19T12:00:00.000Z'),
      milestones: buildSetupMilestones([]),
      consent: { analytics: false, email: true, notifications: false },
    });
    expect(incomplete.shouldShow).toBe(false);
    expect(incomplete.reasons).toContain('User has not been inactive long enough.');

    const complete = decideReEngagement({
      now,
      lastActiveAt: new Date('2026-04-12T12:00:00.000Z'),
      milestones: buildSetupMilestones([
        'comfort-settings',
        'privacy-choice',
        'life-stage',
        'starter-budget',
        'first-goal',
        'first-lesson',
        'setup-checklist',
      ]),
      consent: { analytics: false, email: true, notifications: false },
    });
    expect(complete.shouldShow).toBe(false);
    expect(complete.reasons).toContain('Setup is already complete.');

    const dismissed = decideReEngagement({
      now,
      lastActiveAt: new Date('2026-04-12T12:00:00.000Z'),
      dismissedUntil: new Date('2026-04-21T12:00:00.000Z'),
      milestones: buildSetupMilestones([]),
      consent: { analytics: false, email: true, notifications: false },
    });
    expect(dismissed.shouldShow).toBe(false);
    expect(dismissed.reasons).toContain('Re-engagement was dismissed recently.');
  });

  it('builds supportive non-shaming messages', () => {
    expect(buildWelcomeBackMessage([], buildSetupMilestones([]), 4)).toBe(
      'Welcome back after 4 days. You can start with one small setup step when you are ready.',
    );
    expect(buildWelcomeBackMessage(buildSetupMilestones(['comfort-settings']), [], 1)).toBe(
      'Welcome back. Your setup checklist is complete, and you can keep exploring at your pace.',
    );
  });

  it('calculates dismissal state for repeated interruption prevention', () => {
    expect(nextDismissedUntil(now, 3).toISOString()).toBe('2026-04-23T12:00:00.000Z');
    expect(nextDismissedUntil(now, 0).toISOString()).toBe('2026-04-21T12:00:00.000Z');
  });
});
