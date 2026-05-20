// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the mortgage amortization engine.
 *
 * Covers monthly payment calculation, full amortization schedule,
 * remaining balance, PMI status, extra payment impact, and
 * refinance comparison.
 *
 * References: issue #1691
 */

import { describe, expect, it } from 'vitest';
import {
  calculateExtraPaymentImpact,
  calculateMonthlyPayment,
  calculatePMIStatus,
  compareRefinance,
  generateAmortizationSchedule,
  remainingBalance,
} from './mortgage-engine';

// ---------------------------------------------------------------------------
// calculateMonthlyPayment
// ---------------------------------------------------------------------------

describe('calculateMonthlyPayment', () => {
  it('calculates standard 30-year fixed payment', () => {
    // $200k loan at 6.5% for 30 years → ~$1264/mo
    const payment = calculateMonthlyPayment(20000000, 650, 360);
    expect(payment).toBeGreaterThan(126000);
    expect(payment).toBeLessThan(127000);
  });

  it('calculates 15-year fixed payment', () => {
    // $200k loan at 5% for 15 years → ~$1582/mo
    const payment = calculateMonthlyPayment(20000000, 500, 180);
    expect(payment).toBeGreaterThan(158000);
    expect(payment).toBeLessThan(159000);
  });

  it('returns 0 for zero loan amount', () => {
    expect(calculateMonthlyPayment(0, 650, 360)).toBe(0);
  });

  it('returns 0 for zero term', () => {
    expect(calculateMonthlyPayment(20000000, 650, 0)).toBe(0);
  });

  it('handles zero-interest loan', () => {
    // $120k loan, 0% for 360 months → $333.33/mo ≈ 33333 cents
    const payment = calculateMonthlyPayment(12000000, 0, 360);
    expect(payment).toBe(33333);
  });

  it('handles negative loan amount', () => {
    expect(calculateMonthlyPayment(-10000, 650, 360)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateAmortizationSchedule
// ---------------------------------------------------------------------------

describe('generateAmortizationSchedule', () => {
  it('generates correct number of entries', () => {
    const schedule = generateAmortizationSchedule(20000000, 650, 360);
    expect(schedule.entries.length).toBe(360);
  });

  it('has zero remaining balance at the end', () => {
    const schedule = generateAmortizationSchedule(20000000, 650, 360);
    const lastEntry = schedule.entries[schedule.entries.length - 1];
    expect(lastEntry.remainingBalanceCents).toBe(0);
  });

  it('cumulative principal equals loan amount', () => {
    const schedule = generateAmortizationSchedule(20000000, 650, 360);
    const lastEntry = schedule.entries[schedule.entries.length - 1];
    // Allow small rounding tolerance
    expect(Math.abs(lastEntry.cumulativePrincipalCents - 20000000)).toBeLessThanOrEqual(1);
  });

  it('first payment has more interest than principal', () => {
    const schedule = generateAmortizationSchedule(20000000, 650, 360);
    const firstEntry = schedule.entries[0];
    expect(firstEntry.interestCents).toBeGreaterThan(firstEntry.principalCents);
  });

  it('last payment has more principal than interest', () => {
    const schedule = generateAmortizationSchedule(20000000, 650, 360);
    const lastEntry = schedule.entries[schedule.entries.length - 1];
    expect(lastEntry.principalCents).toBeGreaterThan(lastEntry.interestCents);
  });

  it('total interest is reasonable for 30-year mortgage', () => {
    const schedule = generateAmortizationSchedule(20000000, 650, 360);
    // Total interest on $200k at 6.5% over 30 years ≈ $255k
    expect(schedule.totalInterestCents).toBeGreaterThan(25000000);
    expect(schedule.totalInterestCents).toBeLessThan(26000000);
  });

  it('returns empty schedule for zero loan amount', () => {
    const schedule = generateAmortizationSchedule(0, 650, 360);
    expect(schedule.entries).toHaveLength(0);
    expect(schedule.totalInterestCents).toBe(0);
  });

  it('payment numbers are sequential and 1-based', () => {
    const schedule = generateAmortizationSchedule(10000000, 500, 60);
    schedule.entries.forEach((entry, idx) => {
      expect(entry.paymentNumber).toBe(idx + 1);
    });
  });

  it('handles fully paid mortgage (zero-interest short term)', () => {
    const schedule = generateAmortizationSchedule(1200000, 0, 12);
    expect(schedule.entries).toHaveLength(12);
    expect(schedule.totalInterestCents).toBe(0);
    const lastEntry = schedule.entries[schedule.entries.length - 1];
    expect(lastEntry.remainingBalanceCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// remainingBalance
// ---------------------------------------------------------------------------

describe('remainingBalance', () => {
  it('returns full loan amount before any payments', () => {
    // With 0 payments, the formula should return the loan amount
    const balance = remainingBalance(20000000, 650, 360, 0);
    expect(balance).toBe(20000000);
  });

  it('returns 0 after all payments', () => {
    const balance = remainingBalance(20000000, 650, 360, 360);
    expect(balance).toBe(0);
  });

  it('returns correct balance mid-term', () => {
    // After 180 payments on 30-year $200k at 6.5%
    const balance = remainingBalance(20000000, 650, 360, 180);
    // Should be roughly $145k-$155k remaining
    expect(balance).toBeGreaterThan(14500000);
    expect(balance).toBeLessThan(15500000);
  });

  it('matches amortization schedule', () => {
    const schedule = generateAmortizationSchedule(20000000, 650, 360);
    const formulaBalance = remainingBalance(20000000, 650, 360, 60);
    const scheduleBalance = schedule.entries[59].remainingBalanceCents;
    // Allow rounding difference from iterative vs closed-form calculation
    expect(Math.abs(formulaBalance - scheduleBalance)).toBeLessThanOrEqual(50);
  });

  it('returns 0 for zero loan', () => {
    expect(remainingBalance(0, 650, 360, 10)).toBe(0);
  });

  it('handles zero-interest loan', () => {
    const balance = remainingBalance(12000000, 0, 12, 6);
    // After 6 of 12 payments at 0% → half the loan
    expect(balance).toBeGreaterThanOrEqual(5999000);
    expect(balance).toBeLessThanOrEqual(6001000);
  });
});

// ---------------------------------------------------------------------------
// calculatePMIStatus
// ---------------------------------------------------------------------------

describe('calculatePMIStatus', () => {
  it('reports PMI required when LTV > 80%', () => {
    const status = calculatePMIStatus(
      30000000, // $300k value
      28500000, // $285k loan (95% LTV)
      28000000, // $280k current balance
      650,
      360,
      12,
    );

    expect(status.isRequired).toBe(true);
    expect(status.currentLTV).toBeGreaterThan(80);
    expect(status.paymentsUntilRemoval).toBeGreaterThan(0);
  });

  it('reports PMI not required when LTV <= 80%', () => {
    const status = calculatePMIStatus(
      30000000, // $300k value
      24000000, // $240k loan (80% LTV)
      23000000, // $230k balance
      650,
      360,
      24,
    );

    expect(status.isRequired).toBe(false);
    expect(status.currentLTV).toBeLessThanOrEqual(80);
    expect(status.estimatedRemovalMonth).toBeNull();
    expect(status.paymentsUntilRemoval).toBeNull();
  });

  it('handles zero property value', () => {
    const status = calculatePMIStatus(0, 20000000, 18000000, 650, 360, 12);
    expect(status.isRequired).toBe(false);
    expect(status.currentLTV).toBe(0);
  });

  it('handles zero-down PMI scenario', () => {
    const status = calculatePMIStatus(
      25000000, // $250k value
      25000000, // 100% LTV
      24800000, // near-original balance
      650,
      360,
      6,
    );

    expect(status.isRequired).toBe(true);
    expect(status.currentLTV).toBeGreaterThan(99);
    expect(status.paymentsUntilRemoval).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// calculateExtraPaymentImpact
// ---------------------------------------------------------------------------

describe('calculateExtraPaymentImpact', () => {
  it('shows months saved with extra payments', () => {
    const impact = calculateExtraPaymentImpact(
      20000000, // $200k loan
      650, // 6.5%
      360, // 30 years
      50000, // $500/mo extra
    );

    expect(impact.monthsSaved).toBeGreaterThan(0);
    expect(impact.interestSavedCents).toBeGreaterThan(0);
    expect(impact.newPayoffMonths).toBeLessThan(impact.originalPayoffMonths);
  });

  it('returns no savings for zero extra payment', () => {
    const impact = calculateExtraPaymentImpact(20000000, 650, 360, 0);

    expect(impact.monthsSaved).toBe(0);
    expect(impact.interestSavedCents).toBe(0);
  });

  it('handles payments already made', () => {
    const impact = calculateExtraPaymentImpact(
      20000000,
      650,
      360,
      50000,
      60, // 5 years of payments already made
    );

    expect(impact.monthsSaved).toBeGreaterThan(0);
    expect(impact.newPayoffMonths).toBeLessThan(impact.originalPayoffMonths);
  });

  it('handles large extra payments that pay off quickly', () => {
    const impact = calculateExtraPaymentImpact(
      10000000, // $100k loan
      500,
      360,
      1000000, // $10k/mo extra
    );

    expect(impact.newPayoffMonths).toBeLessThan(20);
    expect(impact.monthsSaved).toBeGreaterThan(300);
  });
});

// ---------------------------------------------------------------------------
// compareRefinance
// ---------------------------------------------------------------------------

describe('compareRefinance', () => {
  it('shows interest savings when refinancing to lower rate', () => {
    const comparison = compareRefinance(
      20000000, // $200k remaining
      650, // current 6.5%
      300, // 25 years remaining
      450, // new 4.5%
      360, // new 30-year term
      500000, // $5k closing costs
    );

    expect(comparison.interestSavingsCents).toBeGreaterThan(0);
    expect(comparison.newMonthlyPaymentCents).toBeLessThan(comparison.currentMonthlyPaymentCents);
    expect(comparison.breakEvenMonths).toBeGreaterThan(0);
  });

  it('shows no break-even when refinancing to higher rate', () => {
    const comparison = compareRefinance(
      20000000,
      450, // current 4.5%
      300,
      650, // new 6.5%
      360,
      500000,
    );

    // Higher rate means higher monthly payment, so no break-even
    expect(comparison.breakEvenMonths).toBeNull();
    expect(comparison.monthlySavingsCents).toBeLessThan(0);
  });

  it('handles zero closing costs', () => {
    const comparison = compareRefinance(20000000, 650, 300, 450, 360, 0);

    expect(comparison.breakEvenMonths).toBe(0);
  });
});
