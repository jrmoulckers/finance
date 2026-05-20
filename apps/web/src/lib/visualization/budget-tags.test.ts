// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for values-based budget tagging and alignment engine.
 *
 * References: issue #1564
 */

import { describe, it, expect } from 'vitest';
import {
  bankersRound,
  safePercent,
  assignTag,
  assignTagsByCategory,
  computeTagBreakdown,
  computeAlignment,
  computeAlignmentTrend,
  detectMisalignmentAlerts,
} from './budget-tags';
import type { TaggedTransaction, ValueTarget } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(
  tag: string,
  amountCents: number,
  date: string = '2024-01-15',
  categoryId: string | null = null,
): TaggedTransaction {
  return {
    transactionId: crypto.randomUUID(),
    tag,
    amountCents,
    categoryId,
    date,
  };
}

// ---------------------------------------------------------------------------
// bankersRound
// ---------------------------------------------------------------------------

describe('bankersRound', () => {
  it('rounds 2.5 to 2 (even)', () => {
    expect(bankersRound(2.5)).toBe(2);
  });

  it('rounds 3.5 to 4 (even)', () => {
    expect(bankersRound(3.5)).toBe(4);
  });

  it('rounds 2.4 down', () => {
    expect(bankersRound(2.4)).toBe(2);
  });

  it('rounds 2.6 up', () => {
    expect(bankersRound(2.6)).toBe(3);
  });

  it('handles zero', () => {
    expect(bankersRound(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(bankersRound(-2.6)).toBe(-3);
  });

  it('returns 0 for NaN', () => {
    expect(bankersRound(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(bankersRound(Infinity)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// safePercent
// ---------------------------------------------------------------------------

describe('safePercent', () => {
  it('computes correct percentage', () => {
    expect(safePercent(2500, 10000)).toBe(25);
  });

  it('returns 0 when total is zero', () => {
    expect(safePercent(100, 0)).toBe(0);
  });

  it('handles 100%', () => {
    expect(safePercent(5000, 5000)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// assignTag
// ---------------------------------------------------------------------------

describe('assignTag', () => {
  it('creates a TaggedTransaction with absolute amount', () => {
    const result = assignTag('tx-1', 'NEEDS', -5000, 'cat-1', '2024-03-01');
    expect(result).toEqual({
      transactionId: 'tx-1',
      tag: 'NEEDS',
      amountCents: 5000,
      categoryId: 'cat-1',
      date: '2024-03-01',
    });
  });

  it('preserves positive amounts', () => {
    const result = assignTag('tx-2', 'WANTS', 3000, null, '2024-03-01');
    expect(result.amountCents).toBe(3000);
  });
});

// ---------------------------------------------------------------------------
// assignTagsByCategory
// ---------------------------------------------------------------------------

describe('assignTagsByCategory', () => {
  it('assigns tags based on category mapping', () => {
    const txs = [
      { transactionId: '1', amountCents: 100, categoryId: 'rent', date: '2024-01-01' },
      { transactionId: '2', amountCents: 200, categoryId: 'dining', date: '2024-01-02' },
      { transactionId: '3', amountCents: 300, categoryId: null, date: '2024-01-03' },
    ];
    const map = { rent: 'NEEDS', dining: 'WANTS' };
    const result = assignTagsByCategory(txs, map, 'WANTS');

    expect(result[0].tag).toBe('NEEDS');
    expect(result[1].tag).toBe('WANTS');
    expect(result[2].tag).toBe('WANTS'); // default
  });

  it('uses default for unmapped categories', () => {
    const txs = [
      { transactionId: '1', amountCents: 100, categoryId: 'unknown', date: '2024-01-01' },
    ];
    const result = assignTagsByCategory(txs, {}, 'SAVINGS');
    expect(result[0].tag).toBe('SAVINGS');
  });
});

// ---------------------------------------------------------------------------
// computeTagBreakdown
// ---------------------------------------------------------------------------

describe('computeTagBreakdown', () => {
  it('returns empty for no transactions', () => {
    expect(computeTagBreakdown([])).toEqual([]);
  });

  it('computes correct breakdown', () => {
    const txs = [makeTx('NEEDS', 5000), makeTx('NEEDS', 3000), makeTx('WANTS', 2000)];
    const result = computeTagBreakdown(txs);

    expect(result).toHaveLength(2);
    expect(result[0].tag).toBe('NEEDS');
    expect(result[0].totalCents).toBe(8000);
    expect(result[0].percent).toBe(80);
    expect(result[0].count).toBe(2);
    expect(result[1].tag).toBe('WANTS');
    expect(result[1].totalCents).toBe(2000);
    expect(result[1].percent).toBe(20);
  });

  it('sorts by totalCents descending', () => {
    const txs = [makeTx('A', 100), makeTx('B', 500), makeTx('C', 300)];
    const result = computeTagBreakdown(txs);
    expect(result.map((r) => r.tag)).toEqual(['B', 'C', 'A']);
  });
});

// ---------------------------------------------------------------------------
// computeAlignment
// ---------------------------------------------------------------------------

describe('computeAlignment', () => {
  const targets: ValueTarget[] = [
    { tag: 'NEEDS', targetPercent: 50 },
    { tag: 'WANTS', targetPercent: 30 },
    { tag: 'SAVINGS', targetPercent: 20 },
  ];

  it('returns perfect score when aligned', () => {
    const txs = [makeTx('NEEDS', 5000), makeTx('WANTS', 3000), makeTx('SAVINGS', 2000)];
    const result = computeAlignment(txs, targets);

    expect(result.score).toBe(100);
    expect(result.totalSpendingCents).toBe(10000);
    expect(result.alignments).toHaveLength(3);
    for (const a of result.alignments) {
      expect(a.isMisaligned).toBe(false);
    }
  });

  it('detects misalignment above threshold', () => {
    const txs = [makeTx('NEEDS', 8000), makeTx('WANTS', 1000), makeTx('SAVINGS', 1000)];
    const result = computeAlignment(txs, targets);

    expect(result.score).toBeLessThan(100);
    const needsAlign = result.alignments.find((a) => a.tag === 'NEEDS');
    expect(needsAlign?.isMisaligned).toBe(true);
    expect(needsAlign?.deviationPercent).toBeGreaterThan(10);
  });

  it('handles empty transactions', () => {
    const result = computeAlignment([], targets);
    // With no spending, all actuals are 0% — deviation equals target percentages
    expect(result.score).toBeLessThan(100);
    expect(result.totalSpendingCents).toBe(0);
    expect(result.alignments).toHaveLength(3);
  });

  it('clamps score to 0-100', () => {
    // Extreme misalignment
    const txs = [makeTx('NEEDS', 10000)];
    const result = computeAlignment(txs, targets);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// computeAlignmentTrend
// ---------------------------------------------------------------------------

describe('computeAlignmentTrend', () => {
  const targets: ValueTarget[] = [
    { tag: 'NEEDS', targetPercent: 50 },
    { tag: 'WANTS', targetPercent: 50 },
  ];

  it('returns empty for no data', () => {
    expect(computeAlignmentTrend([], targets)).toEqual([]);
  });

  it('produces one point per month', () => {
    const txs = [
      makeTx('NEEDS', 5000, '2024-01-15'),
      makeTx('WANTS', 5000, '2024-01-20'),
      makeTx('NEEDS', 3000, '2024-02-10'),
      makeTx('WANTS', 7000, '2024-02-15'),
    ];
    const result = computeAlignmentTrend(txs, targets);

    expect(result).toHaveLength(2);
    expect(result[0].period).toBe('2024-01');
    expect(result[1].period).toBe('2024-02');
    expect(result[0].score).toBe(100); // 50/50 split
  });

  it('sorts chronologically', () => {
    const txs = [makeTx('NEEDS', 1000, '2024-03-01'), makeTx('NEEDS', 1000, '2024-01-01')];
    const result = computeAlignmentTrend(txs, targets);
    expect(result[0].period).toBe('2024-01');
    expect(result[1].period).toBe('2024-03');
  });
});

// ---------------------------------------------------------------------------
// detectMisalignmentAlerts
// ---------------------------------------------------------------------------

describe('detectMisalignmentAlerts', () => {
  it('returns empty when aligned', () => {
    const txs = [makeTx('NEEDS', 5000), makeTx('WANTS', 5000)];
    const targets: ValueTarget[] = [
      { tag: 'NEEDS', targetPercent: 50 },
      { tag: 'WANTS', targetPercent: 50 },
    ];
    const alignment = computeAlignment(txs, targets);
    const alerts = detectMisalignmentAlerts(alignment);
    expect(alerts).toHaveLength(0);
  });

  it('generates warning for moderate deviation', () => {
    const txs = [makeTx('NEEDS', 7000), makeTx('WANTS', 3000)];
    const targets: ValueTarget[] = [
      { tag: 'NEEDS', targetPercent: 50 },
      { tag: 'WANTS', targetPercent: 50 },
    ];
    const alignment = computeAlignment(txs, targets);
    const alerts = detectMisalignmentAlerts(alignment);

    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].severity).toBe('warning');
  });

  it('generates critical for extreme deviation', () => {
    const txs = [makeTx('NEEDS', 9000), makeTx('WANTS', 1000)];
    const targets: ValueTarget[] = [
      { tag: 'NEEDS', targetPercent: 50 },
      { tag: 'WANTS', targetPercent: 50 },
    ];
    const alignment = computeAlignment(txs, targets);
    const alerts = detectMisalignmentAlerts(alignment);

    const critical = alerts.filter((a) => a.severity === 'critical');
    expect(critical.length).toBeGreaterThan(0);
  });

  it('sorts critical before warning', () => {
    const txs = [makeTx('A', 9000), makeTx('B', 500), makeTx('C', 500)];
    const targets: ValueTarget[] = [
      { tag: 'A', targetPercent: 33 },
      { tag: 'B', targetPercent: 33 },
      { tag: 'C', targetPercent: 34 },
    ];
    const alignment = computeAlignment(txs, targets);
    const alerts = detectMisalignmentAlerts(alignment);

    if (alerts.length > 1) {
      const severities = alerts.map((a) => a.severity);
      const critIdx = severities.indexOf('critical');
      const warnIdx = severities.indexOf('warning');
      if (critIdx >= 0 && warnIdx >= 0) {
        expect(critIdx).toBeLessThan(warnIdx);
      }
    }
  });
});
