// SPDX-License-Identifier: BUSL-1.1

/**
 * Gentle onboarding re-engagement decision model.
 *
 * Pure logic for detecting lapsed setup, producing supportive copy, and
 * respecting dismissal plus consent before reminders or analytics are used.
 *
 * References: issue #2299
 */

export type SetupMilestoneId =
  | 'comfort-settings'
  | 'privacy-choice'
  | 'life-stage'
  | 'starter-budget'
  | 'first-goal'
  | 'first-lesson'
  | 'setup-checklist';

export type ReEngagementActionId =
  | 'review-comfort-settings'
  | 'choose-privacy-mode'
  | 'pick-life-stage'
  | 'create-budget'
  | 'create-goal'
  | 'continue-learning'
  | 'open-checklist';

export interface SetupMilestone {
  readonly id: SetupMilestoneId;
  readonly label: string;
  readonly completed: boolean;
  readonly actionId: ReEngagementActionId;
}

export interface ReEngagementConsent {
  readonly analytics: boolean;
  readonly email: boolean;
  readonly notifications: boolean;
}

export interface ReEngagementInput {
  readonly now: Date;
  readonly lastActiveAt?: Date;
  readonly inactivityThresholdDays?: number;
  readonly milestones: readonly SetupMilestone[];
  readonly dismissedUntil?: Date;
  readonly consent: ReEngagementConsent;
}

export interface ReEngagementDecision {
  readonly shouldShow: boolean;
  readonly inactiveDays: number;
  readonly completed: readonly SetupMilestone[];
  readonly remaining: readonly SetupMilestone[];
  readonly primaryAction?: ReEngagementAction;
  readonly secondaryAction: ReEngagementAction;
  readonly message: string;
  readonly canSendReminder: boolean;
  readonly canTrackAnalytics: boolean;
  readonly reasons: readonly string[];
}

export interface ReEngagementAction {
  readonly id: ReEngagementActionId | 'dismiss';
  readonly label: string;
}

export const DEFAULT_RE_ENGAGEMENT_THRESHOLD_DAYS = 3;

export const DEFAULT_SETUP_MILESTONES: readonly SetupMilestone[] = [
  {
    id: 'comfort-settings',
    label: 'Comfort settings selected',
    completed: false,
    actionId: 'review-comfort-settings',
  },
  {
    id: 'privacy-choice',
    label: 'Privacy mode chosen',
    completed: false,
    actionId: 'choose-privacy-mode',
  },
  {
    id: 'life-stage',
    label: 'Life-stage guidance chosen',
    completed: false,
    actionId: 'pick-life-stage',
  },
  {
    id: 'starter-budget',
    label: 'Starter or first budget created',
    completed: false,
    actionId: 'create-budget',
  },
  {
    id: 'first-goal',
    label: 'First goal drafted',
    completed: false,
    actionId: 'create-goal',
  },
  {
    id: 'first-lesson',
    label: 'First learning lesson completed',
    completed: false,
    actionId: 'continue-learning',
  },
  {
    id: 'setup-checklist',
    label: 'Setup checklist reviewed',
    completed: false,
    actionId: 'open-checklist',
  },
];

const ACTION_LABELS: Record<ReEngagementActionId, string> = {
  'review-comfort-settings': 'Review comfort settings',
  'choose-privacy-mode': 'Choose privacy mode',
  'pick-life-stage': 'Pick guidance that fits you',
  'create-budget': 'Continue your budget setup',
  'create-goal': 'Create a first goal',
  'continue-learning': 'Try a short learning step',
  'open-checklist': 'Open setup checklist',
};

export function buildSetupMilestones(
  completedIds: readonly SetupMilestoneId[],
  baseMilestones: readonly SetupMilestone[] = DEFAULT_SETUP_MILESTONES,
): SetupMilestone[] {
  const completed = new Set(completedIds);
  return baseMilestones.map((milestone) => ({
    ...milestone,
    completed: completed.has(milestone.id),
  }));
}

export function decideReEngagement(input: ReEngagementInput): ReEngagementDecision {
  const thresholdDays = Math.max(
    1,
    Math.floor(input.inactivityThresholdDays ?? DEFAULT_RE_ENGAGEMENT_THRESHOLD_DAYS),
  );
  const inactiveDays = calculateInactiveDays(input.lastActiveAt, input.now);
  const completed = input.milestones.filter((milestone) => milestone.completed);
  const remaining = input.milestones.filter((milestone) => !milestone.completed);
  const reasons: string[] = [];

  if (!input.lastActiveAt) reasons.push('No previous activity timestamp is available.');
  if (inactiveDays < thresholdDays) reasons.push('User has not been inactive long enough.');
  if (remaining.length === 0) reasons.push('Setup is already complete.');
  if (input.dismissedUntil && input.dismissedUntil > input.now) reasons.push('Re-engagement was dismissed recently.');

  const shouldShow = reasons.length === 0;
  const primaryAction = remaining[0]
    ? {
        id: remaining[0].actionId,
        label: ACTION_LABELS[remaining[0].actionId],
      }
    : undefined;

  return {
    shouldShow,
    inactiveDays,
    completed,
    remaining,
    primaryAction,
    secondaryAction: { id: 'dismiss', label: 'Not now' },
    message: buildWelcomeBackMessage(completed, remaining, inactiveDays),
    canSendReminder: input.consent.email || input.consent.notifications,
    canTrackAnalytics: input.consent.analytics,
    reasons,
  };
}

export function nextDismissedUntil(now: Date, snoozeDays = 7): Date {
  const days = Math.max(1, Math.floor(snoozeDays));
  const dismissedUntil = new Date(now);
  dismissedUntil.setUTCDate(dismissedUntil.getUTCDate() + days);
  return dismissedUntil;
}

export function buildWelcomeBackMessage(
  completed: readonly SetupMilestone[],
  remaining: readonly SetupMilestone[],
  inactiveDays: number,
): string {
  const completedCount = completed.length;
  const remainingCount = remaining.length;
  const dayCopy = inactiveDays === 1 ? '1 day' : `${inactiveDays} days`;

  if (remainingCount === 0) {
    return `Welcome back. Your setup checklist is complete, and you can keep exploring at your pace.`;
  }

  if (completedCount === 0) {
    return `Welcome back after ${dayCopy}. You can start with one small setup step when you are ready.`;
  }

  const stepCopy = remainingCount === 1 ? '1 setup step' : `${remainingCount} setup steps`;
  return `Welcome back after ${dayCopy}. You finished ${completedCount} step(s); ${stepCopy} remain, and there is no rush.`;
}

function calculateInactiveDays(lastActiveAt: Date | undefined, now: Date): number {
  if (!lastActiveAt) return 0;
  const milliseconds = now.getTime() - lastActiveAt.getTime();
  if (milliseconds <= 0) return 0;
  return Math.floor(milliseconds / 86_400_000);
}
