// SPDX-License-Identifier: BUSL-1.1

/**
 * Onboarding step order, labels, anchors, and the deferred-setup resume point.
 * Extracted from `OnboardingPage.tsx` (#3712).
 */

import type { OnboardingStep } from './types';

export const ONBOARDING_STEP_ORDER: readonly OnboardingStep[] = [
  'comfort',
  'choose',
  'privacy',
  'newcomer',
  'goals',
  'template',
  'complete',
];

export const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  comfort: 'Comfort preferences',
  choose: 'Choose setup path',
  privacy: 'Privacy preferences',
  newcomer: 'Personalize your setup',
  goals: 'Set a savings goal',
  template: 'Starter budget template',
  complete: 'Setup complete',
};

// The deferred education/setup sequence (#3118) that runs after the privacy step
// for local-only users, and as the resume point for authenticated post-signup
// visitors (#3089).
export const DEFERRED_SETUP_START_STEP: OnboardingStep = 'newcomer';

export const TEMPLATE_GUIDANCE_ANCHOR = 'onboarding-life-stage-guidance';
export const TEMPLATE_LESSONS_ANCHOR = 'onboarding-financial-lessons';
