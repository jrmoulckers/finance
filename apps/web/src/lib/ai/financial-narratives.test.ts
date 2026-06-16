// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { generateFinancialNarrative } from './financial-narratives';

describe('generateFinancialNarrative', () => {
  it('orders narrative claims by impact and links to anchors', () => {
    const narrative = generateFinancialNarrative({
      periodLabel: 'April',
      totalIncomeCents: 500_000,
      totalExpenseCents: 350_000,
      previousIncomeCents: 450_000,
      previousExpenseCents: 250_000,
      historyMonths: 8,
      categories: [{ id: 'food', name: 'Food', amountCents: 120_000, previousAmountCents: 40_000 }],
      merchants: [{ name: 'Grocery', amountCents: 90_000, previousAmountCents: 30_000 }],
    });

    expect(narrative.dataQuality).toBe('high');
    expect(narrative.claims[0].importance).toBeGreaterThanOrEqual(narrative.claims[1].importance);
    expect(narrative.claims.map((claim) => claim.anchor)).toContain('categories');
  });

  it('uses low-data copy when history is sparse', () => {
    const narrative = generateFinancialNarrative({
      periodLabel: 'April',
      totalIncomeCents: 100_000,
      totalExpenseCents: 90_000,
      historyMonths: 1,
    });

    expect(narrative.dataQuality).toBe('low');
    expect(narrative.summary).toContain('limited history');
  });

  it('formats dollar amounts deterministically', () => {
    const narrative = generateFinancialNarrative({
      periodLabel: 'April',
      totalIncomeCents: 500_000,
      totalExpenseCents: 350_000,
      previousIncomeCents: 500_000,
      previousExpenseCents: 300_000,
      historyMonths: 6,
    });

    expect(narrative.summary).toMatch(/\$1,?50?0?|\$150/);
    expect(narrative.claims[0].text).toContain('$');
  });
});
