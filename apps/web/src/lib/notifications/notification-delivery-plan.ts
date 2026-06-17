// SPDX-License-Identifier: BUSL-1.1

import { getDeliveryDecisions, type DeliveryDecision } from './delivery-controls';
import type { AppNotification, NotificationChannel, NotificationPreferences } from './types';

export interface NotificationChannelDispatch {
  readonly channel: NotificationChannel;
  readonly shouldDispatch: boolean;
  readonly reason: DeliveryDecision['reason'];
}

export interface NotificationDeliveryPlan {
  readonly notification: AppNotification;
  readonly keepHistory: true;
  readonly dispatches: readonly NotificationChannelDispatch[];
  readonly criticalBypassCopy: string | null;
}

export function planNotificationDelivery(
  notification: AppNotification,
  preferences: NotificationPreferences,
  nowDate: Date = new Date(),
): NotificationDeliveryPlan {
  const decisions = getDeliveryDecisions(notification, preferences, nowDate);
  return {
    notification,
    keepHistory: true,
    dispatches: decisions.map((decision) => ({
      channel: decision.channel,
      shouldDispatch: decision.deliver,
      reason: decision.reason,
    })),
    criticalBypassCopy: notification.severity === 'critical'
      ? 'Critical alerts may appear even during quiet hours so urgent account risks are not missed.'
      : null,
  };
}

export function dispatchableChannels(plan: NotificationDeliveryPlan): readonly NotificationChannel[] {
  return plan.dispatches
    .filter((dispatch) => dispatch.shouldDispatch)
    .map((dispatch) => dispatch.channel);
}

export function suppressedChannels(plan: NotificationDeliveryPlan): readonly NotificationChannelDispatch[] {
  return plan.dispatches.filter((dispatch) => !dispatch.shouldDispatch);
}
