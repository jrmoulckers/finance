// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it } from 'vitest';
import {
  generateTips,
  dismissTip,
  isTipDismissed,
  clearDismissedTips,
  type TipGeneratorInput,
} from './tips-engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<TipGeneratorInput> = {}): TipGeneratorInput {
  return {
    netWorth: 500000, // $5,000
    spentThisMonth: 200000, // $2,000
    incomeThisMonth: 400000, // $4,000
    monthlyBudget: 300000, // $3,000
    budgetSpent: 150000, // $1,500
    accountCount: 2,
    budgetCount: 3,
    goalCount: 2,
    transactionCount: 15,
    goalsReached: 0,
    averageGoalProgress: 45,
    dayOfMonth: 15,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tips-engine', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('generateTips', () => {
    it('returns tips sorted by score (highest first)', () => {
      const tips = generateTips(makeInput(), undefined, 10);
      for (let i = 1; i < tips.length; i++) {
        expect(tips[i].score).toBeLessThanOrEqual(tips[i - 1].score);
      }
    });

    it('limits results to maxTips', () => {
      const tips = generateTips(makeInput(), undefined, 2);
      expect(tips.length).toBeLessThanOrEqual(2);
    });

    it('filters by context when provided', () => {
      const tips = generateTips(makeInput({ budgetCount: 0 }), 'budgets', 10);
      expect(tips.every((t) => t.context === 'budgets' || t.context === 'general')).toBe(true);
    });

    it('generates budget creation tip when no budgets exist', () => {
      const tips = generateTips(makeInput({ budgetCount: 0, monthlyBudget: 0 }), undefined, 10);
      expect(tips.some((t) => t.id === 'budget-create-first')).toBe(true);
    });

    it('generates critical tip when budget is nearly exhausted', () => {
      const tips = generateTips(
        makeInput({ monthlyBudget: 100000, budgetSpent: 95000 }),
        undefined,
        10,
      );
      expect(tips.some((t) => t.id === 'budget-nearly-exceeded')).toBe(true);
      const tip = tips.find((t) => t.id === 'budget-nearly-exceeded')!;
      expect(tip.severity).toBe('critical');
    });

    it('generates warning when spending is ahead of pace', () => {
      const tips = generateTips(
        makeInput({ monthlyBudget: 100000, budgetSpent: 80000, dayOfMonth: 10 }),
        undefined,
        10,
      );
      expect(tips.some((t) => t.id === 'budget-ahead-of-pace')).toBe(true);
    });

    it('generates success tip when budget is under pace', () => {
      const tips = generateTips(
        makeInput({ monthlyBudget: 100000, budgetSpent: 30000, dayOfMonth: 20 }),
        undefined,
        10,
      );
      expect(tips.some((t) => t.id === 'budget-under-pace')).toBe(true);
      const tip = tips.find((t) => t.id === 'budget-under-pace')!;
      expect(tip.severity).toBe('success');
    });

    it('generates goal creation tip when no goals exist', () => {
      const tips = generateTips(makeInput({ goalCount: 0 }), undefined, 10);
      expect(tips.some((t) => t.id === 'goal-create-first')).toBe(true);
    });

    it('generates congratulations when goals are reached', () => {
      const tips = generateTips(makeInput({ goalsReached: 2 }), undefined, 10);
      const tip = tips.find((t) => t.id === 'goal-congratulations');
      expect(tip).toBeDefined();
      expect(tip!.severity).toBe('success');
      expect(tip!.title).toContain('2 goals');
    });

    it('generates overspending warning when expenses exceed income', () => {
      const tips = generateTips(
        makeInput({ incomeThisMonth: 200000, spentThisMonth: 300000 }),
        undefined,
        10,
      );
      expect(tips.some((t) => t.id === 'spending-overspending')).toBe(true);
    });

    it('generates excellent savings rate tip when >= 20%', () => {
      const tips = generateTips(
        makeInput({ incomeThisMonth: 500000, spentThisMonth: 200000 }),
        undefined,
        10,
      );
      expect(tips.some((t) => t.id === 'spending-great-savings-rate')).toBe(true);
    });

    it('generates account creation tip when no accounts exist', () => {
      const tips = generateTips(makeInput({ accountCount: 0 }), undefined, 10);
      expect(tips.some((t) => t.id === 'account-create-first')).toBe(true);
    });

    it('generates negative net worth tip', () => {
      const tips = generateTips(makeInput({ netWorth: -50000 }), undefined, 10);
      expect(tips.some((t) => t.id === 'account-negative-net-worth')).toBe(true);
    });

    it('generates month-start tip in first 3 days', () => {
      const tips = generateTips(makeInput({ dayOfMonth: 2 }), undefined, 10);
      expect(tips.some((t) => t.id === 'general-month-start')).toBe(true);
    });

    it('generates month-end tip after day 25', () => {
      const tips = generateTips(makeInput({ dayOfMonth: 27 }), undefined, 10);
      expect(tips.some((t) => t.id === 'general-month-end')).toBe(true);
    });

    it('generates no-transactions tip when tracking is empty after day 5', () => {
      const tips = generateTips(makeInput({ transactionCount: 0, dayOfMonth: 10 }), undefined, 10);
      expect(tips.some((t) => t.id === 'spending-no-transactions')).toBe(true);
    });

    it('does not generate no-transactions tip in first 5 days', () => {
      const tips = generateTips(makeInput({ transactionCount: 0, dayOfMonth: 3 }), undefined, 10);
      expect(tips.some((t) => t.id === 'spending-no-transactions')).toBe(false);
    });
  });

  describe('tip dismissal', () => {
    it('isTipDismissed returns false for a new tip', () => {
      expect(isTipDismissed('some-tip')).toBe(false);
    });

    it('dismissTip persists and isTipDismissed returns true', () => {
      dismissTip('my-tip');
      expect(isTipDismissed('my-tip')).toBe(true);
    });

    it('dismissTip does not duplicate IDs', () => {
      dismissTip('my-tip');
      dismissTip('my-tip');
      const stored = JSON.parse(localStorage.getItem('finance_dismissed_tips')!);
      expect(stored.filter((id: string) => id === 'my-tip').length).toBe(1);
    });

    it('clearDismissedTips resets everything', () => {
      dismissTip('tip-1');
      dismissTip('tip-2');
      expect(isTipDismissed('tip-1')).toBe(true);

      clearDismissedTips();
      expect(isTipDismissed('tip-1')).toBe(false);
      expect(isTipDismissed('tip-2')).toBe(false);
    });

    it('handles corrupt localStorage gracefully', () => {
      localStorage.setItem('finance_dismissed_tips', 'not-json');
      expect(isTipDismissed('test')).toBe(false);
    });
  });

  describe('tip action properties', () => {
    it('budget-create-first has actionLabel and actionRoute', () => {
      const tips = generateTips(makeInput({ budgetCount: 0, monthlyBudget: 0 }), undefined, 10);
      const tip = tips.find((t) => t.id === 'budget-create-first')!;
      expect(tip.actionLabel).toBe('Create Budget');
      expect(tip.actionRoute).toBe('/budgets');
    });

    it('account-create-first has actionLabel and actionRoute', () => {
      const tips = generateTips(makeInput({ accountCount: 0 }), undefined, 10);
      const tip = tips.find((t) => t.id === 'account-create-first')!;
      expect(tip.actionLabel).toBe('Add Account');
      expect(tip.actionRoute).toBe('/accounts');
    });
  });
});
