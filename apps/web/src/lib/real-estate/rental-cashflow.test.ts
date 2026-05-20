// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the rental property cash-flow engine.
 *
 * Covers cash flow calculation, ROI metrics, and tax deduction analysis.
 *
 * References: issue #1686
 */

import { describe, expect, it } from 'vitest';
import type { RentalExpenses, RentalProperty } from './types';
import {
  calculateRentalCashFlow,
  calculateRentalROI,
  calculateRentalTaxDeductions,
} from './rental-cashflow';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const sampleProperty: RentalProperty = {
  id: 'rp1',
  name: '456 Oak Ave',
  purchasePriceCents: 25000000, // $250k
  downPaymentCents: 5000000, // $50k
  closingCostsCents: 750000, // $7,500
  currentValueCents: 28000000, // $280k
};

const sampleExpenses: RentalExpenses = {
  monthlyRentCents: 200000, // $2,000/mo
  monthlyMortgageCents: 120000, // $1,200/mo
  monthlyTaxCents: 25000, // $250/mo
  monthlyInsuranceCents: 10000, // $100/mo
  monthlyMaintenanceCents: 15000, // $150/mo
  monthlyManagementCents: 20000, // $200/mo (10% of rent)
  monthlyHOACents: 0,
  vacancyRatePercent: 8,
};

// ---------------------------------------------------------------------------
// calculateRentalCashFlow
// ---------------------------------------------------------------------------

describe('calculateRentalCashFlow', () => {
  it('calculates effective income after vacancy', () => {
    const cf = calculateRentalCashFlow(sampleExpenses);
    // $2000 * (1 - 8%) = $1840
    expect(cf.monthlyEffectiveIncomeCents).toBe(184000);
  });

  it('calculates total monthly expenses', () => {
    const cf = calculateRentalCashFlow(sampleExpenses);
    // 1200 + 250 + 100 + 150 + 200 + 0 = $1,900
    expect(cf.monthlyExpensesCents).toBe(190000);
  });

  it('calculates net monthly cash flow', () => {
    const cf = calculateRentalCashFlow(sampleExpenses);
    // 1840 - 1900 = -$60/mo
    expect(cf.monthlyNetCashFlowCents).toBe(-6000);
  });

  it('annualizes correctly', () => {
    const cf = calculateRentalCashFlow(sampleExpenses);
    expect(cf.annualGrossIncomeCents).toBe(cf.monthlyGrossIncomeCents * 12);
    expect(cf.annualExpensesCents).toBe(cf.monthlyExpensesCents * 12);
    expect(cf.annualNetCashFlowCents).toBe(cf.monthlyNetCashFlowCents * 12);
  });

  it('handles zero vacancy', () => {
    const noVacancy: RentalExpenses = { ...sampleExpenses, vacancyRatePercent: 0 };
    const cf = calculateRentalCashFlow(noVacancy);
    expect(cf.monthlyEffectiveIncomeCents).toBe(cf.monthlyGrossIncomeCents);
  });

  it('handles 100% vacancy', () => {
    const fullVacancy: RentalExpenses = { ...sampleExpenses, vacancyRatePercent: 100 };
    const cf = calculateRentalCashFlow(fullVacancy);
    expect(cf.monthlyEffectiveIncomeCents).toBe(0);
    expect(cf.monthlyNetCashFlowCents).toBe(-cf.monthlyExpensesCents);
  });

  it('clamps vacancy above 100 to 100', () => {
    const overVacancy: RentalExpenses = { ...sampleExpenses, vacancyRatePercent: 150 };
    const cf = calculateRentalCashFlow(overVacancy);
    expect(cf.monthlyEffectiveIncomeCents).toBe(0);
  });

  it('clamps negative vacancy to 0', () => {
    const negVacancy: RentalExpenses = { ...sampleExpenses, vacancyRatePercent: -10 };
    const cf = calculateRentalCashFlow(negVacancy);
    expect(cf.monthlyEffectiveIncomeCents).toBe(cf.monthlyGrossIncomeCents);
  });

  it('handles zero rent', () => {
    const noRent: RentalExpenses = { ...sampleExpenses, monthlyRentCents: 0 };
    const cf = calculateRentalCashFlow(noRent);
    expect(cf.monthlyGrossIncomeCents).toBe(0);
    expect(cf.monthlyNetCashFlowCents).toBe(-cf.monthlyExpensesCents);
  });
});

// ---------------------------------------------------------------------------
// calculateRentalROI
// ---------------------------------------------------------------------------

