// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { generateCoachingNudges } from './coaching-nudges';

describe('generateCoachingNudges', () => {
  it('ranks urgent cash-flow nudges ahead of lower priority nudges', () => {
    const nudges = generateCoachingNudges({
      totalIncomeCents: 300_000,
      totalSpendingCents: 340_000,
      savingsRatePercent: -13,
      projectedCashFlowCents: -40_000,
      categories: [{ id: 'dining', name: 'Dining', amountCents: 80_000, budgetCents: 50_000 }],
    });

    expect(nudges[0].id).toBe('protect-cash-flow');
    expect(nudges[0].rationale).not.toMatch(/shame|bad|failed/i);
  });

  it('deduplicates and suppresses dismissed nudges', () => {
    const nudges = generateCoachingNudges({
      totalIncomeCents: 300_000,
      totalSpendingCents: 340_000,
      savingsRatePercent: -13,
      projectedCashFlowCents: -40_000,
      asOfDate: '2025-02-01',
      dismissedNudges: [{ id: 'protect-cash-flow', until: '2025-03-01' }],
    });

    expect(nudges.some((nudge) => nudge.id === 'protect-cash-flow')).toBe(false);
  });

  it('uses celebratory tone for positive reinforcement', () => {
    const nudges = generateCoachingNudges({
      totalIncomeCents: 500_000,
      totalSpendingCents: 300_000,
      savingsRatePercent: 40,
    });

    expect(nudges.find((nudge) => nudge.id === 'reinforce-savings-momentum')?.tone).toBe(
      'celebratory',
    );
  });

  it('honors quiet periods', () => {
    const nudges = generateCoachingNudges({
      totalIncomeCents: 100_000,
      totalSpendingCents: 130_000,
      savingsRatePercent: -30,
      quietUntil: '2025-06-01',
      asOfDate: '2025-05-01',
    });

    expect(nudges).toEqual([]);
  });
});
