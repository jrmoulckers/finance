// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { DEFAULT_NOTIFICATION_PREFERENCES } from './types';
import type { AppNotification } from './types';
import { setAlertChannels } from './delivery-controls';
import {
  dispatchableChannels,
  planNotificationDelivery,
  suppressedChannels,
} from './notification-delivery-plan';

const notification: AppNotification = {
  id: 'digest-1',
  type: 'spending_digest',
  severity: 'info',
  title: 'Digest',
  message: 'Summary',
  createdAt: '2025-07-01T12:00:00Z',
  status: 'unread',
};

describe('notification delivery plan', () => {
  it('applies per-alert channel controls while keeping history', () => {
    const preferences = setAlertChannels(DEFAULT_NOTIFICATION_PREFERENCES, 'spending_digest', [
      'in_app',
      'email',
    ]);
    const plan = planNotificationDelivery(
      notification,
      preferences,
      new Date('2025-07-01T12:00:00Z'),
    );

    expect(plan.keepHistory).toBe(true);
    expect(dispatchableChannels(plan)).toEqual(['in_app', 'email']);
    expect(suppressedChannels(plan).map((dispatch) => dispatch.channel)).toEqual(['browser_push']);
  });

  it('shows critical bypass copy and allows quiet-hour dispatch', () => {
    const preferences = setAlertChannels(
      {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        quietHours: { enabled: true, startTime: '22:00', endTime: '07:00' },
      },
      'balance_overdraft',
      ['in_app'],
    );
    const plan = planNotificationDelivery(
      { ...notification, type: 'balance_overdraft', severity: 'critical' },
      preferences,
      new Date('2025-07-01T23:00:00'),
    );

    expect(plan.criticalBypassCopy).toContain('Critical alerts');
    expect(plan.dispatches.find((dispatch) => dispatch.channel === 'in_app')?.shouldDispatch).toBe(
      true,
    );
  });
});
