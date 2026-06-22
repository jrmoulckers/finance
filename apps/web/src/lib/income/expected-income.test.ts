// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  CONFIDENCE_WEIGHTS,
  confidenceWeight,
  isOverdue,
  sortExpectedIncome,
  summarizeExpectedIncome,
  type ConfidenceLevel,
  type ExpectedIncomeItem,
} from './expected-income';

const REFERENCE = '2026-06-15';

function item(overrides: Partial<ExpectedIncomeItem> = {}): ExpectedIncomeItem {
  return {
    id: overrides.id ?? 'item-1',
    label: overrides.label ?? 'Child support — June',
    amountCents: overrides.amountCents ?? 50_000,
    expectedDate: overrides.expectedDate ?? '2026-06-20',
    confidence: overrides.confidence ?? 'high',
    cleared: overrides.cleared ?? false,
  };
}

describe('confidenceWeight', () => {
  it('maps each level to its configured weight', () => {
    expect(confidenceWeight('high')).toBe(CONFIDENCE_WEIGHTS.high);
    expect(confidenceWeight('medium')).toBe(CONFIDENCE_WEIGHTS.medium);
    expect(confidenceWeight('low')).toBe(CONFIDENCE_WEIGHTS.low);
  });

  it('falls back to the low weight for unknown levels', () => {
    expect(confidenceWeight('unknown' as ConfidenceLevel)).toBe(CONFIDENCE_WEIGHTS.low);
  });
});

describe('isOverdue', () => {
  it('flags pending items before the reference date', () => {
    expect(isOverdue(item({ expectedDate: '2026-06-10', cleared: false }), REFERENCE)).toBe(true);
  });

  it('does not flag items expected exactly on the reference date', () => {
    expect(isOverdue(item({ expectedDate: REFERENCE, cleared: false }), REFERENCE)).toBe(false);
  });

  it('does not flag future items', () => {
    expect(isOverdue(item({ expectedDate: '2026-06-30', cleared: false }), REFERENCE)).toBe(false);
  });

  it('never flags cleared items even if the date passed', () => {
    expect(isOverdue(item({ expectedDate: '2026-06-01', cleared: true }), REFERENCE)).toBe(false);
  });

  it('treats unparseable dates as not overdue', () => {
    expect(isOverdue(item({ expectedDate: 'not-a-date', cleared: false }), REFERENCE)).toBe(false);
  });
});

