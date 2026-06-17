// SPDX-License-Identifier: BUSL-1.1

import { buildSpendingDigestNotification, scheduleDigestDelivery, type SpendingDigestCadence, type SpendingDigestInput } from './spending-digests';
import type { AppNotification, NotificationPreferences } from './types';

export type SpendingDigestPreferenceCadence = SpendingDigestCadence | 'both' | 'off';

export interface SpendingDigestPreferences {
  readonly cadence: SpendingDigestPreferenceCadence;
  readonly deliveryHourLocal: number;
  readonly deliveryMinuteLocal: number;
}

export interface SpendingDigestHistoryEntry {
  readonly digestId: string;
  readonly cadence: SpendingDigestCadence;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly createdAt: string;
  readonly deliveredAt: string;
}

export interface DigestScheduleDecision {
  readonly cadence: SpendingDigestCadence;
  readonly due: boolean;
  readonly scheduledAt: string;
  readonly reason: 'off' | 'already_delivered' | 'due';
  readonly notification?: AppNotification;
  readonly historyEntry?: SpendingDigestHistoryEntry;
}

const DEFAULT_DIGEST_PREFS: SpendingDigestPreferences = {
  cadence: 'weekly',
  deliveryHourLocal: 9,
  deliveryMinuteLocal: 0,
};

export function normalizeSpendingDigestPreferences(
  partial: Partial<SpendingDigestPreferences> = {},
): SpendingDigestPreferences {
  return {
    cadence: partial.cadence ?? DEFAULT_DIGEST_PREFS.cadence,
    deliveryHourLocal: clamp(partial.deliveryHourLocal ?? DEFAULT_DIGEST_PREFS.deliveryHourLocal, 0, 23),
    deliveryMinuteLocal: clamp(partial.deliveryMinuteLocal ?? DEFAULT_DIGEST_PREFS.deliveryMinuteLocal, 0, 59),
  };
}

export function enabledDigestCadences(preferences: SpendingDigestPreferences): readonly SpendingDigestCadence[] {
  if (preferences.cadence === 'off') return [];
  if (preferences.cadence === 'both') return ['weekly', 'monthly'];
  return [preferences.cadence];
}

export function createSpendingDigestHistoryEntry(
  notification: AppNotification,
  input: SpendingDigestInput,
  deliveredAt: string,
): SpendingDigestHistoryEntry {
  return {
    digestId: notification.id,
    cadence: input.cadence,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    createdAt: notification.createdAt,
    deliveredAt,
  };
}

export function planSpendingDigestSchedules(
  inputs: readonly SpendingDigestInput[],
  preferences: Partial<SpendingDigestPreferences>,
  notificationPreferences: NotificationPreferences,
  history: readonly SpendingDigestHistoryEntry[],
): readonly DigestScheduleDecision[] {
  const normalized = normalizeSpendingDigestPreferences(preferences);
  const enabled = new Set(enabledDigestCadences(normalized));

  return inputs.map((input) => {
    const requested = new Date(`${input.periodEnd}T00:00:00`);
    requested.setHours(normalized.deliveryHourLocal, normalized.deliveryMinuteLocal, 0, 0);
    const scheduled = scheduleDigestDelivery(requested, notificationPreferences);

    if (!enabled.has(input.cadence)) {
      return { cadence: input.cadence, due: false, scheduledAt: scheduled.toISOString(), reason: 'off' };
    }

    const notification = buildSpendingDigestNotification(input);
    if (history.some((entry) => entry.digestId === notification.id)) {
      return { cadence: input.cadence, due: false, scheduledAt: scheduled.toISOString(), reason: 'already_delivered' };
    }

    return {
      cadence: input.cadence,
      due: true,
      scheduledAt: scheduled.toISOString(),
      reason: 'due',
      notification,
      historyEntry: createSpendingDigestHistoryEntry(notification, input, scheduled.toISOString()),
    };
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
