// SPDX-License-Identifier: BUSL-1.1

export interface BudgetScenarioLine {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly amountCents: number;
}

export interface BudgetScenarioSinkingFundContribution {
  readonly id: string;
  readonly name: string;
  readonly linkedCategoryId: string;
  readonly contributionCents: number;
}

export interface BudgetScenarioBaseline {
  readonly id: string;
  readonly budgets: readonly BudgetScenarioLine[];
  readonly incomeCents: number;
  readonly startingBalanceCents: number;
}

export interface BudgetScenario {
  readonly id: string;
  readonly name: string;
  readonly baselineId: string;
  readonly createdAt: string;
  readonly budgets: readonly BudgetScenarioLine[];
  readonly incomeCents: number;
  readonly startingBalanceCents: number;
  readonly sinkingFundContributions: readonly BudgetScenarioSinkingFundContribution[];
}

export interface BudgetScenarioSummary {
  readonly baselineAssignedCents: number;
  readonly scenarioAssignedCents: number;
  readonly assignedDeltaCents: number;
  readonly baselineRemainingCashFlowCents: number;
  readonly scenarioRemainingCashFlowCents: number;
  readonly remainingCashFlowDeltaCents: number;
  readonly baselineProjectedMonthEndBalanceCents: number;
  readonly scenarioProjectedMonthEndBalanceCents: number;
  readonly projectedMonthEndDeltaCents: number;
  readonly sinkingFundContributionCents: number;
}

export interface BudgetScenarioDiff {
  readonly budgetId: string;
  readonly categoryId: string;
  readonly name: string;
  readonly baselineAmountCents: number;
  readonly scenarioAmountCents: number;
  readonly deltaCents: number;
}

export interface BudgetScenarioApplyPatch {
  readonly budgetUpdates: readonly { readonly budgetId: string; readonly amountCents: number }[];
  readonly sinkingFundContributionBudgets: readonly {
    readonly name: string;
    readonly categoryId: string;
    readonly amountCents: number;
  }[];
  readonly incomeCents: number;
}

export function createBudgetScenarioFromBaseline(
  baseline: BudgetScenarioBaseline,
  options: { readonly id: string; readonly name: string; readonly createdAt: string },
): BudgetScenario {
  return {
    id: options.id,
    name: options.name,
    baselineId: baseline.id,
    createdAt: options.createdAt,
    budgets: baseline.budgets.map((budget) => ({ ...budget })),
    incomeCents: baseline.incomeCents,
    startingBalanceCents: baseline.startingBalanceCents,
    sinkingFundContributions: [],
  };
}

export function updateScenarioBudgetAmount(
  scenario: BudgetScenario,
  budgetId: string,
  amountCents: number,
): BudgetScenario {
  return {
    ...scenario,
    budgets: scenario.budgets.map((budget) =>
      budget.id === budgetId ? { ...budget, amountCents: Math.max(0, Math.round(amountCents)) } : budget,
    ),
  };
}

export function updateScenarioIncome(scenario: BudgetScenario, incomeCents: number): BudgetScenario {
  return { ...scenario, incomeCents: Math.max(0, Math.round(incomeCents)) };
}

export function addScenarioSinkingFundContribution(
  scenario: BudgetScenario,
  contribution: BudgetScenarioSinkingFundContribution,
): BudgetScenario {
  const normalized = {
    ...contribution,
    contributionCents: Math.max(0, Math.round(contribution.contributionCents)),
  };

  return {
    ...scenario,
    sinkingFundContributions: [
      ...scenario.sinkingFundContributions.filter((item) => item.id !== contribution.id),
      normalized,
    ],
  };
}

function totalAssignedCents(budgets: readonly BudgetScenarioLine[]): number {
  return budgets.reduce((sum, budget) => sum + budget.amountCents, 0);
}

function totalSinkingFundContributions(
  contributions: readonly BudgetScenarioSinkingFundContribution[],
): number {
  return contributions.reduce((sum, contribution) => sum + contribution.contributionCents, 0);
}

export function summarizeBudgetScenario(
  baseline: BudgetScenarioBaseline,
  scenario: BudgetScenario,
): BudgetScenarioSummary {
  const baselineAssignedCents = totalAssignedCents(baseline.budgets);
  const scenarioBudgetAssignedCents = totalAssignedCents(scenario.budgets);
  const sinkingFundContributionCents = totalSinkingFundContributions(scenario.sinkingFundContributions);
  const scenarioAssignedCents = scenarioBudgetAssignedCents + sinkingFundContributionCents;
  const baselineRemainingCashFlowCents = baseline.incomeCents - baselineAssignedCents;
  const scenarioRemainingCashFlowCents = scenario.incomeCents - scenarioAssignedCents;
  const baselineProjectedMonthEndBalanceCents = baseline.startingBalanceCents + baselineRemainingCashFlowCents;
  const scenarioProjectedMonthEndBalanceCents =
    scenario.startingBalanceCents + scenarioRemainingCashFlowCents;

  return {
    baselineAssignedCents,
    scenarioAssignedCents,
    assignedDeltaCents: scenarioAssignedCents - baselineAssignedCents,
    baselineRemainingCashFlowCents,
    scenarioRemainingCashFlowCents,
    remainingCashFlowDeltaCents: scenarioRemainingCashFlowCents - baselineRemainingCashFlowCents,
    baselineProjectedMonthEndBalanceCents,
    scenarioProjectedMonthEndBalanceCents,
    projectedMonthEndDeltaCents:
      scenarioProjectedMonthEndBalanceCents - baselineProjectedMonthEndBalanceCents,
    sinkingFundContributionCents,
  };
}

export function diffBudgetScenario(
  baseline: BudgetScenarioBaseline,
  scenario: BudgetScenario,
): BudgetScenarioDiff[] {
  const baselineById = new Map(baseline.budgets.map((budget) => [budget.id, budget]));

  return scenario.budgets
    .map((budget) => {
      const baselineBudget = baselineById.get(budget.id);
      const baselineAmountCents = baselineBudget?.amountCents ?? 0;
      return {
        budgetId: budget.id,
        categoryId: budget.categoryId,
        name: budget.name,
        baselineAmountCents,
        scenarioAmountCents: budget.amountCents,
        deltaCents: budget.amountCents - baselineAmountCents,
      };
    })
    .filter((diff) => diff.deltaCents !== 0);
}

export function buildApplyBudgetScenarioPatch(
  baseline: BudgetScenarioBaseline,
  scenario: BudgetScenario,
): BudgetScenarioApplyPatch {
  return {
    budgetUpdates: diffBudgetScenario(baseline, scenario).map((diff) => ({
      budgetId: diff.budgetId,
      amountCents: diff.scenarioAmountCents,
    })),
    sinkingFundContributionBudgets: scenario.sinkingFundContributions.map((contribution) => ({
      name: contribution.name,
      categoryId: contribution.linkedCategoryId,
      amountCents: contribution.contributionCents,
    })),
    incomeCents: scenario.incomeCents,
  };
}
