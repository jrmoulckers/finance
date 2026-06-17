// SPDX-License-Identifier: BUSL-1.1

import type { ReEngagementDecision } from './re-engagement';

export type ReEngagementReminderChannel = 'notification' | 'email';

export interface ReEngagementReminderPlan {
  readonly reminders: readonly {
    readonly channel: ReEngagementReminderChannel;
    readonly allowed: boolean;
    readonly reason: string;
  }[];
  readonly analyticsEvent:
    | {
        readonly name: 'onboarding_re_engagement_shown';
        readonly properties: Readonly<Record<string, string | number | boolean>>;
      }
    | null;
  readonly interruptionSuppressed: boolean;
  readonly copy: string;
}

export function buildReEngagementReminderPlan(params: {
  readonly decision: ReEngagementDecision;
  readonly requestedChannels: readonly ReEngagementReminderChannel[];
  readonly dismissedUntil?: Date;
  readonly now: Date;
}): ReEngagementReminderPlan {
  const suppressed = params.dismissedUntil !== undefined && params.dismissedUntil > params.now;
  const reminders = params.requestedChannels.map((channel) => {
    const consentAllows = params.decision.canSendReminder;
    const allowed = params.decision.shouldShow && consentAllows && !suppressed;
    return {
      channel,
      allowed,
      reason: allowed
        ? 'Consent permits this gentle reminder.'
        : suppressed
          ? 'Reminder suppressed after dismissal.'
          : consentAllows
            ? 'Welcome-back surface is not currently eligible.'
            : 'Reminder consent is not enabled.',
    };
  });

  return {
    reminders,
    analyticsEvent:
      params.decision.shouldShow && params.decision.canTrackAnalytics && !suppressed
        ? {
            name: 'onboarding_re_engagement_shown',
            properties: {
              inactiveDays: params.decision.inactiveDays,
              remainingSteps: params.decision.remaining.length,
              hasPrimaryAction: params.decision.primaryAction !== undefined,
            },
          }
        : null,
    interruptionSuppressed: suppressed,
    copy: 'A short setup reminder is available when you want it. You can dismiss it any time.',
  };
}
