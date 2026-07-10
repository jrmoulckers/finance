// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildSavingsRateCardModel,
  buildSavingsRateDashboardSummary,
} from './savings-rate-summary';

describe('savings rate dashboard summary', () => {
  it('returns current, prior, and trailing three month savings rates', () => {
    const summary = buildSavingsRateDashboardSummary(
      [
        { month: '2026-01', incomeCents: 5000_00, expenseCents: 3000_00 },
        { month: '2026-02', incomeCents: 5000_00, expenseCents: 4000_00 },
        { month: '2026-03', incomeCents: 6000_00, expenseCents: 3000_00 },
      ],
      '2026-03',
    );

    expect(summary.current?.savingsRatePercent).toBe(50);
    expect(summary.prior?.savingsCents).toBe(1000_00);
    expect(summary.trailingThreeMonth?.incomeCents).toBe(16000_00);
    expect(summary.trailingThreeMonth?.savingsRatePercent).toBe(37.5);
  });
});

describe('buildSavingsRateCardModel', () => {
  const cardModel = (
    rows: readonly { month: string; incomeCents: number; expenseCents: number }[],
    currentMonth: string,
  ) => buildSavingsRateCardModel(buildSavingsRateDashboardSummary(rows, currentMonth));

  it('reports a positive savings rate with dollars saved', () => {
    const model = cardModel(
      [{ month: '2026-03', incomeCents: 6000_00, expenseCents: 3000_00 }],
      '2026-03',
    );

    expect(model.hasIncome).toBe(true);
    expect(model.savingsRatePercent).toBe(50);
    expect(model.savingsCents).toBe(3000_00);
    expect(model.tone).toBe('positive');
    expect(model.statusLabel).toContain('Strong');
  });

  it('returns N/A semantics (hasIncome false) when income is zero', () => {
    const model = cardModel(
      [{ month: '2026-03', incomeCents: 0, expenseCents: 1200_00 }],
      '2026-03',
    );

    expect(model.hasIncome).toBe(false);
    // Never NaN/Infinity — guarded to 0.
    expect(model.savingsRatePercent).toBe(0);
    expect(Number.isFinite(model.savingsRatePercent)).toBe(true);
    expect(model.deltaPercentagePoints).toBeNull();
    expect(model.trend).toBe('flat');
    expect(model.tone).toBe('neutral');
    expect(model.statusLabel).toContain('Add income');
  });

  it('reports a negative savings rate when overspending', () => {
    const model = cardModel(
      [{ month: '2026-03', incomeCents: 1000_00, expenseCents: 1200_00 }],
      '2026-03',
    );

    expect(model.savingsRatePercent).toBe(-20);
    expect(model.savingsCents).toBe(-200_00);
    expect(model.tone).toBe('caution');
    expect(model.statusLabel).toContain('Spending more than you earn');
  });

  it('computes an upward delta versus the prior period', () => {
    const model = cardModel(
      [
        { month: '2026-02', incomeCents: 5000_00, expenseCents: 4000_00 }, // 20%
        { month: '2026-03', incomeCents: 5000_00, expenseCents: 2500_00 }, // 50%
      ],
      '2026-03',
    );

    expect(model.priorSavingsRatePercent).toBe(20);
    expect(model.deltaPercentagePoints).toBe(30);
    expect(model.trend).toBe('up');
  });

  it('computes a downward delta versus the prior period', () => {
    const model = cardModel(
      [
        { month: '2026-02', incomeCents: 5000_00, expenseCents: 2500_00 }, // 50%
        { month: '2026-03', incomeCents: 5000_00, expenseCents: 4000_00 }, // 20%
      ],
      '2026-03',
    );

    expect(model.deltaPercentagePoints).toBe(-30);
    expect(model.trend).toBe('down');
  });

  it('treats an unchanged savings rate as a flat trend', () => {
    const model = cardModel(
      [
        { month: '2026-02', incomeCents: 5000_00, expenseCents: 4000_00 }, // 20%
        { month: '2026-03', incomeCents: 6000_00, expenseCents: 4800_00 }, // 20%
      ],
      '2026-03',
    );

    expect(model.deltaPercentagePoints).toBe(0);
    expect(model.trend).toBe('flat');
  });

  it('omits the delta when there is no comparable prior period', () => {
    const model = cardModel(
      [{ month: '2026-03', incomeCents: 5000_00, expenseCents: 4000_00 }],
      '2026-03',
    );

    expect(model.priorSavingsRatePercent).toBeNull();
    expect(model.deltaPercentagePoints).toBeNull();
    expect(model.trend).toBe('flat');
  });

  it('ignores a prior period that has no income', () => {
    const model = cardModel(
      [
        { month: '2026-02', incomeCents: 0, expenseCents: 1000_00 },
        { month: '2026-03', incomeCents: 5000_00, expenseCents: 4000_00 },
      ],
      '2026-03',
    );

    expect(model.priorSavingsRatePercent).toBeNull();
    expect(model.deltaPercentagePoints).toBeNull();
    expect(model.trend).toBe('flat');
  });

  it('classifies against a configurable target instead of a fixed 20% (#3327)', () => {
    // 50% saver with a 60% FIRE goal: below target, not "strong".
    const model = buildSavingsRateCardModel(
      buildSavingsRateDashboardSummary(
        [{ month: '2026-03', incomeCents: 6000_00, expenseCents: 3000_00 }],
        '2026-03',
      ),
      60,
    );
    expect(model.targetPercent).toBe(60);
    expect(model.meetsTarget).toBe(false);
    expect(model.statusLabel).toContain('60%');
    expect(model.statusLabel).toContain('Solid progress');
  });

  it('marks the target met when the rate reaches the goal (#3327)', () => {
    const model = buildSavingsRateCardModel(
      buildSavingsRateDashboardSummary(
        [{ month: '2026-03', incomeCents: 6000_00, expenseCents: 3000_00 }],
        '2026-03',
      ),
      40,
    );
    expect(model.meetsTarget).toBe(true);
    expect(model.statusLabel).toContain('at or above the 40% target');
  });

  it('defaults the target to 20% when none is supplied (#3327)', () => {
    const model = buildSavingsRateCardModel(
      buildSavingsRateDashboardSummary(
        [{ month: '2026-03', incomeCents: 5000_00, expenseCents: 4000_00 }],
        '2026-03',
      ),
    );
    expect(model.targetPercent).toBe(20);
    expect(model.meetsTarget).toBe(true);
    expect(model.statusLabel).toContain('20%');
  });
});
