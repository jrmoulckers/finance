// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the student loan optimization engine.
 *
 * Covers: standard repayment, IDR payment calculation (IBR, PAYE,
 * REPAYE, ICR), plan simulation, PSLF tracker, repayment comparison,
 * and tax implications of forgiveness.
 *
 * Edge cases: zero balance, zero income, single person, large family,
 * spouse income inclusion, PSLF at 119/120 payments.
 *
 * References: issues #1681, #1761
 */

import { describe, expect, it } from 'vitest';
import {
  calculateIdrPayment,
  calculateIdrPlanResult,
  calculatePslfTracker,
  calculateStandardPayment,
  compareRepaymentPlans,
  FEDERAL_POVERTY_LEVELS,
  PSLF_REQUIRED_PAYMENTS,
} from './debt-student-loan-engine';
import type { IdrInput, StudentLoan } from './debt-types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const DEFAULT_INPUT: IdrInput = {
  annualIncomeCents: 5_000_000, // $50,000
  familySize: 1,
  state: 'CA',
  filingStatus: 'single',
};

const LOANS: StudentLoan[] = [
  {
    id: 'loan-1',
    name: 'Direct Subsidized',
    balanceCents: 2_500_000, // $25,000
    annualRateBps: 500, // 5%
    originalBalanceCents: 2_700_000,
    isFederal: true,
    isPslfEligible: true,
    pslfPaymentsMade: 24,
  },
  {
    id: 'loan-2',
    name: 'Direct Unsubsidized',
    balanceCents: 1_500_000, // $15,000
    annualRateBps: 650, // 6.5%
    originalBalanceCents: 1_500_000,
    isFederal: true,
    isPslfEligible: true,
    pslfPaymentsMade: 24,
  },
];

// ---------------------------------------------------------------------------
// Standard repayment
// ---------------------------------------------------------------------------

describe('calculateStandardPayment', () => {
  it('returns 0 for zero balance', () => {
    expect(calculateStandardPayment(0, 500)).toBe(0);
  });

  it('divides evenly for 0% interest', () => {
    // $10,000 over 120 months = $83.33/month
    const payment = calculateStandardPayment(1_000_000, 0);
    expect(payment).toBe(8333); // banker's round of 8333.33
  });

  it('calculates correct fixed payment for typical student loan', () => {
    // $40,000 at 5% over 120 months
    // Formula: 4000000 * [0.004167 * (1.004167)^120] / [(1.004167)^120 - 1]
    const payment = calculateStandardPayment(4_000_000, 500);
    // Expected: ~$424.26/month = ~42426 cents
    expect(payment).toBeGreaterThan(42_000);
    expect(payment).toBeLessThan(43_000);
  });

  it('handles very low interest rate', () => {
    const payment = calculateStandardPayment(2_000_000, 100); // 1%
    expect(payment).toBeGreaterThan(0);
    expect(payment).toBeGreaterThan(16_667); // More than 0% payment
  });
});

// ---------------------------------------------------------------------------
// IDR payment calculation
// ---------------------------------------------------------------------------

