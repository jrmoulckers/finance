// SPDX-License-Identifier: BUSL-1.1

export type OnboardingStepStatus = 'idle' | 'current' | 'complete' | 'error' | 'saving';

export interface OnboardingProgressInput {
  stepLabel: string;
  stepIndex: number;
  totalSteps: number;
  status: OnboardingStepStatus;
  errorCount?: number;
}

export interface OnboardingStepA11yProps {
  'aria-current'?: 'step';
  'aria-invalid'?: 'true';
  'aria-describedby'?: string;
  'data-step-status': OnboardingStepStatus;
}

function clampStep(stepIndex: number, totalSteps: number): number {
  return Math.min(Math.max(stepIndex, 0), Math.max(totalSteps - 1, 0));
}

export function buildOnboardingProgressAnnouncement(input: OnboardingProgressInput): string {
  const total = Math.max(input.totalSteps, 1);
  const current = clampStep(input.stepIndex, total) + 1;
  const prefix = `Step ${current} of ${total}: ${input.stepLabel}.`;

  switch (input.status) {
    case 'complete':
      return `${prefix} Completed.`;
    case 'error': {
      const count = Math.max(input.errorCount ?? 1, 1);
      const label = count === 1 ? 'error' : 'errors';
      return `${prefix} ${count} ${label} need attention.`;
    }
    case 'saving':
      return `${prefix} Saving preferences.`;
    case 'current':
      return `${prefix} Current step.`;
    default:
      return prefix;
  }
}

export function getOnboardingStepA11yProps(input: {
  status: OnboardingStepStatus;
  describedById?: string;
}): OnboardingStepA11yProps {
  return {
    ...(input.status === 'current' ? { 'aria-current': 'step' as const } : {}),
    ...(input.status === 'error' ? { 'aria-invalid': 'true' as const } : {}),
    ...(input.describedById ? { 'aria-describedby': input.describedById } : {}),
    'data-step-status': input.status,
  };
}

export function summarizeOnboardingErrors(errors: readonly string[]): string {
  if (errors.length === 0) {
    return 'No onboarding errors.';
  }

  const label = errors.length === 1 ? 'error' : 'errors';
  return `${errors.length} ${label}: ${errors.join('; ')}`;
}
