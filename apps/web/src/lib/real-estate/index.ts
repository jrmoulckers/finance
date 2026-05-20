// SPDX-License-Identifier: BUSL-1.1

/**
 * Public API for the real estate and property finance engines.
 *
 * Re-exports home equity, mortgage, rental cash-flow, and manual asset modules.
 *
 * References: issues #1678, #1686, #1691, #1581
 */

export {
  bankersRound,
  calculateHomeEquity,
  calculateHomeEquityFromProperty,
  calculateAppreciationRate,
  calculatePropertyAppreciation,
  projectEquityGrowth,
} from './home-equity';

export {
  calculateMonthlyPayment,
  generateAmortizationSchedule,
  remainingBalance,
  calculatePMIStatus,
  calculateExtraPaymentImpact,
  compareRefinance,
} from './mortgage-engine';

export {
  calculateRentalCashFlow,
  calculateRentalROI,
  calculateRentalTaxDeductions,
} from './rental-cashflow';

export {
  getCurrentValue,
  getValueChange,
  getValueChangePercent,
  getSortedValueHistory,
  calculatePortfolioContribution,
  buildPortfolioSummary,
  filterByCategory,
  calculateTotalValue,
} from './manual-assets';

export type {
  Property,
  MortgageDetails,
  HomeEquity,
  EquitySnapshot,
  AmortizationEntry,
  AmortizationSchedule,
  PMIStatus,
  RefinanceComparison,
  ExtraPaymentImpact,
  RentalProperty,
  RentalExpenses,
  RentalCashFlow,
  RentalROI,
  RentalTaxDeductions,
  ManualAssetCategory,
  AssetValueEntry,
  ManualAsset,
  AssetCategoryBreakdown,
  ManualAssetPortfolio,
} from './types';
