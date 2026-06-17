// SPDX-License-Identifier: BUSL-1.1

import type { BudgetScenario, BudgetScenarioBaseline, BudgetScenarioSummary } from './budget-scenarios';
import {
  addScenarioSinkingFundContribution,
  createBudgetScenarioFromBaseline,
  summarizeBudgetScenario,
  updateScenarioBudgetAmount,
  updateScenarioIncome,
} from './budget-scenarios';

export type BudgetScenarioEntryPoint = 'duplicate' | 'discard' | 'apply';

export interface BudgetScenarioEditorState {
  readonly scenario: BudgetScenario;
  readonly summary: BudgetScenarioSummary;
  readonly dirtyBudgetIds: readonly string[];
  readonly hasSinkingFundChanges: boolean;
  readonly hasIncomeChange: boolean;
}

export interface BudgetScenarioEntryPointDecision {
  readonly entryPoint: BudgetScenarioEntryPoint;
  readonly requiresConfirmation: boolean;
  readonly title: string;
  readonly message: string;
  readonly destructive: boolean;
}

export function createScenarioEditorState(
  baseline: BudgetScenarioBaseline,
  scenario: BudgetScenario,
): BudgetScenarioEditorState {
  const baselineById = new Map(baseline.budgets.map((budget) => [budget.id, budget.amountCents]));
  const dirtyBudgetIds = scenario.budgets
    .filter((budget) => (baselineById.get(budget.id) ?? 0) !== budget.amountCents)
    .map((budget) => budget.id);

  return {
    scenario,
    summary: summarizeBudgetScenario(baseline, scenario),
    dirtyBudgetIds,
    hasSinkingFundChanges: scenario.sinkingFundContributions.length > 0,
    hasIncomeChange: baseline.incomeCents !== scenario.incomeCents,
  };
}

export function createScenarioFromCurrentBudget(
  baseline: BudgetScenarioBaseline,
  options: { readonly id: string; readonly name: string; readonly createdAt: string },
): BudgetScenario {
  return createBudgetScenarioFromBaseline(baseline, options);
}

export function editScenarioCategoryAmount(
  scenario: BudgetScenario,
  budgetId: string,
  amountCents: number,
): BudgetScenario {
  return updateScenarioBudgetAmount(scenario, budgetId, amountCents);
}

export function editScenarioIncome(scenario: BudgetScenario, incomeCents: number): BudgetScenario {
  return updateScenarioIncome(scenario, incomeCents);
}

export function editScenarioSinkingFundContribution(
  scenario: BudgetScenario,
  contribution: Parameters<typeof addScenarioSinkingFundContribution>[1],
): BudgetScenario {
  return addScenarioSinkingFundContribution(scenario, contribution);
}

export function duplicateScenarioDraft(
  scenario: BudgetScenario,
  options: { readonly id: string; readonly name: string; readonly createdAt: string },
): BudgetScenario {
  return {
    ...scenario,
    id: options.id,
    name: options.name,
    createdAt: options.createdAt,
    budgets: scenario.budgets.map((budget) => ({ ...budget })),
    sinkingFundContributions: scenario.sinkingFundContributions.map((contribution) => ({
      ...contribution,
    })),
  };
}

export function getScenarioEntryPointDecision(
  entryPoint: BudgetScenarioEntryPoint,
  state: BudgetScenarioEditorState,
): BudgetScenarioEntryPointDecision {
  const changeCount = state.dirtyBudgetIds.length + (state.hasIncomeChange ? 1 : 0) +
    (state.hasSinkingFundChanges ? 1 : 0);

  if (entryPoint === 'duplicate') {
    return {
      entryPoint,
      requiresConfirmation: false,
      title: 'Duplicate scenario',
      message: 'Create a separate copy without changing the live budget.',
      destructive: false,
    };
  }

  if (entryPoint === 'discard') {
    return {
      entryPoint,
      requiresConfirmation: changeCount > 0,
      title: 'Discard scenario',
      message: changeCount > 0
        ? `Discard ${changeCount} scenario change${changeCount === 1 ? '' : 's'} without touching live budgets.`
        : 'Discard this unchanged scenario without touching live budgets.',
      destructive: true,
    };
  }

  return {
    entryPoint,
    requiresConfirmation: true,
    title: 'Apply scenario',
    message: `Apply ${changeCount} scenario change${changeCount === 1 ? '' : 's'} after reviewing stale-baseline warnings.`,
    destructive: false,
  };
}

export function summarizeScenarioComparison(
  baseline: BudgetScenarioBaseline,
  scenario: BudgetScenario,
): Pick<
  BudgetScenarioSummary,
  | 'scenarioAssignedCents'
  | 'scenarioRemainingCashFlowCents'
  | 'scenarioProjectedMonthEndBalanceCents'
  | 'assignedDeltaCents'
  | 'remainingCashFlowDeltaCents'
  | 'projectedMonthEndDeltaCents'
> {
  const summary = summarizeBudgetScenario(baseline, scenario);
  return {
    scenarioAssignedCents: summary.scenarioAssignedCents,
    scenarioRemainingCashFlowCents: summary.scenarioRemainingCashFlowCents,
    scenarioProjectedMonthEndBalanceCents: summary.scenarioProjectedMonthEndBalanceCents,
    assignedDeltaCents: summary.assignedDeltaCents,
    remainingCashFlowDeltaCents: summary.remainingCashFlowDeltaCents,
    projectedMonthEndDeltaCents: summary.projectedMonthEndDeltaCents,
  };
}
