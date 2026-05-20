// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { PayYourselfFirstRule } from '../advanced-types';
import { allocatePayYourselfFirst } from '../pay-yourself-first';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRule(overrides: Partial<PayYourselfFirstRule> & { id: string }): PayYourselfFirstRule {
  return {
    targetName: 'Test',
    allocationType: 'fixed',
    value: 0,
    priority: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// allocatePayYourselfFirst
// ---------------------------------------------------------------------------

describe('allocatePayYourselfFirst', () => {
  it('funds all rules when income is sufficient', () => {
    const rules: PayYourselfFirstRule[] = [
      makeRule({ id: '1', targetName: 'Emergency Fund', value: 50_000, priority: 1 }),
      makeRule({ id: '2', targetName: '401k', value: 30_000, priority: 2 }),
    ];

    const result = allocatePayYourselfFirst(500_000, rules);

    expect(result.incomeCents).toBe(500_000);
    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0].fundedCents).toBe(50_000);
    expect(result.allocations[0].fullyFunded).toBe(true);
    expect(result.allocations[1].fundedCents).toBe(30_000);
    expect(result.allocations[1].fullyFunded).toBe(true);
    expect(result.discretionaryCents).toBe(420_000);
    expect(result.unfundedRules).toHaveLength(0);
  });

  it('partially funds lower-priority rules when income is scarce', () => {
    const rules: PayYourselfFirstRule[] = [
      makeRule({ id: '1', targetName: 'Savings', value: 30_000, priority: 1 }),
      makeRule({ id: '2', targetName: 'Vacation', value: 30_000, priority: 2 }),
    ];

    const result = allocatePayYourselfFirst(40_000, rules);

    expect(result.allocations[0].fundedCents).toBe(30_000);
    expect(result.allocations[0].fullyFunded).toBe(true);
    expect(result.allocations[1].fundedCents).toBe(10_000);
    expect(result.allocations[1].fullyFunded).toBe(false);
    expect(result.discretionaryCents).toBe(0);
    expect(result.unfundedRules).toHaveLength(1);
  });

  it('handles percentage-based rules', () => {
    const rules: PayYourselfFirstRule[] = [
      makeRule({
        id: '1',
        targetName: 'Savings',
        allocationType: 'percentage',
        value: 2000, // 20% = 2000 bps
        priority: 1,
      }),
    ];

    const result = allocatePayYourselfFirst(500_000, rules);

    expect(result.allocations[0].requestedCents).toBe(100_000); // 20% of 500k
    expect(result.allocations[0].fundedCents).toBe(100_000);
    expect(result.discretionaryCents).toBe(400_000);
  });

  it('handles zero income', () => {
    const rules: PayYourselfFirstRule[] = [
      makeRule({ id: '1', targetName: 'Savings', value: 10_000, priority: 1 }),
    ];

    const result = allocatePayYourselfFirst(0, rules);

    expect(result.allocations[0].fundedCents).toBe(0);
    expect(result.allocations[0].fullyFunded).toBe(false);
    expect(result.discretionaryCents).toBe(0);
  });

  it('handles negative income', () => {
    const result = allocatePayYourselfFirst(-1_000, [
      makeRule({ id: '1', value: 500, priority: 1 }),
    ]);

    expect(result.allocations).toHaveLength(0);
    expect(result.discretionaryCents).toBe(0);
    expect(result.unfundedRules).toHaveLength(1);
  });

  it('handles empty rules', () => {
    const result = allocatePayYourselfFirst(100_000, []);

    expect(result.allocations).toHaveLength(0);
    expect(result.discretionaryCents).toBe(100_000);
  });

  it('sorts rules by priority regardless of input order', () => {
    const rules: PayYourselfFirstRule[] = [
      makeRule({ id: 'low', targetName: 'Low', value: 10_000, priority: 3 }),
      makeRule({ id: 'high', targetName: 'High', value: 10_000, priority: 1 }),
      makeRule({ id: 'mid', targetName: 'Mid', value: 10_000, priority: 2 }),
    ];

    const result = allocatePayYourselfFirst(15_000, rules);

    expect(result.allocations[0].ruleId).toBe('high');
    expect(result.allocations[0].fullyFunded).toBe(true);
    expect(result.allocations[1].ruleId).toBe('mid');
    expect(result.allocations[1].fundedCents).toBe(5_000);
    expect(result.allocations[2].ruleId).toBe('low');
    expect(result.allocations[2].fundedCents).toBe(0);
  });

  it('does not mutate input rules', () => {
    const rules: PayYourselfFirstRule[] = [
      makeRule({ id: '1', value: 10_000, priority: 2 }),
      makeRule({ id: '2', value: 10_000, priority: 1 }),
    ];
    const originalFirst = rules[0];

    allocatePayYourselfFirst(50_000, rules);

    expect(rules[0]).toBe(originalFirst);
  });
});
