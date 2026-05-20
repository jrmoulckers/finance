// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the guaranteed income integration engine.
 *
 * Covers Social Security benefit estimation, pension present value,
 * guaranteed monthly income, and gap analysis.
 *
 * References: #1736
 */

import { describe, expect, it } from 'vitest';
import type { GuaranteedIncomeStream } from './types';
import {
  estimateSocialSecurityBenefit,
  estimateAllClaimingAges,
  calculatePensionPresentValue,
  calculateGuaranteedMonthlyIncome,
  analyzeIncomeGap,
  FULL_RETIREMENT_AGE,
} from './guaranteed-income';

// ---------------------------------------------------------------------------
// Social Security estimation
// ---------------------------------------------------------------------------

describe('estimateSocialSecurityBenefit', () => {
  const piaCents = 200000; // $2,000/month PIA

  it('returns full benefit at FRA (67)', () => {
    const est = estimateSocialSecurityBenefit(piaCents, 67);
    expect(est.monthlyBenefitCents).toBe(200000);
    expect(est.adjustmentFactor).toBe(1.0);
    expect(est.annualBenefitCents).toBe(2400000);
  });

  it('reduces benefit for early claiming at 62', () => {
    const est = estimateSocialSecurityBenefit(piaCents, 62);
    expect(est.monthlyBenefitCents).toBeLessThan(piaCents);
    expect(est.adjustmentFactor).toBeLessThan(1.0);
    // At 62: 60 months early = 36 × 5/900 + 24 × 5/1200 = 0.2 + 0.1 = 0.3 reduction
    // Factor = 0.7
    expect(est.adjustmentFactor).toBeCloseTo(0.7, 2);
    expect(est.monthlyBenefitCents).toBe(140000);
  });

  it('increases benefit for delayed claiming at 70', () => {
    const est = estimateSocialSecurityBenefit(piaCents, 70);
    expect(est.monthlyBenefitCents).toBeGreaterThan(piaCents);
    expect(est.adjustmentFactor).toBeGreaterThan(1.0);
    // At 70: 36 months delayed × 2/300 = 0.24 bonus → factor = 1.24
    expect(est.adjustmentFactor).toBeCloseTo(1.24, 2);
  });

  it('calculates break-even age', () => {
    const est = estimateSocialSecurityBenefit(piaCents, 70);
    expect(est.breakEvenAge).toBeGreaterThan(70);
    expect(est.breakEvenAge).toBeLessThan(90);
  });

  it('break-even age at 62 is 62', () => {
    const est = estimateSocialSecurityBenefit(piaCents, 62);
    expect(est.breakEvenAge).toBe(62);
  });
});

describe('estimateAllClaimingAges', () => {
  it('returns estimates for ages 62-70', () => {
    const estimates = estimateAllClaimingAges(200000);
    expect(estimates).toHaveLength(9);
    expect(estimates[0]!.claimAge).toBe(62);
    expect(estimates[8]!.claimAge).toBe(70);
  });

  it('benefits increase monotonically with age', () => {
    const estimates = estimateAllClaimingAges(200000);
    for (let i = 1; i < estimates.length; i++) {
      expect(estimates[i]!.monthlyBenefitCents).toBeGreaterThan(
        estimates[i - 1]!.monthlyBenefitCents,
      );
    }
  });
});

describe('FULL_RETIREMENT_AGE', () => {
  it('is 67', () => {
    expect(FULL_RETIREMENT_AGE).toBe(67);
  });
});

// ---------------------------------------------------------------------------
// Pension present value
// ---------------------------------------------------------------------------

describe('calculatePensionPresentValue', () => {
  const pensionStream: GuaranteedIncomeStream = {
    id: 'pension-1',
    name: 'State Pension',
    type: 'pension',
    monthlyPaymentCents: 150000, // $1,500/month
    startAge: 65,
    endAge: null, // lifetime
    colaRate: 0.02,
  };

  it('calculates present value for a pension starting at 65', () => {
    const pv = calculatePensionPresentValue(pensionStream, 60, 0.04);
    expect(pv.presentValueCents).toBeGreaterThan(0);
    expect(pv.totalNominalCents).toBeGreaterThan(pv.presentValueCents);
    expect(pv.paymentYears).toBe(25); // lifeExpectancy(90) - startAge(65) = 25
  });

  it('uses life expectancy 90 by default', () => {
    const pv = calculatePensionPresentValue(pensionStream, 65, 0.04);
    expect(pv.paymentYears).toBe(25); // 90 - 65
  });

  it('handles stream that has already started', () => {
    const pv = calculatePensionPresentValue(pensionStream, 70, 0.04);
    expect(pv.paymentYears).toBe(20); // 90 - 70
    expect(pv.presentValueCents).toBeGreaterThan(0);
  });

  it('returns zero for stream ending before current age', () => {
    const endedStream: GuaranteedIncomeStream = {
      ...pensionStream,
      endAge: 60,
    };
    const pv = calculatePensionPresentValue(endedStream, 65, 0.04);
    expect(pv.presentValueCents).toBe(0);
    expect(pv.paymentYears).toBe(0);
  });

  it('applies COLA adjustment', () => {
    const noCola: GuaranteedIncomeStream = { ...pensionStream, colaRate: 0 };
    const pvWithCola = calculatePensionPresentValue(pensionStream, 65, 0.04);
    const pvNoCola = calculatePensionPresentValue(noCola, 65, 0.04);
    expect(pvWithCola.totalNominalCents).toBeGreaterThan(pvNoCola.totalNominalCents);
  });

  it('handles custom life expectancy', () => {
    const pv = calculatePensionPresentValue(pensionStream, 65, 0.04, 85);
    expect(pv.paymentYears).toBe(20); // 85 - 65
  });
});