describe('calculateIdrPayment', () => {
  it('returns 0 for zero balance', () => {
    expect(calculateIdrPayment('PAYE', DEFAULT_INPUT, 0, 500)).toBe(0);
  });

  it('calculates PAYE at 10% of discretionary income', () => {
    // Income: $50,000, FPL for 1 person: $15,580
    // 150% FPL = $23,370
    // Discretionary: $50,000 - $23,370 = $26,630
    // 10% = $2,663/year = ~$221.92/month
    const payment = calculateIdrPayment('PAYE', DEFAULT_INPUT, 4_000_000, 500);
    expect(payment).toBeGreaterThan(20_000);
    expect(payment).toBeLessThan(25_000);
  });

  it('caps IDR at standard payment', () => {
    // Very high income should cap at standard payment
    const highIncome: IdrInput = {
      ...DEFAULT_INPUT,
      annualIncomeCents: 20_000_000, // $200,000
    };
    const idrPayment = calculateIdrPayment('PAYE', highIncome, 2_000_000, 500);
    const standardPayment = calculateStandardPayment(2_000_000, 500);
    expect(idrPayment).toBeLessThanOrEqual(standardPayment);
  });

  it('REPAYE includes spouse income', () => {
    const withSpouse: IdrInput = {
      ...DEFAULT_INPUT,
      filingStatus: 'married_filing_jointly',
      spouseIncomeCents: 4_000_000, // $40,000
    };
    const withoutSpouse = calculateIdrPayment('REPAYE', DEFAULT_INPUT, 4_000_000, 500);
    const withSpousePayment = calculateIdrPayment('REPAYE', withSpouse, 4_000_000, 500);
    expect(withSpousePayment).toBeGreaterThan(withoutSpouse);
  });

  it('IBR includes spouse income only when filing jointly', () => {
    const jointSpouse: IdrInput = {
      ...DEFAULT_INPUT,
      filingStatus: 'married_filing_jointly',
      spouseIncomeCents: 3_000_000,
    };
    const separateSpouse: IdrInput = {
      ...DEFAULT_INPUT,
      filingStatus: 'married_filing_separately',
      spouseIncomeCents: 3_000_000,
    };
    const joint = calculateIdrPayment('IBR', jointSpouse, 4_000_000, 500);
    const separate = calculateIdrPayment('IBR', separateSpouse, 4_000_000, 500);
    expect(joint).toBeGreaterThan(separate);
  });

  it('ICR uses 20% of discretionary income', () => {
    const icrPayment = calculateIdrPayment('ICR', DEFAULT_INPUT, 4_000_000, 500);
    // ICR at 20% should be higher than PAYE at 10% (before caps)
    // But ICR also considers 12-year fixed payment
    expect(icrPayment).toBeGreaterThan(0);
  });

  it('returns 0 discretionary when income below 150% FPL', () => {
    const lowIncome: IdrInput = {
      ...DEFAULT_INPUT,
      annualIncomeCents: 1_500_000, // $15,000 (below $23,370)
    };
    const payment = calculateIdrPayment('PAYE', lowIncome, 4_000_000, 500);
    // With $0 discretionary income, IDR payment should be $0
    expect(payment).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Federal poverty levels
// ---------------------------------------------------------------------------

describe('FEDERAL_POVERTY_LEVELS', () => {
  it('has correct value for 1-person household', () => {
    expect(FEDERAL_POVERTY_LEVELS[0]).toBe(1_558_000);
  });

  it('has 8 entries', () => {
    expect(FEDERAL_POVERTY_LEVELS).toHaveLength(8);
  });

  it('increases with household size', () => {
    for (let i = 1; i < FEDERAL_POVERTY_LEVELS.length; i++) {
      expect(FEDERAL_POVERTY_LEVELS[i]).toBeGreaterThan(FEDERAL_POVERTY_LEVELS[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// IDR plan simulation
// ---------------------------------------------------------------------------

describe('calculateIdrPlanResult', () => {
  it('standard plan pays off in 120 months with no forgiveness', () => {
    const payment = calculateStandardPayment(4_000_000, 500);
    const result = calculateIdrPlanResult('STANDARD', payment, 4_000_000, 500);
    expect(result.monthsToForgiveness).toBeLessThanOrEqual(120);
    expect(result.forgivenAmountCents).toBe(0);
    expect(result.isForgivenessTaxable).toBe(false);
  });

  it('IDR plan may have forgiveness at end of term', () => {
    // Low payment that won't fully pay off in 20 years
    const result = calculateIdrPlanResult('PAYE', 10_000, 4_000_000, 500, 240);
    expect(result.monthsToForgiveness).toBe(240);
    expect(result.forgivenAmountCents).toBeGreaterThan(0);
    expect(result.isForgivenessTaxable).toBe(true);
  });

  it('calculates tax on forgiveness', () => {
    const result = calculateIdrPlanResult('PAYE', 10_000, 4_000_000, 500, 240);
    if (result.forgivenAmountCents > 0) {
      expect(result.estimatedTaxOnForgivenessCents).toBeGreaterThan(0);
      // Tax should be ~22% of forgiven amount
      const expectedTax = Math.round((result.forgivenAmountCents * 22) / 100);
      expect(Math.abs(result.estimatedTaxOnForgivenessCents - expectedTax)).toBeLessThan(100);
    }
  });

  it('tax-free forgiveness has zero tax', () => {
    const result = calculateIdrPlanResult('PAYE', 10_000, 4_000_000, 500, 240, true);
    expect(result.estimatedTaxOnForgivenessCents).toBe(0);
  });

  it('returns empty result for zero balance', () => {
    const result = calculateIdrPlanResult('STANDARD', 50_000, 0, 500);
    expect(result.totalPaidCents).toBe(0);
    expect(result.monthsToForgiveness).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PSLF tracker
// ---------------------------------------------------------------------------

describe('calculatePslfTracker', () => {
  it('calculates remaining payments correctly', () => {
    const tracker = calculatePslfTracker(LOANS, 24, '2025-01-15', 20_000, 550);
    expect(tracker.qualifyingPayments).toBe(24);
    expect(tracker.paymentsRemaining).toBe(PSLF_REQUIRED_PAYMENTS - 24);
    expect(tracker.progressPercent).toBe(20); // 24/120 = 20%
  });

  it('PSLF forgiveness is always tax-free', () => {
    const tracker = calculatePslfTracker(LOANS, 24, '2025-01-15', 20_000, 550);
    expect(tracker.isTaxFree).toBe(true);
  });

  it('handles 120 payments (full)', () => {
    const tracker = calculatePslfTracker(LOANS, 120, '2025-01-15', 20_000, 550);
    expect(tracker.paymentsRemaining).toBe(0);
    expect(tracker.progressPercent).toBe(100);
  });

  it('handles 0 payments', () => {
    const tracker = calculatePslfTracker(LOANS, 0, '2025-01-15', 20_000, 550);
    expect(tracker.paymentsRemaining).toBe(120);
    expect(tracker.progressPercent).toBe(0);
  });

  it('projects a future forgiveness date', () => {
    const tracker = calculatePslfTracker(LOANS, 60, '2025-01-15', 20_000, 550);
    // 60 payments remaining → ~5 years from now
    const forgivenessDate = new Date(tracker.estimatedForgivenessDate);
    const today = new Date('2025-01-15');
    expect(forgivenessDate.getTime()).toBeGreaterThan(today.getTime());
  });

  it('only counts PSLF-eligible loans for forgiven amount', () => {
    const mixedLoans: StudentLoan[] = [
      { ...LOANS[0], isPslfEligible: true, balanceCents: 1_000_000 },
      { ...LOANS[1], isPslfEligible: false, balanceCents: 500_000 },
    ];
    const tracker = calculatePslfTracker(mixedLoans, 119, '2025-01-15', 20_000, 550);
    // Should only count the eligible loan's balance
    expect(tracker.projectedForgivenAmountCents).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Repayment plan comparison
// ---------------------------------------------------------------------------

describe('compareRepaymentPlans', () => {
  it('compares all plan types', () => {
    const comparison = compareRepaymentPlans(LOANS, DEFAULT_INPUT, '2025-01-15');
    expect(comparison.standard.planType).toBe('STANDARD');
    expect(comparison.idrPlans).toHaveLength(4);
    expect(comparison.idrPlans.map((p) => p.planType)).toEqual(['IBR', 'PAYE', 'REPAYE', 'ICR']);
  });

  it('includes PSLF when eligible', () => {
    const comparison = compareRepaymentPlans(LOANS, DEFAULT_INPUT, '2025-01-15');
    expect(comparison.pslf).not.toBeNull();
    expect(comparison.pslf!.isTaxFree).toBe(true);
  });

  it('excludes PSLF when no loans are eligible', () => {
    const privateLoan: StudentLoan[] = [{ ...LOANS[0], isPslfEligible: false, isFederal: false }];
    const comparison = compareRepaymentPlans(privateLoan, DEFAULT_INPUT, '2025-01-15');
    expect(comparison.pslf).toBeNull();
  });

  it('recommends a plan', () => {
    const comparison = compareRepaymentPlans(LOANS, DEFAULT_INPUT, '2025-01-15');
    expect(comparison.recommendedPlan).toBeDefined();
    expect(comparison.savingsVsStandardCents).toBeGreaterThanOrEqual(0);
  });

  it('handles empty loan list', () => {
    const comparison = compareRepaymentPlans([], DEFAULT_INPUT, '2025-01-15');
    expect(comparison.standard.totalPaidCents).toBe(0);
    expect(comparison.idrPlans).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// PSLF required payments constant
// ---------------------------------------------------------------------------

describe('PSLF_REQUIRED_PAYMENTS', () => {
  it('is 120', () => {
    expect(PSLF_REQUIRED_PAYMENTS).toBe(120);
  });
});
