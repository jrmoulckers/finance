// SPDX-License-Identifier: BUSL-1.1

import { calculateSinkingFundPlan, type SinkingFundPlannerInput, type SinkingFundPlan } from './sinking-fund-planner';

export interface BudgetListRowInput {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  readonly amountCents: number;
  readonly spentCents: number;
}

export interface SinkingFundViewInput extends SinkingFundPlannerInput {
  readonly isArchived?: boolean;
}

export interface SinkingFundContributionRow {
  readonly fundId: string;
  readonly name: string;
  readonly linkedCategoryId: string;
  readonly contributionCents: number;
  readonly targetCents: number;
  readonly savedToDateCents: number;
  readonly remainingCents: number;
  readonly monthsRemaining: number;
  readonly status: SinkingFundPlan['status'];
}

export interface SinkingFundBudgetListState {
  readonly normalBudgets: readonly BudgetListRowInput[];
  readonly sinkingFundContributions: readonly SinkingFundContributionRow[];
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly emptyMessage: string | null;
}

export function buildSinkingFundBudgetListState(input: {
  readonly budgets: readonly BudgetListRowInput[];
  readonly funds: readonly SinkingFundViewInput[];
  readonly today: string;
  readonly isLoading?: boolean;
  readonly errorMessage?: string | null;
}): SinkingFundBudgetListState {
  const activeFunds = input.funds.filter((fund) => fund.isArchived !== true);
  const linkedFundCategoryIds = new Set(activeFunds.map((fund) => fund.linkedCategoryId));
  const sinkingFundContributions = activeFunds.map((fund) => toContributionRow(calculateSinkingFundPlan(fund, input.today)));
  const normalBudgets = input.budgets.filter((budget) => !linkedFundCategoryIds.has(budget.categoryId));
  const isLoading = input.isLoading === true;
  const errorMessage = input.errorMessage ?? null;

  return {
    normalBudgets,
    sinkingFundContributions,
    isLoading,
    errorMessage,
    emptyMessage:
      !isLoading && !errorMessage && normalBudgets.length === 0 && sinkingFundContributions.length === 0
        ? 'No budgets or sinking funds yet. Add one when you are ready.'
        : null,
  };
}

export function buildSinkingFundDetailView(
  fund: SinkingFundViewInput,
  today: string,
): SinkingFundContributionRow {
  return toContributionRow(calculateSinkingFundPlan(fund, today));
}

function toContributionRow(plan: SinkingFundPlan): SinkingFundContributionRow {
  return {
    fundId: plan.fundId,
    name: plan.name,
    linkedCategoryId: plan.linkedCategoryId,
    contributionCents: plan.contributionPerPeriodCents,
    targetCents: plan.targetCents,
    savedToDateCents: plan.savedToDateCents,
    remainingCents: plan.remainingCents,
    monthsRemaining: plan.monthsRemaining,
    status: plan.status,
  };
}
