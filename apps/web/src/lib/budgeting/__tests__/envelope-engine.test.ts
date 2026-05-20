// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Envelope, MoveMoneyRequest } from '../advanced-types';
import { calculateEnvelopeSummary, envelopeAvailable, moveMoney } from '../envelope-engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEnvelope(overrides: Partial<Envelope> & { id: string }): Envelope {
  return {
    name: 'Test',
    budgetedCents: 0,
    spentCents: 0,
    carryoverCents: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateEnvelopeSummary
// ---------------------------------------------------------------------------

describe('calculateEnvelopeSummary', () => {
  it('returns correct available-to-budget with no envelopes', () => {
    const result = calculateEnvelopeSummary(500_000, []);
    expect(result.totalIncomeCents).toBe(500_000);
    expect(result.totalBudgetedCents).toBe(0);
    expect(result.availableToBudgetCents).toBe(500_000);
    expect(result.envelopes).toEqual([]);
  });

  it('calculates per-envelope available balance', () => {
    const envelopes: Envelope[] = [
      makeEnvelope({ id: 'rent', name: 'Rent', budgetedCents: 150_000, spentCents: 150_000 }),
      makeEnvelope({
        id: 'food',
        name: 'Food',
        budgetedCents: 60_000,
        spentCents: 30_000,
        carryoverCents: 5_000,
      }),
    ];

    const result = calculateEnvelopeSummary(300_000, envelopes);

    expect(result.totalBudgetedCents).toBe(210_000);
    expect(result.availableToBudgetCents).toBe(90_000);

    const rent = result.envelopes.find((e) => e.id === 'rent')!;
    expect(rent.availableCents).toBe(0);

    const food = result.envelopes.find((e) => e.id === 'food')!;
    expect(food.availableCents).toBe(35_000); // 60000 + 5000 - 30000
  });

  it('handles over-budgeted scenario', () => {
    const envelopes: Envelope[] = [
      makeEnvelope({ id: 'a', budgetedCents: 200_000 }),
      makeEnvelope({ id: 'b', budgetedCents: 200_000 }),
    ];

    const result = calculateEnvelopeSummary(300_000, envelopes);
    expect(result.availableToBudgetCents).toBe(-100_000);
  });

  it('handles negative carryover (overspent prior period)', () => {
    const envelopes: Envelope[] = [
      makeEnvelope({ id: 'a', budgetedCents: 50_000, spentCents: 0, carryoverCents: -10_000 }),
    ];

    const result = calculateEnvelopeSummary(100_000, envelopes);
    const detail = result.envelopes[0];
    expect(detail.availableCents).toBe(40_000); // 50000 + (-10000) - 0
  });
});

// ---------------------------------------------------------------------------
// envelopeAvailable
// ---------------------------------------------------------------------------

describe('envelopeAvailable', () => {
  it('calculates available balance', () => {
    expect(
      envelopeAvailable(
        makeEnvelope({ id: 'a', budgetedCents: 100_00, spentCents: 40_00, carryoverCents: 10_00 }),
      ),
    ).toBe(70_00);
  });

  it('returns negative when overspent', () => {
    expect(
      envelopeAvailable(
        makeEnvelope({ id: 'a', budgetedCents: 50_00, spentCents: 80_00, carryoverCents: 0 }),
      ),
    ).toBe(-30_00);
  });

  it('returns zero when fully spent', () => {
    expect(
      envelopeAvailable(makeEnvelope({ id: 'a', budgetedCents: 100_00, spentCents: 100_00 })),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// moveMoney
// ---------------------------------------------------------------------------

describe('moveMoney', () => {
  const baseEnvelopes: Envelope[] = [
    makeEnvelope({ id: 'food', name: 'Food', budgetedCents: 60_000, spentCents: 20_000 }),
    makeEnvelope({ id: 'fun', name: 'Fun', budgetedCents: 30_000, spentCents: 10_000 }),
  ];

  it('moves money between envelopes successfully', () => {
    const request: MoveMoneyRequest = {
      fromEnvelopeId: 'food',
      toEnvelopeId: 'fun',
      amountCents: 10_000,
    };

    const result = moveMoney(baseEnvelopes, request);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    const food = result.envelopes.find((e) => e.id === 'food')!;
    const fun = result.envelopes.find((e) => e.id === 'fun')!;

    expect(food.budgetedCents).toBe(50_000);
    expect(fun.budgetedCents).toBe(40_000);
  });

  it('fails with non-positive amount', () => {
    const result = moveMoney(baseEnvelopes, {
      fromEnvelopeId: 'food',
      toEnvelopeId: 'fun',
      amountCents: 0,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('positive');
  });

  it('fails with negative amount', () => {
    const result = moveMoney(baseEnvelopes, {
      fromEnvelopeId: 'food',
      toEnvelopeId: 'fun',
      amountCents: -100,
    });

    expect(result.success).toBe(false);
  });

  it('fails when source and destination are the same', () => {
    const result = moveMoney(baseEnvelopes, {
      fromEnvelopeId: 'food',
      toEnvelopeId: 'food',
      amountCents: 1_000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('different');
  });

  it('fails when source envelope not found', () => {
    const result = moveMoney(baseEnvelopes, {
      fromEnvelopeId: 'nonexistent',
      toEnvelopeId: 'fun',
      amountCents: 1_000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Source');
  });

  it('fails when destination envelope not found', () => {
    const result = moveMoney(baseEnvelopes, {
      fromEnvelopeId: 'food',
      toEnvelopeId: 'nonexistent',
      amountCents: 1_000,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Destination');
  });

  it('fails when insufficient funds in source', () => {
    const result = moveMoney(baseEnvelopes, {
      fromEnvelopeId: 'food',
      toEnvelopeId: 'fun',
      amountCents: 50_000, // available is only 40_000
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient');
  });

  it('does not mutate the original envelopes', () => {
    const original = [...baseEnvelopes];
    moveMoney(baseEnvelopes, {
      fromEnvelopeId: 'food',
      toEnvelopeId: 'fun',
      amountCents: 5_000,
    });

    expect(baseEnvelopes[0].budgetedCents).toBe(original[0].budgetedCents);
    expect(baseEnvelopes[1].budgetedCents).toBe(original[1].budgetedCents);
  });

  it('allows moving exact available amount', () => {
    const result = moveMoney(baseEnvelopes, {
      fromEnvelopeId: 'food',
      toEnvelopeId: 'fun',
      amountCents: 40_000, // exactly available (60000 - 20000)
    });

    expect(result.success).toBe(true);
  });
});