describe('calculateRentalROI', () => {
  it('calculates cash-on-cash return', () => {
    const roi = calculateRentalROI(sampleProperty, sampleExpenses);
    // Total cash invested: $50k + $7.5k = $57.5k
    expect(roi.totalCashInvestedCents).toBe(5750000);
    // Annual net cash flow is negative in this example, so CoC is negative
    expect(roi.cashOnCashPercent).toBeLessThan(0);
  });

  it('calculates cap rate', () => {
    const roi = calculateRentalROI(sampleProperty, sampleExpenses);
    // NOI = effective income - operating expenses (no mortgage)
    // Operating expenses = (250+100+150+200+0)*12 = $8,400/yr = 840000 cents
    // Effective income = $1840*12 = $22,080 = 2208000 cents
    // NOI = 2208000 - 840000 = 1368000
    // Cap rate = 1368000 / 28000000 * 100 ≈ 4.89%
    expect(roi.capRatePercent).toBeGreaterThan(4);
    expect(roi.capRatePercent).toBeLessThan(5);
  });

  it('calculates gross rent multiplier', () => {
    const roi = calculateRentalROI(sampleProperty, sampleExpenses);
    // GRM = $250k / ($2000 * 12) = 250k / 24k ≈ 10.42
    expect(roi.grossRentMultiplier).toBeGreaterThan(10);
    expect(roi.grossRentMultiplier).toBeLessThan(11);
  });

  it('checks 1% rule correctly - failing', () => {
    // $2000 rent / $250k price = 0.8% → fails 1% rule
    const roi = calculateRentalROI(sampleProperty, sampleExpenses);
    expect(roi.passesOnePercentRule).toBe(false);
    expect(roi.onePercentRuleRatio).toBeLessThan(1);
  });

  it('checks 1% rule correctly - passing', () => {
    const cheapProperty: RentalProperty = {
      ...sampleProperty,
      purchasePriceCents: 15000000, // $150k with $2000 rent
    };
    const roi = calculateRentalROI(cheapProperty, sampleExpenses);
    expect(roi.passesOnePercentRule).toBe(true);
    expect(roi.onePercentRuleRatio).toBeGreaterThanOrEqual(1);
  });

  it('handles zero cash invested (divide-by-zero guard)', () => {
    const noDownProperty: RentalProperty = {
      ...sampleProperty,
      downPaymentCents: 0,
      closingCostsCents: 0,
    };
    const roi = calculateRentalROI(noDownProperty, sampleExpenses);
    expect(roi.cashOnCashPercent).toBe(0);
  });

  it('handles zero property value (divide-by-zero guard)', () => {
    const zeroValueProperty: RentalProperty = { ...sampleProperty, currentValueCents: 0 };
    const roi = calculateRentalROI(zeroValueProperty, sampleExpenses);
    expect(roi.capRatePercent).toBe(0);
  });

  it('handles zero purchase price', () => {
    const freeProperty: RentalProperty = { ...sampleProperty, purchasePriceCents: 0 };
    const roi = calculateRentalROI(freeProperty, sampleExpenses);
    expect(roi.grossRentMultiplier).toBe(0);
    expect(roi.onePercentRuleRatio).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateRentalTaxDeductions
// ---------------------------------------------------------------------------

describe('calculateRentalTaxDeductions', () => {
  it('calculates depreciation over 27.5 years', () => {
    const deductions = calculateRentalTaxDeductions(sampleProperty, sampleExpenses);
    // Depreciable basis = $250k * 80% = $200k = 20000000 cents
    expect(deductions.depreciableBasisCents).toBe(20000000);
    // Annual depreciation = 20000000 / 27.5 ≈ 727,273 cents
    expect(deductions.annualDepreciationCents).toBeGreaterThan(727000);
    expect(deductions.annualDepreciationCents).toBeLessThan(728000);
  });

  it('uses custom land value percentage', () => {
    const deductions = calculateRentalTaxDeductions(sampleProperty, sampleExpenses, 30);
    // Depreciable basis = $250k * 70% = $175k = 17500000 cents
    expect(deductions.depreciableBasisCents).toBe(17500000);
  });

  it('annualizes all expense categories', () => {
    const deductions = calculateRentalTaxDeductions(sampleProperty, sampleExpenses);
    expect(deductions.annualPropertyTaxCents).toBe(sampleExpenses.monthlyTaxCents * 12);
    expect(deductions.annualInsuranceCents).toBe(sampleExpenses.monthlyInsuranceCents * 12);
    expect(deductions.annualMaintenanceCents).toBe(sampleExpenses.monthlyMaintenanceCents * 12);
    expect(deductions.annualManagementCents).toBe(sampleExpenses.monthlyManagementCents * 12);
    expect(deductions.annualHOACents).toBe(sampleExpenses.monthlyHOACents * 12);
  });

  it('sums total deductions correctly', () => {
    const deductions = calculateRentalTaxDeductions(
      sampleProperty,
      sampleExpenses,
      20,
      800000, // $8k mortgage interest
    );

    const expectedTotal =
      deductions.annualDepreciationCents +
      deductions.annualMortgageInterestCents +
      deductions.annualPropertyTaxCents +
      deductions.annualInsuranceCents +
      deductions.annualMaintenanceCents +
      deductions.annualManagementCents +
      deductions.annualHOACents;

    expect(deductions.totalAnnualDeductionsCents).toBe(expectedTotal);
  });

  it('uses provided annual mortgage interest', () => {
    const deductions = calculateRentalTaxDeductions(
      sampleProperty,
      sampleExpenses,
      20,
      900000, // $9,000 interest
    );
    expect(deductions.annualMortgageInterestCents).toBe(900000);
  });

  it('estimates mortgage interest when not provided', () => {
    const deductions = calculateRentalTaxDeductions(sampleProperty, sampleExpenses);
    // Estimated: monthlyMortgage * 12 * 0.7 = 120000 * 12 * 0.7 = 1008000
    expect(deductions.annualMortgageInterestCents).toBe(1008000);
  });

  it('clamps land value percent to 0-100', () => {
    const deductions0 = calculateRentalTaxDeductions(sampleProperty, sampleExpenses, -10);
    expect(deductions0.depreciableBasisCents).toBe(sampleProperty.purchasePriceCents);

    const deductions100 = calculateRentalTaxDeductions(sampleProperty, sampleExpenses, 110);
    expect(deductions100.depreciableBasisCents).toBe(0);
  });
});
