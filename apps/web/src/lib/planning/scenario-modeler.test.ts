// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for what-if scenario modeler engine.
 *
 * References: #1743, #1735
 */

import { describe, it, expect } from 'vitest';
import {
  projectScenario,
  projectBaselineScenario,
  compareScenarios,
  createEmptyScenario,
  createAdjustment,
  addAdjustment,
  removeAdjustment,
  duplicateScenario,
  type BaselineSnapshot,
} from './scenario-modeler';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const BASELINE: BaselineSnapshot = {
  netWorthCents: 10000000, // $100,000
  monthlyIncomeCents: 500000, // $5,000/month
  monthlyExpensesCents: 350000, // $3,500/month
  savingsCents: 5000000, // $50,000
};

// ---------------------------------------------------------------------------
// projectScenario
// ---------------------------------------------------------------------------

describe('projectScenario', () => {
  it('returns correct number of data points', () => {
    const scenario = createEmptyScenario('Test');
    const result = projectScenario(BASELINE, scenario, 24);
    // months 0..24 = 25 points
    expect(result.points).toHaveLength(25);
  });

  it('baseline scenario has zero net worth delta', () => {
    const scenario = createEmptyScenario('Empty');
    const result = projectScenario(BASELINE, scenario, 12);
    // Net worth delta vs baseline should be 0 for an empty scenario
    expect(result.netWorthDeltaCents).toBe(0);
  });

  it('income increase improves net worth over baseline', () => {
    const scenario = addAdjustment(
      createEmptyScenario('Raise'),
      createAdjustment('Salary raise', 'income', 100000), // +$1,000/month
    );
    const result = projectScenario(BASELINE, scenario, 12);
    expect(result.netWorthDeltaCents).toBeGreaterThan(0);
  });

  it('expense increase reduces net worth vs baseline', () => {
    const scenario = addAdjustment(
      createEmptyScenario('Mortgage'),
      createAdjustment('New mortgage', 'expense', 200000), // +$2,000/month expense
    );
    const result = projectScenario(BASELINE, scenario, 12);
    expect(result.netWorthDeltaCents).toBeLessThan(0);
  });

  it('one-time event is applied at the correct month', () => {
    const scenario = addAdjustment(
      createEmptyScenario('Bonus'),
      createAdjustment('Year-end bonus', 'one-time', 1000000, 6), // $10K at month 6
    );
    const result = projectScenario(BASELINE, scenario, 12);
    const beforeEvent = result.points.find((p) => p.month === 5);
    const afterEvent = result.points.find((p) => p.month === 6);
    // After the event, net worth should jump by approximately $10K + 1 month cash flow
    expect((afterEvent?.netWorthCents ?? 0) - (beforeEvent?.netWorthCents ?? 0)).toBeGreaterThan(
      500000,
    );
  });

  it('detects months to zero for unsustainable scenarios', () => {
    const scenario = addAdjustment(
      createEmptyScenario('Overspend'),
      createAdjustment('Massive expenses', 'expense', 600000), // +$6,000/month (exceeds income)
    );
    const result = projectScenario(BASELINE, scenario, 120);
    expect(result.monthsToZero).not.toBeNull();
    expect(result.monthsToZero).toBeGreaterThan(0);
  });

  it('returns null monthsToZero for sustainable scenarios', () => {
    const scenario = createEmptyScenario('Stable');
    const result = projectScenario(BASELINE, scenario, 60);
    expect(result.monthsToZero).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// projectBaselineScenario
// ---------------------------------------------------------------------------

describe('projectBaselineScenario', () => {
  it('uses __baseline__ as scenario ID', () => {
    const result = projectBaselineScenario(BASELINE, 12);
    expect(result.scenarioId).toBe('__baseline__');
  });

  it('net worth grows linearly with positive cash flow', () => {
    const result = projectBaselineScenario(BASELINE, 12);
    const first = result.points[0];
    const last = result.points[result.points.length - 1];
    expect((last?.netWorthCents ?? 0) > (first?.netWorthCents ?? 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// compareScenarios
// ---------------------------------------------------------------------------

describe('compareScenarios', () => {
  it('returns baseline plus all scenarios', () => {
    const s1 = createEmptyScenario('S1');
    const s2 = createEmptyScenario('S2');
    const results = compareScenarios(BASELINE, [s1, s2], 12);
    expect(results).toHaveLength(3); // baseline + 2 scenarios
    expect(results[0].scenarioId).toBe('__baseline__');
  });
});

// ---------------------------------------------------------------------------
// Scenario helpers
// ---------------------------------------------------------------------------

describe('scenario helpers', () => {
  it('createEmptyScenario creates scenario with no adjustments', () => {
    const s = createEmptyScenario('Test', 'A test scenario');
    expect(s.name).toBe('Test');
    expect(s.description).toBe('A test scenario');
    expect(s.adjustments).toHaveLength(0);
    expect(s.id).toBeTruthy();
  });

  it('addAdjustment appends to scenario', () => {
    const s = createEmptyScenario('Test');
    const adj = createAdjustment('Raise', 'income', 100000);
    const updated = addAdjustment(s, adj);
    expect(updated.adjustments).toHaveLength(1);
    expect(updated.adjustments[0].label).toBe('Raise');
  });

  it('removeAdjustment removes by ID', () => {
    const s = createEmptyScenario('Test');
    const adj = createAdjustment('Raise', 'income', 100000);
    const withAdj = addAdjustment(s, adj);
    const removed = removeAdjustment(withAdj, adj.id);
    expect(removed.adjustments).toHaveLength(0);
  });

  it('duplicateScenario creates a new ID', () => {
    const original = addAdjustment(
      createEmptyScenario('Original'),
      createAdjustment('Raise', 'income', 100000),
    );
    const copy = duplicateScenario(original, 'Copy');
    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('Copy');
    expect(copy.adjustments).toHaveLength(1);
    // Adjustment IDs should also be different
    expect(copy.adjustments[0].id).not.toBe(original.adjustments[0].id);
  });
});
