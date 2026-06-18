// SPDX-License-Identifier: BUSL-1.1

export type AlertPriority = 'low' | 'normal' | 'high' | 'critical';

export interface QuietHours {
  readonly startHour: number;
  readonly endHour: number;
}

export interface NotificationTimingInput {
  readonly now: string;
  readonly priority: AlertPriority;
  readonly quietHours: QuietHours;
  readonly preferredHours: readonly number[];
  readonly fallbackDelayMinutes: number;
}

export interface NotificationTimingDecision {
  readonly scheduledAt: string;
  readonly reason: 'send-now' | 'after-quiet-hours' | 'preferred-window' | 'fallback-delay';
}

function inQuietHours(hour: number, quiet: QuietHours): boolean {
  if (quiet.startHour === quiet.endHour) return false;
  if (quiet.startHour < quiet.endHour) return hour >= quiet.startHour && hour < quiet.endHour;
  return hour >= quiet.startHour || hour < quiet.endHour;
}

function nextAtHour(now: Date, hour: number): Date {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(hour);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function chooseNotificationTime(input: NotificationTimingInput): NotificationTimingDecision {
  const now = new Date(input.now);
  const hour = now.getUTCHours();
  if (input.priority === 'critical') return { scheduledAt: now.toISOString(), reason: 'send-now' };
  if (inQuietHours(hour, input.quietHours)) {
    return {
      scheduledAt: nextAtHour(now, input.quietHours.endHour).toISOString(),
      reason: 'after-quiet-hours',
    };
  }
  if (input.preferredHours.includes(hour))
    return { scheduledAt: now.toISOString(), reason: 'send-now' };
  if (input.preferredHours.length > 0 && input.priority !== 'high') {
    return {
      scheduledAt: nextAtHour(now, input.preferredHours[0]).toISOString(),
      reason: 'preferred-window',
    };
  }
  const fallback = new Date(now.getTime() + input.fallbackDelayMinutes * 60_000);
  return { scheduledAt: fallback.toISOString(), reason: 'fallback-delay' };
}
