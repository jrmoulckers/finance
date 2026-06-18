// SPDX-License-Identifier: BUSL-1.1

/** Pure quiet-hours and channel-control helpers for notification delivery. */

import { isInQuietHours, shouldDeliverNotification } from './alert-engine';
import {
  DEFAULT_CHANNEL_PREFERENCES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type AlertType,
  type AppNotification,
  type NotificationChannel,
  type NotificationPreferences,
  type QuietHoursConfig,
} from './types';

export interface QuietHoursValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface DeliveryDecision {
  readonly channel: NotificationChannel;
  readonly deliver: boolean;
  readonly reason: 'allowed' | 'global_disabled' | 'dnd' | 'channel_disabled' | 'quiet_hours';
}

const ALL_CHANNELS: readonly NotificationChannel[] = ['in_app', 'browser_push', 'email'];
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateQuietHours(config: QuietHoursConfig): QuietHoursValidationResult {
  const errors: string[] = [];
  if (!TIME_PATTERN.test(config.startTime)) {
    errors.push('Quiet hours start time must use HH:mm 24-hour format.');
  }
  if (!TIME_PATTERN.test(config.endTime)) {
    errors.push('Quiet hours end time must use HH:mm 24-hour format.');
  }
  if (config.enabled && config.startTime === config.endTime) {
    errors.push('Quiet hours start and end cannot be the same when enabled.');
  }
  return { valid: errors.length === 0, errors };
}

export function normalizeNotificationPreferences(
  partial: Partial<NotificationPreferences>,
): NotificationPreferences {
  const explicitChannels = partial.channelPreferences ?? [];
  const mergedChannels = DEFAULT_CHANNEL_PREFERENCES.map((defaultPreference) => {
    const override = explicitChannels.find(
      (preference) => preference.alertType === defaultPreference.alertType,
    );
    return override ?? defaultPreference;
  });

  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...partial,
    quietHours: { ...DEFAULT_NOTIFICATION_PREFERENCES.quietHours, ...partial.quietHours },
    channelPreferences: mergedChannels,
  };
}

export function setAlertChannels(
  preferences: NotificationPreferences,
  alertType: AlertType,
  channels: readonly NotificationChannel[],
): NotificationPreferences {
  const uniqueChannels = ALL_CHANNELS.filter((channel) => channels.includes(channel));
  const withoutAlert = preferences.channelPreferences.filter(
    (preference) => preference.alertType !== alertType,
  );
  return {
    ...preferences,
    channelPreferences: [...withoutAlert, { alertType, channels: uniqueChannels }],
  };
}

function disabledReason(
  notification: AppNotification,
  preferences: NotificationPreferences,
  channel: NotificationChannel,
  nowDate: Date,
): DeliveryDecision['reason'] {
  if (!preferences.enabled) return 'global_disabled';
  if (preferences.doNotDisturb) return 'dnd';
  const channelPreference = preferences.channelPreferences.find(
    (preference) => preference.alertType === notification.type,
  );
  if (channelPreference !== undefined && !channelPreference.channels.includes(channel)) {
    return 'channel_disabled';
  }
  if (
    preferences.quietHours.enabled &&
    notification.severity !== 'critical' &&
    isInQuietHours(preferences, nowDate)
  ) {
    return 'quiet_hours';
  }
  return 'allowed';
}

export function getDeliveryDecisions(
  notification: AppNotification,
  preferences: NotificationPreferences,
  nowDate: Date = new Date(),
): DeliveryDecision[] {
  const normalized = normalizeNotificationPreferences(preferences);
  return ALL_CHANNELS.map((channel) => {
    const deliver = shouldDeliverNotification(notification, normalized, channel, nowDate);
    return {
      channel,
      deliver,
      reason: deliver ? 'allowed' : disabledReason(notification, normalized, channel, nowDate),
    };
  });
}

export function canBypassQuietHours(notification: AppNotification): boolean {
  return notification.severity === 'critical';
}
