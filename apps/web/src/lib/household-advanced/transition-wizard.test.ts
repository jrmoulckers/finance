// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  createTransitionPlan,
  advanceStep,
  getCurrentTransitionStep,
  isTransitionComplete,
  divideAssets,
  divideAssetsByWeight,
  createTimelineEvent,
  getDefaultChecklist,
  toggleChecklistItem,
  isChecklistComplete,
  hasPremiumAccess,
} from './transition-wizard';

const NOW = '2025-01-15T10:00:00.000Z';
const LATER = '2025-01-15T11:00:00.000Z';

describe('transition-wizard', () => {
  describe('premium gate', () => {
    it('createTransitionPlan returns null for non-premium', () => {
      expect(createTransitionPlan('hh1', false, NOW)).toBeNull();
    });

    it('createTransitionPlan returns a plan for premium', () => {
      const plan = createTransitionPlan('hh1', true, NOW);
      expect(plan).not.toBeNull();
      expect(plan!.steps).toHaveLength(5);
      expect(plan!.isPremium).toBe(true);
    });

    it('hasPremiumAccess returns correct boolean', () => {
      expect(hasPremiumAccess(true)).toBe(true);
      expect(hasPremiumAccess(false)).toBe(false);
    });
  });

  describe('step navigation', () => {
    it('advances a step to completed', () => {
      const plan = createTransitionPlan('hh1', true, NOW)!;
      const p2 = advanceStep(plan, 'completed', LATER);
      expect(p2.steps[0].status).toBe('completed');
      expect(p2.currentStepIndex).toBe(1);
    });

    it('marks in_progress without advancing', () => {
      const plan = createTransitionPlan('hh1', true, NOW)!;
      const p2 = advanceStep(plan, 'in_progress', LATER);
      expect(p2.steps[0].status).toBe('in_progress');
      expect(p2.currentStepIndex).toBe(0);
    });

    it('sets completedAt when final step is completed', () => {
      let plan = createTransitionPlan('hh1', true, NOW)!;
      for (let i = 0; i < 5; i++) {
        plan = advanceStep(plan, 'completed', LATER);
      }
      expect(plan.completedAt).toBe(LATER);
    });

    it('does not advance for non-premium plan', () => {
      const plan = createTransitionPlan('hh1', true, NOW)!;
      const nonPremium = { ...plan, isPremium: false };
      const p2 = advanceStep(nonPremium, 'completed', LATER);
      expect(p2.currentStepIndex).toBe(0);
    });

    it('getCurrentTransitionStep returns the current step', () => {
      const plan = createTransitionPlan('hh1', true, NOW)!;
      const step = getCurrentTransitionStep(plan);
      expect(step?.id).toBe('separate_accounts');
    });
  });

  describe('isTransitionComplete', () => {
    it('returns false for fresh plan', () => {
      const plan = createTransitionPlan('hh1', true, NOW)!;
      expect(isTransitionComplete(plan)).toBe(false);
    });

    it('returns true when all steps are completed or skipped', () => {
      let plan = createTransitionPlan('hh1', true, NOW)!;
      for (let i = 0; i < 5; i++) {
        plan = advanceStep(plan, i === 2 ? 'skipped' : 'completed', LATER);
      }
      expect(isTransitionComplete(plan)).toBe(true);
    });
  });

  describe('divideAssets', () => {
    it('divides equally among members', () => {
      const result = divideAssets(10000, ['u1', 'u2']);
      expect(result.shares).toHaveLength(2);
      expect(result.shares[0].amountCents).toBe(5000);
      expect(result.shares[1].amountCents).toBe(5000);
      expect(result.isFair).toBe(true);
    });

    it('handles remainder correctly', () => {
      const result = divideAssets(10001, ['u1', 'u2', 'u3']);
      const total = result.shares.reduce((s, sh) => s + sh.amountCents, 0);
      expect(total).toBe(10001);
      expect(result.isFair).toBe(true);
    });

    it('handles empty members', () => {
      const result = divideAssets(10000, []);
      expect(result.shares).toHaveLength(0);
      expect(result.isFair).toBe(true);
    });

    it('handles zero total', () => {
      const result = divideAssets(0, ['u1', 'u2']);
      expect(result.shares[0].amountCents).toBe(0);
      expect(result.shares[0].percentage).toBe(0);
    });
  });

  describe('divideAssetsByWeight', () => {
    it('divides by custom weights', () => {
      const result = divideAssetsByWeight(10000, [
        { userId: 'u1', weight: 70 },
        { userId: 'u2', weight: 30 },
      ]);
      expect(result.shares[0].amountCents).toBe(7000);
      expect(result.shares[1].amountCents).toBe(3000);
    });

    it('sum always equals total', () => {
      const result = divideAssetsByWeight(10001, [
        { userId: 'u1', weight: 33 },
        { userId: 'u2', weight: 33 },
        { userId: 'u3', weight: 34 },
      ]);
      const total = result.shares.reduce((s, sh) => s + sh.amountCents, 0);
      expect(total).toBe(10001);
    });

    it('handles all-zero weights', () => {
      const result = divideAssetsByWeight(10000, [
        { userId: 'u1', weight: 0 },
        { userId: 'u2', weight: 0 },
      ]);
      expect(result.shares[0].amountCents).toBe(0);
    });
  });

  describe('timeline', () => {
    it('creates a timeline event', () => {
      const event = createTimelineEvent('separate_accounts', 'completed', NOW, 'Done');
      expect(event.stepId).toBe('separate_accounts');
      expect(event.status).toBe('completed');
      expect(event.note).toBe('Done');
    });
  });

  describe('checklist', () => {
    it('returns 5 default items', () => {
      const cl = getDefaultChecklist();
      expect(cl).toHaveLength(5);
      expect(cl.every((c) => !c.completed)).toBe(true);
    });

    it('toggles a checklist item', () => {
      const cl = getDefaultChecklist();
      const cl2 = toggleChecklistItem(cl, 'update_auto_pay');
      expect(cl2.find((c) => c.id === 'update_auto_pay')?.completed).toBe(true);
    });

    it('isChecklistComplete returns true when all done', () => {
      let cl = getDefaultChecklist();
      for (const item of cl) {
        cl = toggleChecklistItem(cl, item.id);
      }
      expect(isChecklistComplete(cl)).toBe(true);
    });

    it('isChecklistComplete returns false for empty list', () => {
      expect(isChecklistComplete([])).toBe(false);
    });
  });
});
