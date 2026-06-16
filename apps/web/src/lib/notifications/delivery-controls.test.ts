// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES, type AppNotification } from './types';
import { canBypassQuietHours, getDeliveryDecisions, normalizeNotificationPreferences, setAlertChannels, validateQuietHours } from './delivery-controls';

const notification: AppNotification = {
  id: 'n1',
  type: 'spending_digest',
  severity: 'info',
  title: 'Digest',
  message: 'Summary',
  createdAt: '2025-03-01T12:00:00Z',
  status: 'unread',
};

describe('delivery controls', () => {
  it('validates quiet hour time ranges', () => {
    expect(validateQuietHours({ enabled: true, startTime: '22:00', endTime: '07:00' }).valid).toBe(true);
    expect(validateQuietHours({ enabled: true, startTime: '24:00', endTime: '07:00' }).valid).toBe(false);
    expect(validateQuietHours({ enabled: true, startTime: '07:00', endTime: '07:00' }).valid).toBe(false);
  });

  it('fills missing channel preferences from defaults', () => {
    const normalized = normalizeNotificationPreferences({ channelPreferences: [] });

    expect(normalized.channelPreferences.some((preference) => preference.alertType === 'spending_digest')).toBe(true);
    expect(normalized.channelPreferences.some((preference) => preference.alertType === 'subscription_price_change')).toBe(true);
  });

  it('updates channel controls for one alert type', () => {
    const updated = setAlertChannels(DEFAULT_NOTIFICATION_PREFERENCES, 'spending_digest', ['in_app', 'email']);

    expect(updated.channelPreferences.find((preference) => preference.alertType === 'spending_digest')?.channels).toEqual([
      'in_app',
      'email',
    ]);
  });

  it('explains quiet-hours and channel suppression decisions', () => {
    const prefs = setAlertChannels(
      {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        quietHours: { enabled: true, startTime: '22:00', endTime: '07:00' },
      },
      'spending_digest',
      ['in_app'],
    );

    const decisions = getDeliveryDecisions(notification, prefs, new Date('2025-03-01T23:00:00'));

    expect(decisions.find((decision) => decision.channel === 'in_app')?.reason).toBe('quiet_hours');
    expect(decisions.find((decision) => decision.channel === 'email')?.reason).toBe('channel_disabled');
  });

  it('allows critical notifications to bypass quiet hours', () => {
    expect(canBypassQuietHours({ ...notification, severity: 'critical' })).toBe(true);
  });
});
