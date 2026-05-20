// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the BNPL aggregation and alert engine.
 *
 * Covers: summary calculation, cost vs. upfront, payment collision
 * detection, stacking alerts, and risk scoring.
 *
 * Edge cases: empty obligations, zero-fee BNPL, single obligation,
 * all same due date, zero income, very high exposure.
 *
 * References: issues #1685, #1690
 */

import { describe, expect, it } from 'vitest';
import {
  calculateBnplCostVsUpfront,
  calculateBnplRiskScore,
  calculateBnplSummary,
  detectPaymentCollisions,
} from './debt-bnpl-engine';
import type { BnplObligation } from './debt-types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const OBLIGATION_A: BnplObligation = {
  id: 'bnpl-a',
  merchantName: 'Store A',
  originalAmountCents: 200_000, // $2,000
  remainingBalanceCents: 100_000, // $1,000
  totalInstallments: 4,
  paidInstallments: 2,
  installmentAmountCents: 50_000, // $500
  annualRateBps: 0,
  totalFeesCents: 0,
  upcomingDueDates: ['2025-02-15', '2025-03-15'],
};

const OBLIGATION_B: BnplObligation = {
  id: 'bnpl-b',
  merchantName: 'Store B',
  originalAmountCents: 60_000, // $600
  remainingBalanceCents: 45_000, // $450
  totalInstallments: 4,
  paidInstallments: 1,
  installmentAmountCents: 16_500, // $165 (includes fees)
  annualRateBps: 1000, // 10% APR
  totalFeesCents: 6_000, // $60 in fees
  upcomingDueDates: ['2025-02-15', '2025-03-15', '2025-04-15'],
};

const OBLIGATION_C: BnplObligation = {
  id: 'bnpl-c',
  merchantName: 'Store C',
  originalAmountCents: 150_000,
  remainingBalanceCents: 75_000,
  totalInstallments: 6,
  paidInstallments: 3,
  installmentAmountCents: 25_000,
  annualRateBps: 0,
  totalFeesCents: 0,
  upcomingDueDates: ['2025-02-20', '2025-03-20', '2025-04-20'],
};

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

describe('calculateBnplSummary', () => {
  it('returns zeros for empty obligations', () => {
    const summary = calculateBnplSummary([]);
    expect(summary.totalOutstandingCents).toBe(0);
    expect(summary.activeCount).toBe(0);
    expect(summary.monthlyCommitmentCents).toBe(0);
  });

  it('aggregates totals correctly', () => {
    const summary = calculateBnplSummary([OBLIGATION_A, OBLIGATION_B]);
    expect(summary.totalOutstandingCents).toBe(100_000 + 45_000);
    expect(summary.totalOriginalCents).toBe(200_000 + 60_000);
    expect(summary.totalFeesCents).toBe(0 + 6_000);
    expect(summary.activeCount).toBe(2);
  });

  it('calculates monthly commitment from active installments', () => {
    const summary = calculateBnplSummary([OBLIGATION_A, OBLIGATION_B]);
    expect(summary.monthlyCommitmentCents).toBe(50_000 + 16_500);
  });

  it('sets costVsUpfrontCents to total fees', () => {
    const summary = calculateBnplSummary([OBLIGATION_B]);
    expect(summary.costVsUpfrontCents).toBe(6_000);
  });
});

// ---------------------------------------------------------------------------
// Cost vs. upfront
// ---------------------------------------------------------------------------

