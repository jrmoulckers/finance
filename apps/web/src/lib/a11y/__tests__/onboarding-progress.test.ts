// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildOnboardingProgressAnnouncement,
  getOnboardingStepA11yProps,
  summarizeOnboardingErrors,
} from '../onboarding-progress';

describe('onboarding progress accessibility helpers', () => {
  it('announces current step progress', () => {
    expect(
      buildOnboardingProgressAnnouncement({
        stepLabel: 'Choose comfort settings',
        stepIndex: 0,
        totalSteps: 5,
        status: 'current',
      }),
    ).toBe('Step 1 of 5: Choose comfort settings. Current step.');
  });

  it('announces errors with counts', () => {
    expect(
      buildOnboardingProgressAnnouncement({
        stepLabel: 'Privacy choice',
        stepIndex: 2,
        totalSteps: 5,
        status: 'error',
        errorCount: 2,
      }),
    ).toBe('Step 3 of 5: Privacy choice. 2 errors need attention.');
  });

  it('sets step state props for current and invalid steps', () => {
    expect(getOnboardingStepA11yProps({ status: 'current', describedById: 'step-help' })).toEqual({
      'aria-current': 'step',
      'aria-describedby': 'step-help',
      'data-step-status': 'current',
    });
    expect(getOnboardingStepA11yProps({ status: 'error' })).toEqual({
      'aria-invalid': 'true',
      'data-step-status': 'error',
    });
  });

  it('summarizes onboarding errors for an error summary region', () => {
    expect(summarizeOnboardingErrors(['Choose an account path', 'Review privacy copy'])).toBe(
      '2 errors: Choose an account path; Review privacy copy',
    );
  });
});
