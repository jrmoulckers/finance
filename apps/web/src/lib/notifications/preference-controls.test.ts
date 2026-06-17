// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './types';
import { buildNotificationPreferenceViewModel, toggleNotificationPreferenceChannel } from './preference-controls';

describe('notification preference controls', () => {
  const availability = { in_app: true, browser_push: false, email: true } as const;

  it('builds keyboard-accessible controls and marks unavailable channels disabled', () => {
    const model = buildNotificationPreferenceViewModel({
      preferences: { quietHours: { enabled: true, startTime: '22:00', endTime: '07:00' } },
      availability,
    });

    expect(model.keyboardHelp).toContain('Space');
    expect(model.controls.find((control) => control.channel === 'browser_push')?.disabled).toBe(true);
    expect(model.quietHoursErrors).toEqual([]);
  });

  it('updates available channels but ignores unavailable ones', () => {
    const withEmail = toggleNotificationPreferenceChannel({
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      alertType: 'bill_due',
      channel: 'email',
      checked: true,
      availability,
    });
    const unchanged = toggleNotificationPreferenceChannel({
      preferences: withEmail,
      alertType: 'bill_due',
      channel: 'browser_push',
      checked: true,
      availability,
    });

    expect(withEmail.channelPreferences.find((preference) => preference.alertType === 'bill_due')?.channels).toContain('email');
    expect(unchanged).toBe(withEmail);
  });
});