describe('summarizeExpectedIncome', () => {
  it('returns an all-zero summary for an empty list', () => {
    const summary = summarizeExpectedIncome([], REFERENCE);
    expect(summary).toEqual({
      totalCount: 0,
      clearedCount: 0,
      pendingCount: 0,
      overdueCount: 0,
      realizedCents: 0,
      expectedNotYetReceivedCents: 0,
      confidenceWeightedExpectedCents: 0,
      overdueCents: 0,
      plannedTotalCents: 0,
      plannedConfidenceAdjustedCents: 0,
    });
  });

  it('keeps realized cash separate from expected money', () => {
    const summary = summarizeExpectedIncome(
      [
        item({ id: 'a', amountCents: 30_000, cleared: true }),
        item({ id: 'b', amountCents: 50_000, cleared: false, expectedDate: '2026-06-25' }),
      ],
      REFERENCE,
    );

    // Spendable now is ONLY the cleared item.
    expect(summary.realizedCents).toBe(30_000);
    // Expected money is reported on its own.
    expect(summary.expectedNotYetReceivedCents).toBe(50_000);
    // Planned including expected combines both.
    expect(summary.plannedTotalCents).toBe(80_000);
    expect(summary.clearedCount).toBe(1);
    expect(summary.pendingCount).toBe(1);
    expect(summary.totalCount).toBe(2);
  });

  it('never counts expected-but-uncleared money as realized', () => {
    const summary = summarizeExpectedIncome(
      [item({ amountCents: 100_000, cleared: false })],
      REFERENCE,
    );
    expect(summary.realizedCents).toBe(0);
    expect(summary.expectedNotYetReceivedCents).toBe(100_000);
  });

  it('weights expected money by confidence and rounds to whole cents', () => {
    const summary = summarizeExpectedIncome(
      [
        item({ id: 'high', amountCents: 100_000, confidence: 'high', cleared: false }),
        item({ id: 'medium', amountCents: 100_000, confidence: 'medium', cleared: false }),
        item({ id: 'low', amountCents: 100_000, confidence: 'low', cleared: false }),
      ],
      '2026-07-01',
    );

    // 100000*1 + 100000*0.6 + 100000*0.3 = 100000 + 60000 + 30000
    expect(summary.confidenceWeightedExpectedCents).toBe(190_000);
    expect(summary.expectedNotYetReceivedCents).toBe(300_000);
  });

  it('rounds fractional confidence weights deterministically', () => {
    // 12345 * 0.6 = 7407 exactly; 12345 * 0.3 = 3703.5 -> 3704 (half away from zero)
    const summary = summarizeExpectedIncome(
      [
        item({ id: 'm', amountCents: 12_345, confidence: 'medium', cleared: false }),
        item({ id: 'l', amountCents: 12_345, confidence: 'low', cleared: false }),
      ],
      '2026-07-01',
    );
    expect(summary.confidenceWeightedExpectedCents).toBe(7_407 + 3_704);
  });

  it('counts and totals overdue pending items', () => {
    const summary = summarizeExpectedIncome(
      [
        item({ id: 'late1', amountCents: 40_000, expectedDate: '2026-06-01', cleared: false }),
        item({ id: 'late2', amountCents: 25_000, expectedDate: '2026-06-10', cleared: false }),
        item({ id: 'future', amountCents: 60_000, expectedDate: '2026-06-30', cleared: false }),
        item({ id: 'paid', amountCents: 99_000, expectedDate: '2026-05-01', cleared: true }),
      ],
      REFERENCE,
    );

    expect(summary.overdueCount).toBe(2);
    expect(summary.overdueCents).toBe(65_000);
    // Cleared past-due item is realized, not overdue.
    expect(summary.realizedCents).toBe(99_000);
  });

  it('handles an all-cleared list (everything realized, nothing expected)', () => {
    const summary = summarizeExpectedIncome(
      [
        item({ id: 'a', amountCents: 20_000, cleared: true }),
        item({ id: 'b', amountCents: 35_000, cleared: true }),
      ],
      REFERENCE,
    );
    expect(summary.realizedCents).toBe(55_000);
    expect(summary.expectedNotYetReceivedCents).toBe(0);
    expect(summary.confidenceWeightedExpectedCents).toBe(0);
    expect(summary.overdueCount).toBe(0);
    expect(summary.plannedTotalCents).toBe(55_000);
    expect(summary.plannedConfidenceAdjustedCents).toBe(55_000);
  });

  it('handles an all-pending list (nothing realized)', () => {
    const summary = summarizeExpectedIncome(
      [
        item({ id: 'a', amountCents: 20_000, confidence: 'high', cleared: false }),
        item({ id: 'b', amountCents: 40_000, confidence: 'medium', cleared: false }),
      ],
      '2026-07-01',
    );
    expect(summary.realizedCents).toBe(0);
    expect(summary.expectedNotYetReceivedCents).toBe(60_000);
    expect(summary.confidenceWeightedExpectedCents).toBe(20_000 + 24_000);
    expect(summary.plannedTotalCents).toBe(60_000);
    expect(summary.plannedConfidenceAdjustedCents).toBe(44_000);
  });

  it('computes the conservative planned total from realized plus weighted expected', () => {
    const summary = summarizeExpectedIncome(
      [
        item({ id: 'cleared', amountCents: 30_000, cleared: true }),
        item({ id: 'pending', amountCents: 50_000, confidence: 'low', cleared: false }),
      ],
      '2026-07-01',
    );
    expect(summary.plannedTotalCents).toBe(80_000); // 30k + 50k full expected
    expect(summary.plannedConfidenceAdjustedCents).toBe(30_000 + 15_000); // 30k + 50k*0.3
  });

  it('treats non-finite amounts as zero', () => {
    const summary = summarizeExpectedIncome(
      [item({ amountCents: Number.NaN, cleared: false })],
      REFERENCE,
    );
    expect(summary.expectedNotYetReceivedCents).toBe(0);
    expect(summary.confidenceWeightedExpectedCents).toBe(0);
  });

  it('is deterministic for the same inputs', () => {
    const items = [
      item({ id: 'a', amountCents: 12_300, cleared: true }),
      item({ id: 'b', amountCents: 45_600, confidence: 'medium', cleared: false }),
    ];
    expect(summarizeExpectedIncome(items, REFERENCE)).toEqual(
      summarizeExpectedIncome(items, REFERENCE),
    );
  });
});

describe('sortExpectedIncome', () => {
  it('orders overdue items first, then by soonest date, then label', () => {
    const items = [
      item({ id: 'future', label: 'Future', expectedDate: '2026-06-30', cleared: false }),
      item({ id: 'late-b', label: 'Bravo late', expectedDate: '2026-06-05', cleared: false }),
      item({ id: 'late-a', label: 'Alpha late', expectedDate: '2026-06-05', cleared: false }),
      item({ id: 'cleared', label: 'Cleared', expectedDate: '2026-06-01', cleared: true }),
    ];

    const sorted = sortExpectedIncome(items, REFERENCE);
    expect(sorted.map((entry) => entry.id)).toEqual(['late-a', 'late-b', 'cleared', 'future']);
  });

  it('does not mutate the input array', () => {
    const items = [
      item({ id: 'b', expectedDate: '2026-06-30' }),
      item({ id: 'a', expectedDate: '2026-06-01', cleared: false }),
    ];
    const snapshot = items.map((entry) => entry.id);
    sortExpectedIncome(items, REFERENCE);
    expect(items.map((entry) => entry.id)).toEqual(snapshot);
  });
});
