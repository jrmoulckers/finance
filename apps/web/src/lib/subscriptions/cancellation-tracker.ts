// SPDX-License-Identifier: BUSL-1.1

/**
 * Cancellation tracker and guided follow-through engine.
 *
 * Provides a multi-step cancellation workflow and savings calculation
 * for subscription cancellations.
 *
 * All monetary values are integer cents. Pure functions — no side effects.
 *
 * References: issues #1596, #1619
 */

import type {
  BillingCycle,
  CancellationPhase,
  CancellationStep,
  CancellationWorkflow,
  Subscription,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of months in a year. */
const MONTHS_PER_YEAR = 12;

/** Cancellation phases in order. */
const PHASES: readonly CancellationPhase[] = [
  'confirm_intent',
  'check_contract',
  'execute_cancellation',
  'verify_cancelled',
  'follow_up',
];

// ---------------------------------------------------------------------------
// Billing-cycle helpers
// ---------------------------------------------------------------------------

/**
 * Returns the number of billing cycles per year for a given cycle.
 *
 * @param cycle - The billing frequency.
 * @returns Number of billing occurrences per year.
 */
export function cyclesPerYear(cycle: BillingCycle): number {
  switch (cycle) {
    case 'weekly':
      return 52;
    case 'biweekly':
      return 26;
    case 'monthly':
      return MONTHS_PER_YEAR;
    case 'quarterly':
      return 4;
    case 'annual':
      return 1;
  }
}

/**
 * Converts a subscription's price to an equivalent monthly cost in cents.
 *
 * Uses integer arithmetic with Math.round to avoid floating-point errors.
 *
 * @param priceCents - Price per billing cycle in cents.
 * @param cycle - Billing frequency.
 * @returns Equivalent monthly cost in cents.
 */
export function toMonthlyCostCents(priceCents: number, cycle: BillingCycle): number {
  const perYear = priceCents * cyclesPerYear(cycle);
  return Math.round(perYear / MONTHS_PER_YEAR);
}

/**
 * Converts a subscription's price to an equivalent annual cost in cents.
 *
 * @param priceCents - Price per billing cycle in cents.
 * @param cycle - Billing frequency.
 * @returns Equivalent annual cost in cents.
 */
export function toAnnualCostCents(priceCents: number, cycle: BillingCycle): number {
  return priceCents * cyclesPerYear(cycle);
}

// ---------------------------------------------------------------------------
// Cancellation workflow
// ---------------------------------------------------------------------------

/**
 * Builds the default set of cancellation steps.
 *
 * Each step has a title and description guiding the user through
 * the cancellation process.
 *
 * @returns An array of incomplete cancellation steps.
 */
export function buildCancellationSteps(): readonly CancellationStep[] {
  return [
    {
      phase: 'confirm_intent',
      title: 'Confirm your intent',
      description:
        'Review the subscription details and confirm you want to proceed with cancellation.',
      completed: false,
    },
    {
      phase: 'check_contract',
      title: 'Check contract terms',
      description:
        'Review cancellation fees, notice periods, and any remaining contract commitments.',
      completed: false,
    },
    {
      phase: 'execute_cancellation',
      title: 'Cancel the subscription',
      description:
        'Follow the provider cancellation process. Save any confirmation numbers or emails.',
      completed: false,
    },
    {
      phase: 'verify_cancelled',
      title: 'Verify cancellation',
      description:
        'Confirm no further charges appear. Check your email for a cancellation confirmation.',
      completed: false,
    },
    {
      phase: 'follow_up',
      title: 'Follow up',
      description:
        'Monitor your bank statements for 1-2 billing cycles to ensure no unexpected charges.',
      completed: false,
    },
  ];
}

/**
 * Creates a new cancellation workflow for a given subscription.
 *
 * @param subscription - The subscription to cancel.
 * @returns A fresh cancellation workflow with estimated savings.
 */
export function createCancellationWorkflow(subscription: Subscription): CancellationWorkflow {
  const monthlySavings = toMonthlyCostCents(subscription.priceCents, subscription.billingCycle);
  const annualSavings = toAnnualCostCents(subscription.priceCents, subscription.billingCycle);

  return {
    subscriptionId: subscription.id,
    subscriptionName: subscription.name,
    steps: buildCancellationSteps(),
    currentPhase: 'confirm_intent',
    isComplete: false,
    estimatedMonthlySavingsCents: monthlySavings,
    estimatedAnnualSavingsCents: annualSavings,
  };
}

/**
 * Advances a cancellation workflow by marking a phase as complete.
 *
 * Returns a new workflow object (immutable update). If the phase is not
 * the current phase or is already complete, returns the workflow unchanged.
 *
 * @param workflow - Current workflow state.
 * @param phase - The phase to mark as complete.
 * @param completedDate - ISO date string when the step was completed.
 * @returns Updated workflow with the step marked complete.
 */
export function completeStep(
  workflow: CancellationWorkflow,
  phase: CancellationPhase,
  completedDate: string,
): CancellationWorkflow {
  if (phase !== workflow.currentPhase) {
    return workflow;
  }

  const updatedSteps = workflow.steps.map((step) =>
    step.phase === phase ? { ...step, completed: true, completedDate } : step,
  );

  const currentIndex = PHASES.indexOf(phase);
  const nextIndex = currentIndex + 1;
  const isComplete = nextIndex >= PHASES.length;
  const nextPhase = isComplete ? phase : PHASES[nextIndex];

  return {
    ...workflow,
    steps: updatedSteps,
    currentPhase: nextPhase,
    isComplete,
  };
}

/**
 * Calculates the total estimated savings from cancelling multiple subscriptions.
 *
 * @param subscriptions - Subscriptions being considered for cancellation.
 * @returns Object with total monthly and annual savings in cents.
 */
export function calculateCancellationSavings(subscriptions: readonly Subscription[]): {
  readonly totalMonthlySavingsCents: number;
  readonly totalAnnualSavingsCents: number;
} {
  let totalMonthly = 0;
  let totalAnnual = 0;

  for (const sub of subscriptions) {
    totalMonthly += toMonthlyCostCents(sub.priceCents, sub.billingCycle);
    totalAnnual += toAnnualCostCents(sub.priceCents, sub.billingCycle);
  }

  return {
    totalMonthlySavingsCents: totalMonthly,
    totalAnnualSavingsCents: totalAnnual,
  };
}

/**
 * Returns the progress percentage of a cancellation workflow (0–100).
 *
 * @param workflow - The cancellation workflow.
 * @returns Integer percentage of completed steps.
 */
export function getWorkflowProgress(workflow: CancellationWorkflow): number {
  const total = workflow.steps.length;
  if (total === 0) return 0;
  const completed = workflow.steps.filter((s) => s.completed).length;
  return Math.round((completed / total) * 100);
}
