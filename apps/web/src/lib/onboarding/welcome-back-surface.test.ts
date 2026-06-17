// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildSetupMilestones, decideReEngagement } from './re-engagement';
import { buildWelcomeBackSurface, dismissWelcomeBack, getWelcomeBackActionHref, recordLastActive } from './welcome-back-surface';

describe('welcome back surface', () => {
  it('maps re-engagement decisions to accessible dashboard state and routes', () => {
    const decision = decideReEngagement({
      now: new Date('2026-04-10T00:00:00Z'),
      lastActiveAt: new Date('2026-04-01T00:00:00Z'),
      milestones: buildSetupMilestones(['comfort-settings']),
      consent: { analytics: true, email: false, notifications: false },
    });

    const surface = buildWelcomeBackSurface(decision);

    expect(surface.visible).toBe(true);
    expect(surface.remainingCount).toBeGreaterThan(0);
    expect(getWelcomeBackActionHref(surface.primaryAction)).toContain('/onboarding');
  });

  it('persists activity and dismissal timestamps in serializable state', () => {
    const active = recordLastActive({}, new Date('2026-04-10T00:00:00Z'));
    const dismissed = dismissWelcomeBack(active, new Date('2026-04-10T00:00:00Z'), 3);

    expect(active.lastActiveAt).toBe('2026-04-10T00:00:00.000Z');
    expect(dismissed.dismissedUntil).toBe('2026-04-13T00:00:00.000Z');
  });
});
