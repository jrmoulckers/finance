// SPDX-License-Identifier: BUSL-1.1

export type SmartNotificationSeverity = 'info' | 'success' | 'warning' | 'critical';
export type SmartNotificationStatus = 'unread' | 'read' | 'dismissed';

export interface SmartNotification {
  readonly id: string;
  readonly type: string;
  readonly severity: SmartNotificationSeverity;
  readonly title: string;
  readonly message: string;
  readonly createdAt: string;
  readonly status: SmartNotificationStatus;
  readonly entityId?: string;
  readonly entityType?:
    'bill' | 'budget' | 'goal' | 'account' | 'transaction' | 'merchant' | 'category';
  readonly dueDate?: string;
  readonly financialImpactCents?: number;
  readonly deduplicationKey?: string;
}

export interface NotificationInteractionHistory {
  readonly dismissedNotificationIds?: readonly string[];
  readonly dismissedEntityIds?: readonly string[];
  readonly readNotificationIds?: readonly string[];
}

export interface PrioritizedNotification {
  readonly notification: SmartNotification;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly pinned: boolean;
}

export interface NotificationBundle {
  readonly id: string;
  readonly kind: 'single' | 'bundle';
  readonly score: number;
  readonly title: string;
  readonly topReason: string;
  readonly count: number;
  readonly children: readonly PrioritizedNotification[];
  readonly pinned: boolean;
}

export interface NotificationPrioritizationOptions {
  readonly now: string;
  readonly bundleWindowHours?: number;
  readonly criticalPassthrough?: boolean;
  readonly history?: NotificationInteractionHistory;
}

const SEVERITY_POINTS: Readonly<Record<SmartNotificationSeverity, number>> = {
  info: 10,
  success: 8,
  warning: 45,
  critical: 90,
};

export function scoreNotification(
  notification: SmartNotification,
  options: NotificationPrioritizationOptions,
): PrioritizedNotification {
  const reasons: string[] = [];
  let score = SEVERITY_POINTS[notification.severity];
  reasons.push(`${notification.severity} severity`);

  const impact = Math.abs(notification.financialImpactCents ?? 0);
  if (impact >= 100_000) {
    score += 20;
    reasons.push('large financial impact');
  } else if (impact >= 10_000) {
    score += 10;
    reasons.push('moderate financial impact');
  }

  if (notification.dueDate) {
    const days = daysBetween(options.now.slice(0, 10), notification.dueDate);
    if (days <= 0) {
      score += 25;
      reasons.push('due now');
    } else if (days <= 3) {
      score += 15;
      reasons.push('due soon');
    } else if (days <= 7) {
      score += 6;
      reasons.push('due this week');
    }
  }

  if (notification.entityType === 'bill' || notification.entityType === 'account') {
    score += 8;
    reasons.push(`${notification.entityType} alert`);
  }

  const history = options.history;
  if (
    notification.status === 'dismissed' ||
    history?.dismissedNotificationIds?.includes(notification.id)
  ) {
    score -= 60;
    reasons.push('previously dismissed');
  }
  if (notification.entityId && history?.dismissedEntityIds?.includes(notification.entityId)) {
    score -= 25;
    reasons.push('related entity dismissed before');
  }
  if (notification.status === 'read' || history?.readNotificationIds?.includes(notification.id)) {
    score -= 12;
    reasons.push('already read');
  }

  const pinned = notification.severity === 'critical' && options.criticalPassthrough !== false;
  return { notification, score: Math.max(0, Math.round(score)), reasons, pinned };
}

export function prioritizeAndBundleNotifications(
  notifications: readonly SmartNotification[],
  options: NotificationPrioritizationOptions,
): NotificationBundle[] {
  const scored = notifications
    .map((notification) => scoreNotification(notification, options))
    .filter((item) => item.notification.status !== 'dismissed' || item.score > 0);
  const singles: NotificationBundle[] = [];
  const groups = new Map<string, PrioritizedNotification[]>();

  for (const item of scored) {
    if (item.pinned || item.score >= 80) {
      singles.push(singleBundle(item));
      continue;
    }
    const key = bundleKey(item.notification, options.bundleWindowHours ?? 24);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  for (const [key, children] of groups) {
    const sorted = [...children].sort((left, right) => right.score - left.score);
    if (sorted.length === 1) {
      singles.push(singleBundle(sorted[0]));
    } else {
      singles.push({
        id: `bundle-${key}`,
        kind: 'bundle',
        score: sorted[0].score,
        title: `${sorted.length} related ${sorted[0].notification.entityType ?? sorted[0].notification.type} notifications`,
        topReason: sorted[0].reasons[0],
        count: sorted.length,
        children: sorted,
        pinned: false,
      });
    }
  }

  return singles.sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      right.score - left.score ||
      left.title.localeCompare(right.title),
  );
}

export function serializeNotificationBundles(bundles: readonly NotificationBundle[]): string {
  return JSON.stringify(
    bundles.map((bundle) => ({
      id: bundle.id,
      kind: bundle.kind,
      count: bundle.count,
      childIds: bundle.children.map((child) => child.notification.id),
    })),
  );
}

function singleBundle(item: PrioritizedNotification): NotificationBundle {
  return {
    id: `single-${item.notification.id}`,
    kind: 'single',
    score: item.score,
    title: item.notification.title,
    topReason: item.reasons[0],
    count: 1,
    children: [item],
    pinned: item.pinned,
  };
}

function bundleKey(notification: SmartNotification, windowHours: number): string {
  const date = new Date(notification.createdAt);
  const bucket = Math.floor(date.getTime() / (Math.max(1, windowHours) * 3_600_000));
  return [
    notification.entityType ?? notification.type,
    notification.entityId ?? notification.deduplicationKey ?? notification.type,
    bucket,
  ].join(':');
}

function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
}
