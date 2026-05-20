// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  createOnboardingProgress,
  getDefaultsForType,
  completeStep,
  skipStep,
  resumeOnboarding,
  getCompletionPercent,
  isOnboardingComplete,
  getCurrentStep,
  getStepIds,
} from './onboarding-assistant';

const NOW = '2025-01-15T10:00:00.000Z';
const LATER = '2025-01-15T10:05:00.000Z';

describe('onboarding-assistant', () => {
  describe('createOnboardingProgress', () => {
    it('creates progress with 5 steps starting at index 0', () => {
      const p = createOnboardingProgress('hh1', 'couple', NOW);
      expect(p.householdId).toBe('hh1');
      expect(p.householdType).toBe('couple');
      expect(p.steps).toHaveLength(5);
      expect(p.currentStepIndex).toBe(0);
      expect(p.startedAt).toBe(NOW);
      expect(p.completedAt).toBeNull();
    });

    it('all steps start incomplete and unskipped', () => {
      const p = createOnboardingProgress('hh1', 'roommates', NOW);
      for (const step of p.steps) {
        expect(step.completed).toBe(false);
        expect(step.skipped).toBe(false);
      }
    });
  });

  describe('getDefaultsForType', () => {
    it('returns couple defaults', () => {
      const d = getDefaultsForType('couple');
      expect(d.householdType).toBe('couple');
      expect(d.sharedCategories).toContain('groceries');
      expect(d.privacySetting).toBe('full_visibility');
    });

    it('returns roommates defaults with summary_only privacy', () => {
      const d = getDefaultsForType('roommates');
      expect(d.privacySetting).toBe('summary_only');
    });

    it('returns family defaults', () => {
      const d = getDefaultsForType('family');
      expect(d.sharedCategories).toContain('childcare');
      expect(d.suggestedBudgetPercent).toBe(60);
    });
  });

  describe('completeStep', () => {
    it('marks the current step complete and advances', () => {
      const p = createOnboardingProgress('hh1', 'couple', NOW);
      const p2 = completeStep(p, LATER);
      expect(p2.steps[0].completed).toBe(true);
      expect(p2.currentStepIndex).toBe(1);
      expect(p2.completedAt).toBeNull();
    });

    it('marks completedAt when final step is completed', () => {
      let p = createOnboardingProgress('hh1', 'couple', NOW);
      for (let i = 0; i < 5; i++) {
        p = completeStep(p, LATER);
      }
      expect(p.completedAt).toBe(LATER);
    });

    it('is idempotent past the last step', () => {
      let p = createOnboardingProgress('hh1', 'couple', NOW);
      for (let i = 0; i < 6; i++) {
        p = completeStep(p, LATER);
      }
      expect(p.completedAt).toBe(LATER);
    });
  });

  describe('skipStep', () => {
    it('skips an optional step', () => {
      let p = createOnboardingProgress('hh1', 'couple', NOW);
      // Step 0,1,2 are required; step 3 (set_budgets) is optional
      p = completeStep(p, LATER);
      p = completeStep(p, LATER);
      p = completeStep(p, LATER);
      // Now at step 3 (set_budgets, optional)
      expect(p.steps[3].required).toBe(false);
      const p2 = skipStep(p);
      expect(p2.steps[3].skipped).toBe(true);
      expect(p2.currentStepIndex).toBe(4);
    });

    it('does not skip a required step', () => {
      const p = createOnboardingProgress('hh1', 'couple', NOW);
      expect(p.steps[0].required).toBe(true);
      const p2 = skipStep(p);
      expect(p2.steps[0].skipped).toBe(false);
      expect(p2.currentStepIndex).toBe(0);
    });
  });

  describe('resumeOnboarding', () => {
    it('resumes at the first incomplete step', () => {
      let p = createOnboardingProgress('hh1', 'couple', NOW);
      p = completeStep(p, LATER);
      p = completeStep(p, LATER);
      const resumed = resumeOnboarding({ ...p, currentStepIndex: 0 });
      expect(resumed.currentStepIndex).toBe(2);
    });
  });

  describe('getCompletionPercent', () => {
    it('returns 0 for fresh progress', () => {
      const p = createOnboardingProgress('hh1', 'couple', NOW);
      expect(getCompletionPercent(p)).toBe(0);
    });

    it('returns 100 when all complete', () => {
      let p = createOnboardingProgress('hh1', 'couple', NOW);
      for (let i = 0; i < 5; i++) {
        p = completeStep(p, LATER);
      }
      expect(getCompletionPercent(p)).toBe(100);
    });
  });

  describe('isOnboardingComplete', () => {
    it('returns false when required steps remain', () => {
      const p = createOnboardingProgress('hh1', 'couple', NOW);
      expect(isOnboardingComplete(p)).toBe(false);
    });

    it('returns true when all required steps are done (optional skipped)', () => {
      let p = createOnboardingProgress('hh1', 'couple', NOW);
      // Complete steps 0-2 (required), skip 3 (optional), complete 4 (required)
      p = completeStep(p, LATER); // invite_partner
      p = completeStep(p, LATER); // set_shared_categories
      p = completeStep(p, LATER); // configure_privacy
      p = skipStep(p); // set_budgets (optional)
      p = completeStep(p, LATER); // review
      expect(isOnboardingComplete(p)).toBe(true);
    });
  });

  describe('getCurrentStep', () => {
    it('returns the current step', () => {
      const p = createOnboardingProgress('hh1', 'couple', NOW);
      const step = getCurrentStep(p);
      expect(step?.id).toBe('invite_partner');
    });
  });

  describe('getStepIds', () => {
    it('returns 5 step IDs in order', () => {
      const ids = getStepIds();
      expect(ids).toHaveLength(5);
      expect(ids[0]).toBe('invite_partner');
      expect(ids[4]).toBe('review');
    });
  });
});