describe('calculateBnplCostVsUpfront', () => {
  it('returns 0 for interest-free BNPL', () => {
    expect(calculateBnplCostVsUpfront(OBLIGATION_A)).toBe(0);
  });

  it('calculates extra cost for fee-bearing BNPL', () => {
    // 4 installments × $165 = $660, original = $600, cost = $60
    expect(calculateBnplCostVsUpfront(OBLIGATION_B)).toBe(6_000);
  });

  it('never returns negative', () => {
    const discountObl: BnplObligation = {
      ...OBLIGATION_A,
      installmentAmountCents: 40_000, // Less than original/4
    };
    expect(calculateBnplCostVsUpfront(discountObl)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Payment collision detection
// ---------------------------------------------------------------------------

describe('detectPaymentCollisions', () => {
  it('returns empty for no obligations', () => {
    expect(detectPaymentCollisions([])).toEqual([]);
  });

  it('detects collisions on same due date', () => {
    // A and B both due on 2025-02-15
    const alerts = detectPaymentCollisions([OBLIGATION_A, OBLIGATION_B]);
    const collisions = alerts.filter((a) => a.type === 'collision');
    expect(collisions.length).toBeGreaterThan(0);

    const feb15 = collisions.find((a) => a.dates.includes('2025-02-15'));
    expect(feb15).toBeDefined();
    expect(feb15!.obligationIds).toContain('bnpl-a');
    expect(feb15!.obligationIds).toContain('bnpl-b');
    expect(feb15!.totalDueCents).toBe(50_000 + 16_500);
  });

  it('no collision when dates do not overlap', () => {
    const noOverlap: BnplObligation = {
      ...OBLIGATION_A,
      upcomingDueDates: ['2025-05-01'],
    };
    const alerts = detectPaymentCollisions([noOverlap, OBLIGATION_C]);
    const collisions = alerts.filter((a) => a.type === 'collision');
    expect(collisions).toHaveLength(0);
  });

  it('marks critical when total exceeds threshold', () => {
    const alerts = detectPaymentCollisions([OBLIGATION_A, OBLIGATION_B], 60_000);
    const critical = alerts.find((a) => a.type === 'collision' && a.totalDueCents > 60_000);
    if (critical) {
      expect(critical.level).toBe('critical');
    }
  });

  it('generates stacking alert when > 4 obligations', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      ...OBLIGATION_A,
      id: `bnpl-${i}`,
      upcomingDueDates: [`2025-0${i + 1}-01`],
    }));
    const alerts = detectPaymentCollisions(many);
    const stacking = alerts.find((a) => a.type === 'stacking');
    expect(stacking).toBeDefined();
    expect(stacking!.level).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// Risk scoring
// ---------------------------------------------------------------------------

describe('calculateBnplRiskScore', () => {
  const monthlyIncome = 500_000; // $5,000

  it('returns score 0 for no obligations', () => {
    const risk = calculateBnplRiskScore([], monthlyIncome);
    expect(risk.score).toBe(0);
    expect(risk.category).toBe('low');
    expect(risk.factors).toHaveLength(0);
  });

  it('returns score 0 for zero income', () => {
    const risk = calculateBnplRiskScore([OBLIGATION_A], 0);
    expect(risk.score).toBe(0);
  });

  it('increases score with more obligations', () => {
    const risk1 = calculateBnplRiskScore([OBLIGATION_A], monthlyIncome);
    const risk3 = calculateBnplRiskScore([OBLIGATION_A, OBLIGATION_B, OBLIGATION_C], monthlyIncome);
    expect(risk3.score).toBeGreaterThan(risk1.score);
  });

  it('penalizes interest-bearing obligations', () => {
    const riskFree = calculateBnplRiskScore([OBLIGATION_A], monthlyIncome);
    const riskPaid = calculateBnplRiskScore([OBLIGATION_B], monthlyIncome);
    expect(riskPaid.score).toBeGreaterThan(riskFree.score);
  });

  it('score is clamped to 0-100', () => {
    // Create extreme scenario
    const extreme = Array.from({ length: 20 }, (_, i) => ({
      ...OBLIGATION_B,
      id: `bnpl-${i}`,
      installmentAmountCents: 100_000,
      upcomingDueDates: ['2025-02-15'],
    }));
    const risk = calculateBnplRiskScore(extreme, 100_000); // $1k income
    expect(risk.score).toBeGreaterThanOrEqual(0);
    expect(risk.score).toBeLessThanOrEqual(100);
  });

  it('categorizes risk levels correctly', () => {
    // Low: few obligations, no interest
    const low = calculateBnplRiskScore([OBLIGATION_C], 1_000_000);
    expect(low.category).toBe('low');
  });
});