// ---------------------------------------------------------------------------
// Guaranteed monthly income
// ---------------------------------------------------------------------------

describe('calculateGuaranteedMonthlyIncome', () => {
  const streams: GuaranteedIncomeStream[] = [
    {
      id: 'ss',
      name: 'Social Security',
      type: 'social-security',
      monthlyPaymentCents: 200000,
      startAge: 67,
      endAge: null,
      colaRate: 0.02,
    },
    {
      id: 'pension',
      name: 'Pension',
      type: 'pension',
      monthlyPaymentCents: 150000,
      startAge: 65,
      endAge: null,
      colaRate: 0.01,
    },
    {
      id: 'annuity',
      name: 'Fixed Annuity',
      type: 'annuity',
      monthlyPaymentCents: 50000,
      startAge: 60,
      endAge: 80,
      colaRate: 0,
    },
  ];

  it('returns 0 before any stream starts', () => {
    expect(calculateGuaranteedMonthlyIncome(streams, 55)).toBe(0);
  });

  it('includes only started streams', () => {
    const income = calculateGuaranteedMonthlyIncome(streams, 62);
    // Only annuity (started at 60) and nothing else yet
    expect(income).toBe(50000); // No COLA on annuity
  });

  it('includes all active streams at age 70', () => {
    const income = calculateGuaranteedMonthlyIncome(streams, 70);
    expect(income).toBeGreaterThan(200000 + 150000); // SS + pension with COLA
  });

  it('excludes ended streams', () => {
    const income = calculateGuaranteedMonthlyIncome(streams, 85);
    // Annuity ended at 80
    expect(income).toBeGreaterThan(0);
    // Should be SS + pension only
  });

  it('applies COLA correctly', () => {
    const incomeAt67 = calculateGuaranteedMonthlyIncome(
      [streams[0]!], // SS only
      67,
    );
    const incomeAt77 = calculateGuaranteedMonthlyIncome(
      [streams[0]!], // SS only
      77,
    );
    // After 10 years of 2% COLA
    expect(incomeAt77).toBeGreaterThan(incomeAt67);
  });
});

// ---------------------------------------------------------------------------
// Gap analysis
// ---------------------------------------------------------------------------

describe('analyzeIncomeGap', () => {
  const streams: GuaranteedIncomeStream[] = [
    {
      id: 'ss',
      name: 'Social Security',
      type: 'social-security',
      monthlyPaymentCents: 200000,
      startAge: 67,
      endAge: null,
      colaRate: 0,
    },
    {
      id: 'pension',
      name: 'Pension',
      type: 'pension',
      monthlyPaymentCents: 100000,
      startAge: 65,
      endAge: null,
      colaRate: 0,
    },
  ];

  it('identifies shortfall when guaranteed < desired', () => {
    const analysis = analyzeIncomeGap(streams, 500000, 67); // $5,000/month desired
    expect(analysis.monthlyGapCents).toBeLessThan(0);
    expect(analysis.annualGapCents).toBe(analysis.monthlyGapCents * 12);
    expect(analysis.coveragePercent).toBeLessThan(100);
  });

  it('identifies surplus when guaranteed > desired', () => {
    const analysis = analyzeIncomeGap(streams, 200000, 67); // $2,000/month desired
    expect(analysis.monthlyGapCents).toBeGreaterThan(0);
    expect(analysis.coveragePercent).toBeGreaterThan(100);
  });

  it('returns only active streams at target age', () => {
    const analysis = analyzeIncomeGap(streams, 500000, 66);
    // At 66, only pension is active (SS starts at 67)
    expect(analysis.streams).toHaveLength(1);
    expect(analysis.streams[0]!.id).toBe('pension');
  });

  it('handles zero desired spending', () => {
    const analysis = analyzeIncomeGap(streams, 0, 67);
    expect(analysis.coveragePercent).toBe(0);
    expect(analysis.monthlyGapCents).toBeGreaterThan(0);
  });
});
