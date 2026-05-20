import { describe, it, expect } from 'vitest';
import {
  createDefaultConfig,
  optIn,
  optOut,
  setPrivacyBudget,
  addLaplaceNoise,
  bankersRound,
  isCategoryEligible,
  verifyAnonymization,
  getAllCategories,
  remainingBudget,
} from '../differential-privacy';

describe('differential-privacy', () => {
  describe('createDefaultConfig', () => {
    it('creates opted-out config', () => {
      const config = createDefaultConfig();
      expect(config.optedIn).toBe(false);
      expect(config.eligibleCategories).toHaveLength(0);
      expect(config.epsilon).toBe(1.0);
    });
  });

  describe('optIn', () => {
    it('enables opt-in with all categories', () => {
      const config = optIn(createDefaultConfig(), '2025-01-15');
      expect(config.optedIn).toBe(true);
      expect(config.consentDate).toBe('2025-01-15');
      expect(config.eligibleCategories.length).toBeGreaterThan(0);
    });

    it('accepts specific categories', () => {
      const config = optIn(createDefaultConfig(), '2025-01-15', ['savings_rate']);
      expect(config.eligibleCategories).toEqual(['savings_rate']);
    });
  });

  describe('optOut', () => {
    it('disables opt-in and clears categories', () => {
      let config = optIn(createDefaultConfig(), '2025-01-15');
      config = optOut(config);
      expect(config.optedIn).toBe(false);
      expect(config.eligibleCategories).toHaveLength(0);
      expect(config.consentDate).toBeUndefined();
    });
  });

  describe('setPrivacyBudget', () => {
    it('updates epsilon and delta', () => {
      const config = setPrivacyBudget(createDefaultConfig(), 0.5, 1e-6);
      expect(config.epsilon).toBe(0.5);
      expect(config.delta).toBe(1e-6);
    });

    it('rejects invalid epsilon', () => {
      const config = createDefaultConfig();
      expect(setPrivacyBudget(config, 0, 1e-5)).toBe(config);
      expect(setPrivacyBudget(config, -1, 1e-5)).toBe(config);
    });

    it('rejects invalid delta', () => {
      const config = createDefaultConfig();
      expect(setPrivacyBudget(config, 1, 0)).toBe(config);
      expect(setPrivacyBudget(config, 1, 1)).toBe(config);
    });
  });

  describe('bankersRound', () => {
    it('rounds normally for non-half values', () => {
      expect(bankersRound(2.3)).toBe(2);
      expect(bankersRound(2.7)).toBe(3);
    });

    it("rounds half to even (banker's rounding)", () => {
      expect(bankersRound(2.5)).toBe(2);
      expect(bankersRound(3.5)).toBe(4);
      expect(bankersRound(4.5)).toBe(4);
      expect(bankersRound(5.5)).toBe(6);
    });

    it('handles negative values', () => {
      expect(bankersRound(-2.3)).toBe(-2);
      expect(bankersRound(-2.7)).toBe(-3);
    });
  });

  describe('addLaplaceNoise', () => {
    it('adds noise to a value', () => {
      const result = addLaplaceNoise(100000, 10000, 1.0, 0.3);
      expect(result.original).toBe(100000);
      expect(result.noised).not.toBe(100000);
      expect(result.epsilonUsed).toBe(1.0);
    });

    it('returns original for zero epsilon', () => {
      const result = addLaplaceNoise(100000, 10000, 0, 0.5);
      expect(result.noised).toBe(100000);
      expect(result.epsilonUsed).toBe(0);
    });

    it('handles uniform sample of 0.5 (mean)', () => {
      // u = 0.5 - 0.5 = 0 → noise is -scale * sign * log(1 - 0)
      const result = addLaplaceNoise(100000, 10000, 1.0, 0.5);
      expect(result.noised).toBe(100000);
    });

    it("produces integer output via banker's rounding", () => {
      const result = addLaplaceNoise(50000, 5000, 0.5, 0.25);
      expect(Number.isInteger(result.noised)).toBe(true);
    });
  });

  describe('isCategoryEligible', () => {
    it('returns true for eligible category when opted in', () => {
      const config = optIn(createDefaultConfig(), '2025-01-15');
      expect(isCategoryEligible(config, 'savings_rate')).toBe(true);
    });

    it('returns false when not opted in', () => {
      const config = createDefaultConfig();
      expect(isCategoryEligible(config, 'savings_rate')).toBe(false);
    });
  });

  describe('verifyAnonymization', () => {
    it('returns true for valid noised value', () => {
      const result = addLaplaceNoise(100000, 10000, 1.0, 0.3);
      expect(verifyAnonymization(result, 10000)).toBe(true);
    });

    it('returns false when no epsilon used', () => {
      const result = addLaplaceNoise(100000, 10000, 0, 0.5);
      expect(verifyAnonymization(result, 10000)).toBe(false);
    });
  });

  describe('getAllCategories', () => {
    it('returns all data categories', () => {
      const cats = getAllCategories();
      expect(cats).toContain('spending_by_category');
      expect(cats).toContain('savings_rate');
      expect(cats.length).toBe(4);
    });
  });

  describe('remainingBudget', () => {
    it('calculates remaining epsilon', () => {
      expect(remainingBudget(1.0, 0.3)).toBeCloseTo(0.7);
    });

    it('floors at zero', () => {
      expect(remainingBudget(1.0, 1.5)).toBe(0);
    });
  });
});
