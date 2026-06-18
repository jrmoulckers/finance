// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildWeddingPlanSummary } from './wedding-planner-rules';

describe('wedding planner shared rules', () => {
  it('calculates remaining balance, guest-sensitive estimates, and upcoming dues for a $35k scenario', () => {
    const summary = buildWeddingPlanSummary(
      [
        {
          id: 'venue',
          name: 'Venue',
          contractedCents: 18000_00,
          paidCents: 5000_00,
          nextDueDate: '2026-06-01',
        },
        {
          id: 'catering',
          name: 'Catering',
          contractedCents: 4000_00,
          paidCents: 1000_00,
          nextDueDate: '2026-05-20',
          perGuestCents: 75_00,
        },
        {
          id: 'photo',
          name: 'Photo',
          contractedCents: 6000_00,
          paidCents: 6000_00,
          nextDueDate: null,
        },
      ],
      80,
      35000_00,
      '2026-05-10',
    );
    expect(summary.estimatedTotalCents).toBe(34000_00);
    expect(summary.remainingBalanceCents).toBe(22000_00);
    expect(summary.overBudgetCents).toBe(0);
    expect(summary.upcomingDue.map((item) => item.vendorId)).toEqual(['catering', 'venue']);
  });
});
