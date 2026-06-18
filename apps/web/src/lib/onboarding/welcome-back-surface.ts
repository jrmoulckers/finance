// SPDX-License-Identifier: BUSL-1.1

import {
  nextDismissedUntil,
  type ReEngagementAction,
  type ReEngagementDecision,
} from './re-engagement';

export interface WelcomeBackSurface {
  readonly visible: boolean;
  readonly title: string;
  readonly message: string;
  readonly completedCount: number;
  readonly remainingCount: number;
  readonly primaryAction?: ReEngagementAction;
  readonly secondaryAction: ReEngagementAction;
  readonly ariaLabel: string;
}

export interface WelcomeBackState {
  readonly lastActiveAt?: string;
  readonly dismissedUntil?: string;
}

export function buildWelcomeBackSurface(decision: ReEngagementDecision): WelcomeBackSurface {
  return {
    visible: decision.shouldShow,
    title: 'Welcome back',
    message: decision.message,
    completedCount: decision.completed.length,
    remainingCount: decision.remaining.length,
    primaryAction: decision.primaryAction,
    secondaryAction: decision.secondaryAction,
    ariaLabel: decision.shouldShow
      ? `Welcome back. ${decision.remaining.length} setup step(s) remain.`
      : 'Welcome back message is hidden.',
  };
}

export function recordLastActive(state: WelcomeBackState, now: Date): WelcomeBackState {
  return { ...state, lastActiveAt: now.toISOString() };
}

export function dismissWelcomeBack(
  state: WelcomeBackState,
  now: Date,
  snoozeDays = 7,
): WelcomeBackState {
  return { ...state, dismissedUntil: nextDismissedUntil(now, snoozeDays).toISOString() };
}

export const RE_ENGAGEMENT_ACTION_ROUTES: Readonly<
  Record<Exclude<ReEngagementAction['id'], 'dismiss'>, string>
> = {
  'review-comfort-settings': '/onboarding?step=comfort-settings',
  'choose-privacy-mode': '/onboarding?step=privacy-choice',
  'pick-life-stage': '/onboarding?step=life-stage',
  'create-budget': '/budgets?intent=create',
  'create-goal': '/goals?intent=create',
  'continue-learning': '/onboarding?step=first-lesson',
  'open-checklist': '/onboarding?step=setup-checklist',
};

export function getWelcomeBackActionHref(action: ReEngagementAction | undefined): string | null {
  if (!action || action.id === 'dismiss') return null;
  return RE_ENGAGEMENT_ACTION_ROUTES[action.id];
}
