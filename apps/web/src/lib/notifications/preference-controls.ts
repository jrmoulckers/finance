// SPDX-License-Identifier: BUSL-1.1

import {
  normalizeNotificationPreferences,
  setAlertChannels,
  validateQuietHours,
} from './delivery-controls';
import type { AlertType, NotificationChannel, NotificationPreferences } from './types';

export interface NotificationChannelAvailability {
  readonly in_app: true;
  readonly browser_push: boolean;
  readonly email: boolean;
}

export interface NotificationPreferenceControl {
  readonly alertType: AlertType;
  readonly channel: NotificationChannel;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly describedBy: string;
}

export interface NotificationPreferenceViewModel {
  readonly preferences: NotificationPreferences;
  readonly controls: readonly NotificationPreferenceControl[];
  readonly quietHoursErrors: readonly string[];
  readonly keyboardHelp: string;
}

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'In-app',
  browser_push: 'Browser push',
  email: 'Email',
};

const ALL_CHANNELS: readonly NotificationChannel[] = ['in_app', 'browser_push', 'email'];

function isAvailable(
  channel: NotificationChannel,
  availability: NotificationChannelAvailability,
): boolean {
  return availability[channel];
}

export function buildNotificationPreferenceViewModel(params: {
  readonly preferences: Partial<NotificationPreferences>;
  readonly availability: NotificationChannelAvailability;
}): NotificationPreferenceViewModel {
  const preferences = normalizeNotificationPreferences(params.preferences);
  const quietHoursValidation = validateQuietHours(preferences.quietHours);
  const controls = preferences.channelPreferences.flatMap((preference) =>
    ALL_CHANNELS.map((channel): NotificationPreferenceControl => ({
      alertType: preference.alertType,
      channel,
      checked: preference.channels.includes(channel),
      disabled: !isAvailable(channel, params.availability),
      label: `${CHANNEL_LABELS[channel]} ${preference.alertType.replaceAll('_', ' ')}`,
      describedBy: !isAvailable(channel, params.availability)
        ? `${CHANNEL_LABELS[channel]} delivery is not available on this device yet.`
        : 'Press Space to toggle this delivery channel.',
    })),
  );

  return {
    preferences,
    controls,
    quietHoursErrors: quietHoursValidation.errors,
    keyboardHelp:
      'Use Tab to move between notification controls and Space to toggle a focused checkbox.',
  };
}

export function toggleNotificationPreferenceChannel(params: {
  readonly preferences: NotificationPreferences;
  readonly alertType: AlertType;
  readonly channel: NotificationChannel;
  readonly checked: boolean;
  readonly availability: NotificationChannelAvailability;
}): NotificationPreferences {
  if (!isAvailable(params.channel, params.availability)) return params.preferences;
  const existing = params.preferences.channelPreferences.find(
    (preference) => preference.alertType === params.alertType,
  );
  const currentChannels = existing?.channels ?? [];
  const nextChannels = params.checked
    ? Array.from(new Set([...currentChannels, params.channel]))
    : currentChannels.filter((channel) => channel !== params.channel);
  return setAlertChannels(params.preferences, params.alertType, nextChannels);
}
