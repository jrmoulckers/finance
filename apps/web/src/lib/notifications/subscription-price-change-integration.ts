// SPDX-License-Identifier: BUSL-1.1

import type { DetectedSubscription, SubscriptionCadence as AnalyticsSubscriptionCadence, SubscriptionStatus } from '../analytics/subscriptions';
import type { AppNotification } from './types';
import {
  subscriptionPriceChangesToNotifications,
  type SubscriptionCadence,
  type SubscriptionCharge,
  type SubscriptionPriceChangeAlert,
} from './subscription-price-changes';

export type SubscriptionPriceChangeAction = 'review' | 'update_budget' | 'cancel_subscription';

export interface SubscriptionPriceChangeCommand {
  readonly action: SubscriptionPriceChangeAction;
  readonly subscriptionId: string;
  readonly label: string;
  readonly nextStatus?: SubscriptionStatus;
}

export interface SubscriptionPriceChangeDispatchPlan {
  readonly notification: AppNotification;
  readonly route: string;
  readonly commands: readonly SubscriptionPriceChangeCommand[];
}

export function subscriptionToPriceChangeCharge(
  subscription: DetectedSubscription,
  capturedAt: string = `${subscription.lastDate}T12:00:00Z`,
): SubscriptionCharge {
  return {
    id: `subscription-snapshot-${subscription.id}-${subscription.lastDate}`,
    merchantName: subscription.name,
    amountCents: subscription.amountCents,
    chargedAt: capturedAt,
    subscriptionId: subscription.id,
    cadence: mapCadence(subscription.cadence),
    cycleKey: subscription.lastDate.slice(0, 7),
    status: subscription.status === 'cancelled' ? 'void' : 'posted',
  };
}

export function subscriptionsToPriceChangeCharges(
  subscriptions: readonly DetectedSubscription[],
  capturedAt?: string,
): SubscriptionCharge[] {
  return subscriptions.map((subscription) => subscriptionToPriceChangeCharge(subscription, capturedAt));
}

export function routeSubscriptionPriceChange(alert: SubscriptionPriceChangeAlert): string {
  const params = new URLSearchParams({ subscriptionId: alert.subscriptionKey, alert: 'price_change' });
  return `/subscriptions?${params.toString()}`;
}

export function buildSubscriptionPriceChangeDispatchPlans(
  alerts: readonly SubscriptionPriceChangeAlert[],
  createdAt?: string,
): readonly SubscriptionPriceChangeDispatchPlan[] {
  const notifications = subscriptionPriceChangesToNotifications(alerts, createdAt);
  return alerts.map((alert, index) => ({
    notification: notifications[index] as AppNotification,
    route: routeSubscriptionPriceChange(alert),
    commands: buildSubscriptionPriceChangeCommands(alert.subscriptionKey),
  }));
}

export function buildSubscriptionPriceChangeCommands(subscriptionId: string): readonly SubscriptionPriceChangeCommand[] {
  return [
    { action: 'review', subscriptionId, label: 'Review details' },
    { action: 'update_budget', subscriptionId, label: 'Update budget' },
    { action: 'cancel_subscription', subscriptionId, label: 'Mark cancelled', nextStatus: 'cancelled' },
  ];
}

function mapCadence(cadence: AnalyticsSubscriptionCadence): SubscriptionCadence {
  if (cadence === 'other') return 'unknown';
  return cadence;
}
