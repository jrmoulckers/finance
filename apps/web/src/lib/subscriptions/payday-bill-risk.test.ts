// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildPaydayBillTimeline } from './payday-bill-risk';

describe('payday bill risk', () => {
  it('identifies bills due before the next payday including one-off family expenses', () => {
    const timeline = buildPaydayBillTimeline({
      asOfDate: '2026-03-01',
      openingCashCents: 20_000,
      incomeEvents: [{ id: 'pay-1', label: 'Payday', date: '2026-03-08', amountCents: 100_000, confidence: 'expected' }],
      items: [
        { id: 'rent', label: 'Rent', dueDate: '2026-03-03', amountCents: 90_000, kind: 'recurring-bill' },
        { id: 'field-trip', label: 'Field trip', dueDate: '2026-03-05', amountCents: 2_500, kind: 'one-off-family-expense' },
        { id: 'utility', label: 'Utility', dueDate: '2026-03-10', amountCents: 15_000, kind: 'recurring-bill' },
      ],
    });

    expect(timeline.nextPayDate).toBe('2026-03-08');
    expect(timeline.dueBeforeNextPaycheck.map((item) => item.id)).toEqual(['rent', 'field-trip']);
    expect(timeline.weeks[0].risk).toBe('high');
    expect(timeline.weeks[0].accessibleLabel).toContain('high risk');
  });
});
