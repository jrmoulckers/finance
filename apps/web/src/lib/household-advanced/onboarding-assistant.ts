// SPDX-License-Identifier: BUSL-1.1

/**
 * Onboarding assistant for household setup.
 *
 * Guides users through a step-by-step flow: invite partner, set shared
 * categories, configure privacy, set budgets, and review. Supports
 * skip/resume and provides recommended defaults per household type.
 *
 * All functions are pure — no side effects.
 *
 * References: issue #1722
 */

import type {
  HouseholdId,
  HouseholdType,
  ISODateString,
  OnboardingDefaults,
  OnboardingProgress,
  OnboardingStep,
  OnboardingStepId,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_DEFINITIONS: readonly Omit<OnboardingStep, 'completed' | 'skipped'>[] = [
  {
    id: 'invite_partner',
    title: 'Invite Partner',
    description: 'Send an invitation to your household member(s).',
    required: true,
  },
  {
    id: 'set_shared_categories',
    title: 'Set Shared Categories',
    description: 'Choose which spending categories are shared.',
    required: true,
  },
  {
    id: 'configure_privacy',
    title: 'Configure Privacy',
    description: 'Decide how much financial detail each member can see.',
    required: true,
  },
  {
    id: 'set_budgets',
    title: 'Set Budgets',
    description: 'Establish shared budget targets.',
    required: false,
  },
  {
    id: 'review',
    title: 'Review & Confirm',
    description: 'Review your household settings before finalising.',
    required: true,
  },
];

// ---------------------------------------------------------------------------
// Default Recommendations
// ---------------------------------------------------------------------------

const DEFAULTS_BY_TYPE: Record<HouseholdType, OnboardingDefaults> = {
  couple: {
    householdType: 'couple',
    sharedCategories: ['rent', 'groceries', 'utilities', 'dining'],
    privacySetting: 'full_visibility',
    suggestedBudgetPercent: 50,
  },
  roommates: {
    householdType: 'roommates',
    sharedCategories: ['rent', 'utilities', 'household_supplies'],
    privacySetting: 'summary_only',
    suggestedBudgetPercent: 30,
  },
  family: {
    householdType: 'family',
    sharedCategories: ['rent', 'groceries', 'utilities', 'childcare', 'education', 'dining'],
    privacySetting: 'full_visibility',
    suggestedBudgetPercent: 60,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a fresh onboarding progress tracker.
 *
 * @param householdId - The household to onboard.
 * @param householdType - The type of household (determines defaults).
 * @param now - Current ISO timestamp.
 * @returns A new {@link OnboardingProgress} at step 0.
 */
export function createOnboardingProgress(
  householdId: HouseholdId,
  householdType: HouseholdType,
  now: ISODateString,
): OnboardingProgress {
  const steps: OnboardingStep[] = STEP_DEFINITIONS.map((s) => ({
    ...s,
    completed: false,
    skipped: false,
  }));
  return {
    householdId,
    householdType,
    steps,
    currentStepIndex: 0,
    startedAt: now,
    completedAt: null,
  };
}

/**
 * Return the recommended defaults for a given household type.
 *
 * @param householdType - Household archetype.
 * @returns Recommended configuration defaults.
 */
export function getDefaultsForType(householdType: HouseholdType): OnboardingDefaults {
  return DEFAULTS_BY_TYPE[householdType];
}

/**
 * Mark the current step as completed and advance to the next.
 *
 * If the final step is completed the progress is marked as finished.
 *
 * @param progress - Current onboarding progress.
 * @param now - Current ISO timestamp (used when completing final step).
 * @returns Updated progress.
 */
export function completeStep(progress: OnboardingProgress, now: ISODateString): OnboardingProgress {
  const { steps, currentStepIndex } = progress;
  if (currentStepIndex >= steps.length) return progress;

  const updatedSteps = steps.map((s, i) =>
    i === currentStepIndex ? { ...s, completed: true, skipped: false } : s,
  );

  const nextIndex = currentStepIndex + 1;
  const isFinished = nextIndex >= steps.length;

  return {
    ...progress,
    steps: updatedSteps,
    currentStepIndex: isFinished ? currentStepIndex : nextIndex,
    completedAt: isFinished ? now : null,
  };
}

/**
 * Skip the current step if it is not required.
 *
 * Required steps cannot be skipped and the progress is returned unchanged.
 *
 * @param progress - Current onboarding progress.
 * @returns Updated progress (unchanged if step is required).
 */
export function skipStep(progress: OnboardingProgress): OnboardingProgress {
  const { steps, currentStepIndex } = progress;
  if (currentStepIndex >= steps.length) return progress;

  const step = steps[currentStepIndex];
  if (step.required) return progress;

  const updatedSteps = steps.map((s, i) =>
    i === currentStepIndex ? { ...s, skipped: true, completed: false } : s,
  );

  const nextIndex = currentStepIndex + 1;

  return {
    ...progress,
    steps: updatedSteps,
    currentStepIndex: Math.min(nextIndex, steps.length - 1),
  };
}

/**
 * Resume onboarding at the first incomplete, unskipped step.
 *
 * @param progress - Existing progress to resume.
 * @returns Updated progress with `currentStepIndex` set to the first actionable step.
 */
export function resumeOnboarding(progress: OnboardingProgress): OnboardingProgress {
  const idx = progress.steps.findIndex((s) => !s.completed && !s.skipped);
  return {
    ...progress,
    currentStepIndex: idx === -1 ? progress.steps.length - 1 : idx,
  };
}

/**
 * Compute completion percentage (0–100).
 *
 * Both completed and skipped steps count toward progress.
 *
 * @param progress - Current onboarding progress.
 * @returns Integer percentage 0–100.
 */
export function getCompletionPercent(progress: OnboardingProgress): number {
  const { steps } = progress;
  if (steps.length === 0) return 100;
  const done = steps.filter((s) => s.completed || s.skipped).length;
  return Math.round((done / steps.length) * 100);
}

/**
 * Check whether onboarding is fully completed.
 *
 * All required steps must be completed; optional steps may be skipped.
 *
 * @param progress - Current onboarding progress.
 * @returns `true` when all required steps are completed.
 */
export function isOnboardingComplete(progress: OnboardingProgress): boolean {
  return progress.steps.filter((s) => s.required).every((s) => s.completed);
}

/**
 * Return the step definition for the current step.
 *
 * @param progress - Current onboarding progress.
 * @returns The current {@link OnboardingStep}, or `null` if already finished.
 */
export function getCurrentStep(progress: OnboardingProgress): OnboardingStep | null {
  return progress.steps[progress.currentStepIndex] ?? null;
}

/**
 * Return all available step IDs.
 *
 * @returns Ordered array of {@link OnboardingStepId}.
 */
export function getStepIds(): readonly OnboardingStepId[] {
  return STEP_DEFINITIONS.map((s) => s.id);
}
