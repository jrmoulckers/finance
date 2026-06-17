// SPDX-License-Identifier: BUSL-1.1

import type { AccountType } from '../../kmp/bridge';
import { clamp, roundToOne } from './helpers';
import type { HealthScoreResult } from './types';

const LIQUID_ACCOUNT_TYPES = new Set<AccountType>(['CHECKING', 'SAVINGS', 'CASH']);

export interface HealthScoreInput {
  readonly savingsRate: number;
  readonly onTrackBudgetRatio: number;
  readonly monthlyExpenses: number;
  readonly emergencyFundBalance: number;
  readonly debtBalance: number;
  readonly annualizedIncome: number;
}

export function isLiquidAccountType(type: AccountType): boolean {
  return LIQUID_ACCOUNT_TYPES.has(type);
}

export function calculateHealthScore(input: HealthScoreInput): HealthScoreResult {
  const monthsOfExpensesSaved =
    input.monthlyExpenses > 0 ? input.emergencyFundBalance / input.monthlyExpenses : 0;
  const debtToIncomeRatio =
    input.annualizedIncome > 0
      ? input.debtBalance / input.annualizedIncome
      : input.debtBalance > 0
        ? 1
        : 0;

  const savingsRatePoints =
    input.savingsRate > 20 ? 25 : input.savingsRate > 10 ? 15 : input.savingsRate > 0 ? 8 : 0;
  const budgetAdherencePoints = clamp(input.onTrackBudgetRatio, 0, 1) * 25;
  const emergencyFundPoints = Math.min(Math.max(monthsOfExpensesSaved, 0) * 5, 25);
  const debtToIncomePoints =
    debtToIncomeRatio < 0.2 ? 25 : debtToIncomeRatio < 0.4 ? 15 : debtToIncomeRatio < 0.6 ? 8 : 0;

  const score = Math.round(
    savingsRatePoints + budgetAdherencePoints + emergencyFundPoints + debtToIncomePoints,
  );

  let label: HealthScoreResult['label'];
  if (score >= 85) {
    label = 'Excellent';
  } else if (score >= 70) {
    label = 'Strong';
  } else if (score >= 50) {
    label = 'Stable';
  } else {
    label = 'Needs attention';
  }

  return {
    score,
    label,
    breakdown: {
      savingsRate: savingsRatePoints,
      budgetAdherence: roundToOne(budgetAdherencePoints),
      emergencyFund: roundToOne(emergencyFundPoints),
      debtToIncome: debtToIncomePoints,
    },
    metrics: {
      savingsRate: input.savingsRate,
      onTrackBudgetRatio: clamp(input.onTrackBudgetRatio, 0, 1),
      monthsOfExpensesSaved: roundToOne(monthsOfExpensesSaved),
      debtToIncomeRatio: roundToOne(debtToIncomeRatio * 100),
    },
  };
}
