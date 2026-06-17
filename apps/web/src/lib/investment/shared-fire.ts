// SPDX-License-Identifier: BUSL-1.1

export interface SharedFireInput {
  readonly currentPortfolioCents: number;
  readonly annualExpensesCents: number;
  readonly annualSavingsCents: number;
  readonly annualIncomeCents: number;
  readonly expectedReturnPercent: number;
  readonly currentAge: number;
  readonly targetRetirementAge: number;
  readonly withdrawalRatePercent: number;
}

export interface SwrSensitivityPoint {
  readonly withdrawalRatePercent: number;
  readonly fiNumberCents: number;
  readonly yearsToFi: number;
}

export interface SharedFirePlan {
  readonly fiNumberCents: number;
  readonly fiProgressPercent: number;
  readonly coastFiCents: number;
  readonly isCoastFi: boolean;
  readonly savingsRatePercent: number;
  readonly yearsToFi: number;
  readonly projectedFiAge: number;
  readonly swrSensitivity: readonly SwrSensitivityPoint[];
  readonly warnings: readonly string[];
}

const MAX_YEARS = 100;

function cents(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function percent(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateSharedFiNumber(
  annualExpensesCents: number,
  withdrawalRatePercent: number,
): number {
  if (withdrawalRatePercent <= 0) return 0;
  return cents((cents(annualExpensesCents) * 100) / withdrawalRatePercent);
}

export function calculateSharedYearsToFi(
  currentPortfolioCents: number,
  annualSavingsCents: number,
  expectedReturnPercent: number,
  fiNumberCents: number,
  maxYears: number = MAX_YEARS,
): number {
  const target = cents(fiNumberCents);
  let portfolio = cents(currentPortfolioCents);
  const savings = cents(annualSavingsCents);
  if (target <= 0 || portfolio >= target) return 0;
  if (savings === 0 && expectedReturnPercent <= 0) return maxYears;
  const rate = expectedReturnPercent / 100;
  for (let year = 1; year <= maxYears; year += 1) {
    portfolio = cents(portfolio * (1 + rate) + savings);
    if (portfolio >= target) return year;
  }
  return maxYears;
}

export function calculateSharedFirePlan(input: SharedFireInput): SharedFirePlan {
  const fiNumberCents = calculateSharedFiNumber(input.annualExpensesCents, input.withdrawalRatePercent);
  const currentPortfolioCents = cents(input.currentPortfolioCents);
  const annualSavingsCents = cents(input.annualSavingsCents);
  const annualIncomeCents = cents(input.annualIncomeCents);
  const yearsToRetirement = Math.max(0, Math.trunc(input.targetRetirementAge - input.currentAge));
  const returnRate = input.expectedReturnPercent / 100;
  const coastFiCents = yearsToRetirement === 0 ? fiNumberCents : cents(fiNumberCents / (1 + returnRate) ** yearsToRetirement);
  const yearsToFi = calculateSharedYearsToFi(currentPortfolioCents, annualSavingsCents, input.expectedReturnPercent, fiNumberCents);
  const swrSensitivity = [3.5, 4, 4.5].map((withdrawalRatePercent) => {
    const target = calculateSharedFiNumber(input.annualExpensesCents, withdrawalRatePercent);
    return {
      withdrawalRatePercent,
      fiNumberCents: target,
      yearsToFi: calculateSharedYearsToFi(currentPortfolioCents, annualSavingsCents, input.expectedReturnPercent, target),
    };
  });
  const warnings: string[] = [];
  if (input.withdrawalRatePercent > 5) warnings.push('high-withdrawal-rate');
  if (annualSavingsCents <= 0 && currentPortfolioCents < fiNumberCents) warnings.push('no-positive-savings');
  if (input.expectedReturnPercent < 0) warnings.push('negative-return-assumption');

  return {
    fiNumberCents,
    fiProgressPercent: fiNumberCents === 0 ? 0 : percent((currentPortfolioCents / fiNumberCents) * 100),
    coastFiCents,
    isCoastFi: currentPortfolioCents >= coastFiCents,
    savingsRatePercent: annualIncomeCents === 0 ? 0 : percent((annualSavingsCents / annualIncomeCents) * 100),
    yearsToFi,
    projectedFiAge: input.currentAge + yearsToFi,
    swrSensitivity,
    warnings,
  };
}
