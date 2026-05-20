// SPDX-License-Identifier: BUSL-1.1

/**
 * Rental property cash-flow, ROI, and tax-category analysis engine.
 *
 * Calculates monthly/annual net cash flow, cash-on-cash ROI, cap rate,
 * gross rent multiplier, 1% rule check, and tax deduction breakdowns
 * including depreciation over 27.5 years.
 *
 * All monetary values are integer cents. Percentages are 0–100.
 *
 * References: issue #1686
 */

import { bankersRound } from './home-equity';
import type {
  RentalCashFlow,
  RentalExpenses,
  RentalProperty,
  RentalROI,
  RentalTaxDeductions,
} from './types';

// ---------------------------------------------------------------------------
// Cash flow calculation
// ---------------------------------------------------------------------------

/**
 * Calculate monthly and annual cash flow for a rental property.
 *
 * Adjusts gross income for vacancy rate and sums all operating expenses.
 *
 * @param expenses - Monthly rental income and expense breakdown.
 * @returns Cash flow analysis with monthly and annual figures.
 */
export function calculateRentalCashFlow(expenses: RentalExpenses): RentalCashFlow {
  const monthlyGrossIncomeCents = expenses.monthlyRentCents;

  // Effective income: gross minus vacancy
  const vacancyFactor = Math.max(0, Math.min(100, expenses.vacancyRatePercent));
  const monthlyEffectiveIncomeCents = bankersRound(
    monthlyGrossIncomeCents * (1 - vacancyFactor / 100),
  );

  // Total monthly expenses
  const monthlyExpensesCents =
    expenses.monthlyMortgageCents +
    expenses.monthlyTaxCents +
    expenses.monthlyInsuranceCents +
    expenses.monthlyMaintenanceCents +
    expenses.monthlyManagementCents +
    expenses.monthlyHOACents;

  const monthlyNetCashFlowCents = monthlyEffectiveIncomeCents - monthlyExpensesCents;

  return {
    monthlyGrossIncomeCents,
    monthlyEffectiveIncomeCents,
    monthlyExpensesCents,
    monthlyNetCashFlowCents,
    annualGrossIncomeCents: monthlyGrossIncomeCents * 12,
    annualEffectiveIncomeCents: monthlyEffectiveIncomeCents * 12,
    annualExpensesCents: monthlyExpensesCents * 12,
    annualNetCashFlowCents: monthlyNetCashFlowCents * 12,
  };
}

// ---------------------------------------------------------------------------
// ROI metrics
// ---------------------------------------------------------------------------

/**
 * Calculate ROI metrics for a rental property.
 *
 * Includes cash-on-cash return, cap rate, gross rent multiplier,
 * and 1% rule assessment.
 *
 * @param property - The rental property details.
 * @param expenses - Monthly income and expense breakdown.
 * @returns ROI metrics.
 */
export function calculateRentalROI(property: RentalProperty, expenses: RentalExpenses): RentalROI {
  const cashFlow = calculateRentalCashFlow(expenses);
  const totalCashInvestedCents = property.downPaymentCents + property.closingCostsCents;

  // Cash-on-cash return = annual net cash flow / total cash invested
  const cashOnCashPercent =
    totalCashInvestedCents > 0
      ? Math.round((cashFlow.annualNetCashFlowCents / totalCashInvestedCents) * 10000) / 100
      : 0;

  // Net operating income = effective income - operating expenses (excluding mortgage)
  const annualOperatingExpensesCents =
    (expenses.monthlyTaxCents +
      expenses.monthlyInsuranceCents +
      expenses.monthlyMaintenanceCents +
      expenses.monthlyManagementCents +
      expenses.monthlyHOACents) *
    12;

  const annualNOI = cashFlow.annualEffectiveIncomeCents - annualOperatingExpensesCents;

  // Cap rate = NOI / current property value
  const capRatePercent =
    property.currentValueCents > 0
      ? Math.round((annualNOI / property.currentValueCents) * 10000) / 100
      : 0;

  // Gross rent multiplier = purchase price / annual gross rent
  const grossRentMultiplier =
    cashFlow.annualGrossIncomeCents > 0
      ? Math.round((property.purchasePriceCents / cashFlow.annualGrossIncomeCents) * 100) / 100
      : 0;

  // 1% rule: monthly rent should be >= 1% of purchase price
  const onePercentRuleRatio =
    property.purchasePriceCents > 0
      ? Math.round((expenses.monthlyRentCents / property.purchasePriceCents) * 10000) / 100
      : 0;

  const passesOnePercentRule = onePercentRuleRatio >= 1;

  return {
    cashOnCashPercent,
    capRatePercent,
    grossRentMultiplier,
    passesOnePercentRule,
    onePercentRuleRatio,
    totalCashInvestedCents,
  };
}

// ---------------------------------------------------------------------------
// Tax deductions
// ---------------------------------------------------------------------------

/** Number of years for residential rental property depreciation (IRS). */
const DEPRECIATION_YEARS = 27.5;

/**
 * Calculate tax deduction categories for a rental property.
 *
 * Computes straight-line depreciation over 27.5 years, and annualizes
 * all deductible expense categories.
 *
 * @param property - The rental property details.
 * @param expenses - Monthly income and expense breakdown.
 * @param landValuePercent - Percentage of purchase price attributable to land (default: 20%).
 *   Land is not depreciable.
 * @param annualMortgageInterestCents - Annual mortgage interest paid in cents.
 *   If not provided, estimates from monthly mortgage payment (simplified).
 * @returns Tax deduction breakdown by category.
 */
export function calculateRentalTaxDeductions(
  property: RentalProperty,
  expenses: RentalExpenses,
  landValuePercent: number = 20,
  annualMortgageInterestCents?: number,
): RentalTaxDeductions {
  // Depreciable basis = purchase price - land value
  const clampedLandPercent = Math.max(0, Math.min(100, landValuePercent));
  const depreciableBasisCents = bankersRound(
    property.purchasePriceCents * (1 - clampedLandPercent / 100),
  );

  // Annual depreciation: straight-line over 27.5 years
  const annualDepreciationCents = bankersRound(depreciableBasisCents / DEPRECIATION_YEARS);

  // Use provided interest or estimate (simplified: assume ~70% of early payments are interest)
  const mortgageInterest =
    annualMortgageInterestCents ?? bankersRound(expenses.monthlyMortgageCents * 12 * 0.7);

  const annualPropertyTaxCents = expenses.monthlyTaxCents * 12;
  const annualInsuranceCents = expenses.monthlyInsuranceCents * 12;
  const annualMaintenanceCents = expenses.monthlyMaintenanceCents * 12;
  const annualManagementCents = expenses.monthlyManagementCents * 12;
  const annualHOACents = expenses.monthlyHOACents * 12;

  const totalAnnualDeductionsCents =
    annualDepreciationCents +
    mortgageInterest +
    annualPropertyTaxCents +
    annualInsuranceCents +
    annualMaintenanceCents +
    annualManagementCents +
    annualHOACents;

  return {
    annualDepreciationCents,
    depreciableBasisCents,
    annualMortgageInterestCents: mortgageInterest,
    annualPropertyTaxCents,
    annualInsuranceCents,
    annualMaintenanceCents,
    annualManagementCents,
    annualHOACents,
    totalAnnualDeductionsCents,
  };
}
