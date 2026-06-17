// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildSetupMilestones, decideReEngagement } from './re-engagement';
import { buildReEngagementReminderPlan } from './re-engagement-consent';

describe('re-engagement consent', () => {
  it('allows reminders and analytics only when consent and visibility permit them', () => {
    const decision = decideReEngagement({
      now: new Date('2026-05-10T00:00:00Z'),
      lastActiveAt: new Date('2026-05-01T00:00:00Z'),
      milestones: buildSetupMilestones([]),
      consent: { analytics: true, email: true, notifications: false },
    });

    const plan = buildReEngagementReminderPlan({
      decision,
      requestedChannels: ['email'],
      now: new Date('2026-05-10T00:00:00Z'),
    });

    expect(plan.reminders[0]).toMatchObject({ allowed: true });
    expect(plan.analyticsEvent?.properties.remainingSteps).toBeGreaterThan(0);
  });

  it('suppresses repeated interruptions after dismissal', () => {
    const decision = decideReEngagement({
      now: new Date('2026-05-10T00:00:00Z'),
      lastActiveAt: new Date('2026-05-01T00:00:00Z'),
      milestones: buildSetupMilestones([]),
      consent: { analytics: true, email: true, notifications: true },
    });

    const plan = buildReEngagementReminderPlan({
      decision,
      requestedChannels: ['notification', 'email'],
      dismissedUntil: new Date('2026-05-12T00:00:00Z'),
      now: new Date('2026-05-10T00:00:00Z'),
    });

    expect(plan.interruptionSuppressed).toBe(true);
    expect(plan.reminders.every((reminder) => !reminder.allowed)).toBe(true);
    expect(plan.analyticsEvent).toBeNull();
  });
});
