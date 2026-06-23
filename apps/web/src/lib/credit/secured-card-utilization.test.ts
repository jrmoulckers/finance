// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the secured-card utilization helper.
 *
 * Covers: utilization math, classification thresholds, 0-limit / 0-balance /
 * over-limit edge cases, target-balance and pay-down math, guidance
 * selection, threshold normalization and input clamping.
 *
 * References: issue #2174
 */

import { describe, expect, it } from 'vitest';

import {
  computeSecuredCardUtilization,
  DEFAULT_SECURED_CARD_THRESHOLDS,
  DEFAULT_TARGET_UTILIZATION_PERCENT,
  formatUtilizationPercent,
} from './secured-card-utilization';

describe('computeSecuredCardUtilization', () => {
  describe('utilization math', () => {
    it('computes a basic percentage from balance and limit', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 15_000,
        creditLimitCents: 50_000,
      });
      expect(result.utilizationPercent).toBe(30);
    });

    it('rounds utilization to one decimal place', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 10_000,
        creditLimitCents: 30_000,
      });
      // 10000 / 30000 = 33.33% -> 33.3
      expect(result.utilizationPercent).toBe(33.3);
    });

    it('reports 0% for a zero balance', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 0,
        creditLimitCents: 50_000,
      });
      expect(result.utilizationPercent).toBe(0);
      expect(result.level).toBe('good');
    });
  });

  describe('classification thresholds', () => {
    it('classifies utilization below 30% as good', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 14_500,
        creditLimitCents: 50_000, // 29%
      });
      expect(result.level).toBe('good');
      expect(result.levelLabel).toBe('On track');
    });

    it('classifies exactly 30% as caution (good is strictly below)', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 15_000,
        creditLimitCents: 50_000, // 30%
      });
      expect(result.level).toBe('caution');
      expect(result.levelLabel).toBe('Getting high');
    });

    it('classifies 30-50% as caution', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 20_000,
        creditLimitCents: 50_000, // 40%
      });
      expect(result.level).toBe('caution');
    });

    it('classifies exactly 50% as caution (inclusive upper edge)', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 25_000,
        creditLimitCents: 50_000, // 50%
      });
      expect(result.level).toBe('caution');
    });

    it('classifies above 50% as high', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 30_000,
        creditLimitCents: 50_000, // 60%
      });
      expect(result.level).toBe('high');
      expect(result.levelLabel).toBe('Too high');
    });

    it('honours custom thresholds', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 5_000,
        creditLimitCents: 50_000, // 10%
        thresholds: { goodBelowPercent: 10, cautionAtOrBelowPercent: 20 },
      });
      // 10% is not strictly below 10 -> caution
      expect(result.level).toBe('caution');
    });

    it('normalizes thresholds when caution is below good', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 20_000,
        creditLimitCents: 50_000, // 40%
        thresholds: { goodBelowPercent: 60, cautionAtOrBelowPercent: 10 },
      });
      expect(result.thresholds.goodBelowPercent).toBe(60);
      expect(result.thresholds.cautionAtOrBelowPercent).toBe(60);
      // 40% < 60% good edge -> good
      expect(result.level).toBe('good');
    });
  });

  describe('zero-limit edge case', () => {
    it('returns null utilization and unknown level when limit is 0', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 10_000,
        creditLimitCents: 0,
      });
      expect(result.utilizationPercent).toBeNull();
      expect(result.level).toBe('unknown');
      expect(result.levelLabel).toBe('Add a limit');
      expect(result.targetBalanceCents).toBeNull();
      expect(result.remainingHeadroomCents).toBeNull();
      expect(result.payDownToTargetCents).toBe(0);
      expect(result.isOverLimit).toBe(false);
    });

    it('formats a null utilization as N/A', () => {
      expect(formatUtilizationPercent(null)).toBe('N/A');
    });
  });

  describe('over-limit edge case', () => {
    it('reports utilization above 100% and flags over-limit', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 60_000,
        creditLimitCents: 50_000, // 120%
      });
      expect(result.utilizationPercent).toBe(120);
      expect(result.level).toBe('high');
      expect(result.isOverLimit).toBe(true);
      expect(result.remainingHeadroomCents).toBe(0);
      expect(result.guidance).toContain('over your credit limit');
    });

    it('does not flag over-limit when balance equals the limit', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 50_000,
        creditLimitCents: 50_000, // 100%
      });
      expect(result.isOverLimit).toBe(false);
      expect(result.level).toBe('high');
    });
  });

  describe('target balance and pay-down math', () => {
    it('computes the target balance from the default 30% target', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 40_000,
        creditLimitCents: 50_000,
      });
      expect(result.targetUtilizationPercent).toBe(DEFAULT_TARGET_UTILIZATION_PERCENT);
      // 30% of 50000 = 15000
      expect(result.targetBalanceCents).toBe(15_000);
      // pay down 40000 - 15000 = 25000
      expect(result.payDownToTargetCents).toBe(25_000);
      expect(result.remainingHeadroomCents).toBe(10_000);
    });

    it('reports zero pay-down when already under the target', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 5_000,
        creditLimitCents: 50_000, // 10%
      });
      expect(result.payDownToTargetCents).toBe(0);
    });

    it('honours a custom target utilization', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 25_000,
        creditLimitCents: 50_000, // 50%
        targetUtilizationPercent: 10,
      });
      // 10% of 50000 = 5000
      expect(result.targetBalanceCents).toBe(5_000);
      expect(result.payDownToTargetCents).toBe(20_000);
    });
  });

  describe('guidance selection', () => {
    it('asks for a limit when none is set', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 10_000,
        creditLimitCents: 0,
      });
      expect(result.headline).toBe('Add your credit limit to see utilization');
      expect(result.guidance.toLowerCase()).toContain('credit limit');
    });

    it('praises good utilization and mentions the good threshold', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 5_000,
        creditLimitCents: 50_000, // 10%
      });
      expect(result.guidance).toContain('30%');
      expect(result.headline).toContain('10%');
    });

    it('suggests a pay-down amount for caution utilization', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 20_000,
        creditLimitCents: 50_000, // 40%
      });
      expect(result.level).toBe('caution');
      expect(result.payDownToTargetCents).toBe(5_000);
      expect(result.guidance).toContain('$50.00');
    });

    it('urges getting to target for high utilization', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 35_000,
        creditLimitCents: 50_000, // 70%
      });
      expect(result.level).toBe('high');
      expect(result.guidance.toLowerCase()).toContain('aim for');
    });
  });

  describe('input clamping', () => {
    it('clamps negative balances to zero', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: -10_000,
        creditLimitCents: 50_000,
      });
      expect(result.balanceCents).toBe(0);
      expect(result.utilizationPercent).toBe(0);
    });

    it('clamps negative limits to zero (treated as no limit)', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 10_000,
        creditLimitCents: -50_000,
      });
      expect(result.creditLimitCents).toBe(0);
      expect(result.level).toBe('unknown');
    });

    it('rounds fractional cents to whole cents', () => {
      const result = computeSecuredCardUtilization({
        balanceCents: 10_000.6,
        creditLimitCents: 50_000.4,
      });
      expect(result.balanceCents).toBe(10_001);
      expect(result.creditLimitCents).toBe(50_000);
    });
  });

  it('exposes the default thresholds constant', () => {
    expect(DEFAULT_SECURED_CARD_THRESHOLDS).toEqual({
      goodBelowPercent: 30,
      cautionAtOrBelowPercent: 50,
    });
  });
});

describe('formatUtilizationPercent', () => {
  it('drops a trailing .0 for whole numbers', () => {
    expect(formatUtilizationPercent(30)).toBe('30%');
  });

  it('keeps one decimal for fractional values', () => {
    expect(formatUtilizationPercent(33.3)).toBe('33.3%');
  });
});
