// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the cancellation tracker engine.
 *
 * Covers: billing cycle conversions, cancellation workflow creation,
 * step completion, multi-subscription savings, and progress tracking.
 *
 * All monetary values in cents. Edge cases: zero-cost subscriptions,
 * annual billing, completing steps out of order.
 *
 * References: issues #1596, #1619
 */

import { describe, expect, it } from 'vitest';
import {
  buildCancellationSteps,
  calculateCancellationSavings,
  completeStep,
  createCancellationWorkflow,
  cyclesPerYear,
  getWorkflowProgress,
  toAnnualCostCents,
  toMonthlyCostCents,
} from './cancellation-tracker';
import type { Subscription } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    name: 'Test Service',
    priceCents: 1499,
    billingCycle: 'monthly',
    category: 'streaming',
    status: 'active',
    startDate: '2024-01-01',
    nextBillingDate: '2025-02-01',
    provider: 'TestCo',
    priceHistory: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// cyclesPerYear
// ---------------------------------------------------------------------------

describe('cyclesPerYear', () => {
  it('returns 52 for weekly', () => {
    expect(cyclesPerYear('weekly')).toBe(52);
  });

  it('returns 26 for biweekly', () => {
    expect(cyclesPerYear('biweekly')).toBe(26);
  });

  it('returns 12 for monthly', () => {
    expect(cyclesPerYear('monthly')).toBe(12);
  });

  it('returns 4 for quarterly', () => {
    expect(cyclesPerYear('quarterly')).toBe(4);
  });

  it('returns 1 for annual', () => {
    expect(cyclesPerYear('annual')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// toMonthlyCostCents
// ---------------------------------------------------------------------------

describe('toMonthlyCostCents', () => {
  it('returns the same value for monthly billing', () => {
    expect(toMonthlyCostCents(1499, 'monthly')).toBe(1499);
  });

  it('converts annual to monthly', () => {
    // $119.88/year → $9.99/month
    expect(toMonthlyCostCents(11988, 'annual')).toBe(999);
  });

  it('converts weekly to monthly', () => {
    // $10/week → $10 * 52 / 12 = $43.33/month → 4333 cents
    expect(toMonthlyCostCents(1000, 'weekly')).toBe(4333);
  });

  it('converts quarterly to monthly', () => {
    // $30/quarter → $30 * 4 / 12 = $10/month
    expect(toMonthlyCostCents(3000, 'quarterly')).toBe(1000);
  });

  it('returns 0 for zero-cost subscription', () => {
    expect(toMonthlyCostCents(0, 'monthly')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toAnnualCostCents
// ---------------------------------------------------------------------------

describe('toAnnualCostCents', () => {
  it('multiplies monthly by 12', () => {
    expect(toAnnualCostCents(1499, 'monthly')).toBe(17988);
  });

  it('returns same value for annual', () => {
    expect(toAnnualCostCents(11988, 'annual')).toBe(11988);
  });

  it('multiplies weekly by 52', () => {
    expect(toAnnualCostCents(1000, 'weekly')).toBe(52000);
  });

  it('returns 0 for zero-cost subscription', () => {
    expect(toAnnualCostCents(0, 'annual')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildCancellationSteps
// ---------------------------------------------------------------------------

describe('buildCancellationSteps', () => {
  it('returns 5 steps in order', () => {
    const steps = buildCancellationSteps();
    expect(steps).toHaveLength(5);
    expect(steps[0].phase).toBe('confirm_intent');
    expect(steps[1].phase).toBe('check_contract');
    expect(steps[2].phase).toBe('execute_cancellation');
    expect(steps[3].phase).toBe('verify_cancelled');
    expect(steps[4].phase).toBe('follow_up');
  });

  it('all steps start incomplete', () => {
    const steps = buildCancellationSteps();
    for (const step of steps) {
      expect(step.completed).toBe(false);
      expect(step.completedDate).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// createCancellationWorkflow
// ---------------------------------------------------------------------------

describe('createCancellationWorkflow', () => {
  it('creates workflow with correct subscription details', () => {
    const sub = makeSub({ name: 'Netflix', priceCents: 1599 });
    const wf = createCancellationWorkflow(sub);

    expect(wf.subscriptionId).toBe(sub.id);
    expect(wf.subscriptionName).toBe('Netflix');
    expect(wf.currentPhase).toBe('confirm_intent');
    expect(wf.isComplete).toBe(false);
    expect(wf.steps).toHaveLength(5);
  });

  it('calculates correct monthly savings', () => {
    const sub = makeSub({ priceCents: 1599, billingCycle: 'monthly' });
    const wf = createCancellationWorkflow(sub);
    expect(wf.estimatedMonthlySavingsCents).toBe(1599);
  });

  it('calculates correct annual savings for annual billing', () => {
    const sub = makeSub({ priceCents: 11988, billingCycle: 'annual' });
    const wf = createCancellationWorkflow(sub);
    expect(wf.estimatedAnnualSavingsCents).toBe(11988);
  });
});

// ---------------------------------------------------------------------------
// completeStep
// ---------------------------------------------------------------------------

describe('completeStep', () => {
  it('advances to next phase when current phase is completed', () => {
    const sub = makeSub();
    let wf = createCancellationWorkflow(sub);

    wf = completeStep(wf, 'confirm_intent', '2025-01-15');
    expect(wf.currentPhase).toBe('check_contract');
    expect(wf.steps[0].completed).toBe(true);
    expect(wf.steps[0].completedDate).toBe('2025-01-15');
    expect(wf.isComplete).toBe(false);
  });

  it('does not change workflow when wrong phase is completed', () => {
    const sub = makeSub();
    const wf = createCancellationWorkflow(sub);

    const result = completeStep(wf, 'execute_cancellation', '2025-01-15');
    expect(result.currentPhase).toBe('confirm_intent');
    expect(result.steps[2].completed).toBe(false);
  });

  it('marks workflow complete after last step', () => {
    const sub = makeSub();
    let wf = createCancellationWorkflow(sub);

    wf = completeStep(wf, 'confirm_intent', '2025-01-15');
    wf = completeStep(wf, 'check_contract', '2025-01-16');
    wf = completeStep(wf, 'execute_cancellation', '2025-01-17');
    wf = completeStep(wf, 'verify_cancelled', '2025-01-18');
    wf = completeStep(wf, 'follow_up', '2025-01-19');

    expect(wf.isComplete).toBe(true);
    expect(wf.steps.every((s) => s.completed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// calculateCancellationSavings
// ---------------------------------------------------------------------------

describe('calculateCancellationSavings', () => {
  it('sums savings from multiple subscriptions', () => {
    const subs = [
      makeSub({ priceCents: 1599, billingCycle: 'monthly' }),
      makeSub({ id: 'sub-2', priceCents: 999, billingCycle: 'monthly' }),
    ];

    const savings = calculateCancellationSavings(subs);
    expect(savings.totalMonthlySavingsCents).toBe(2598);
    expect(savings.totalAnnualSavingsCents).toBe(31176);
  });

  it('handles mixed billing cycles', () => {
    const subs = [
      makeSub({ priceCents: 1200, billingCycle: 'monthly' }),
      makeSub({ id: 'sub-2', priceCents: 12000, billingCycle: 'annual' }),
    ];

    const savings = calculateCancellationSavings(subs);
    // Monthly: 1200 + (12000/12 = 1000) = 2200
    expect(savings.totalMonthlySavingsCents).toBe(2200);
    // Annual: 14400 + 12000 = 26400
    expect(savings.totalAnnualSavingsCents).toBe(26400);
  });

  it('returns zero for empty list', () => {
    const savings = calculateCancellationSavings([]);
    expect(savings.totalMonthlySavingsCents).toBe(0);
    expect(savings.totalAnnualSavingsCents).toBe(0);
  });

  it('handles zero-cost subscriptions', () => {
    const subs = [makeSub({ priceCents: 0 })];
    const savings = calculateCancellationSavings(subs);
    expect(savings.totalMonthlySavingsCents).toBe(0);
    expect(savings.totalAnnualSavingsCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getWorkflowProgress
// ---------------------------------------------------------------------------

describe('getWorkflowProgress', () => {
  it('returns 0 for a fresh workflow', () => {
    const wf = createCancellationWorkflow(makeSub());
    expect(getWorkflowProgress(wf)).toBe(0);
  });

  it('returns 20 after completing 1 of 5 steps', () => {
    let wf = createCancellationWorkflow(makeSub());
    wf = completeStep(wf, 'confirm_intent', '2025-01-15');
    expect(getWorkflowProgress(wf)).toBe(20);
  });

  it('returns 100 for a fully complete workflow', () => {
    let wf = createCancellationWorkflow(makeSub());
    wf = completeStep(wf, 'confirm_intent', '2025-01-15');
    wf = completeStep(wf, 'check_contract', '2025-01-16');
    wf = completeStep(wf, 'execute_cancellation', '2025-01-17');
    wf = completeStep(wf, 'verify_cancelled', '2025-01-18');
    wf = completeStep(wf, 'follow_up', '2025-01-19');
    expect(getWorkflowProgress(wf)).toBe(100);
  });
});
