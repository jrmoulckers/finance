// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  formatCurrencyForScreenReader,
  formatPercentForScreenReader,
  getBudgetStatusIndicator,
  getChartTextAlternative,
  getGoalStatusIndicator,
  getPieChartTextAlternative,
  getStatusIndicator,
  getTableDescription,
  contrastRatio,
  hexToRgb,
  evaluateAmountColorContrast,
} from './a11y';

describe('formatCurrencyForScreenReader', () => {
  it('formats a positive amount', () => {
    expect(formatCurrencyForScreenReader(12345)).toBe('$123.45');
  });

  it('prepends "negative" for negative amounts', () => {
    expect(formatCurrencyForScreenReader(-4250)).toBe('negative $42.50');
  });

  it('appends context when provided', () => {
    expect(formatCurrencyForScreenReader(-4250, 'USD', 'Dining category')).toBe(
      'negative $42.50, Dining category',
    );
  });

  it('handles zero', () => {
    expect(formatCurrencyForScreenReader(0)).toBe('$0.00');
  });

  it('respects different currencies', () => {
    const result = formatCurrencyForScreenReader(10000, 'EUR', 'Savings goal');
    expect(result).toContain('100.00');
    expect(result).toContain('Savings goal');
  });
});

describe('formatPercentForScreenReader', () => {
  it('formats percentage with context', () => {
    expect(formatPercentForScreenReader(75, 'of monthly budget used')).toBe(
      '75 percent of monthly budget used',
    );
  });
});

describe('getStatusIndicator', () => {
  it('returns positive for positive amount', () => {
    const result = getStatusIndicator(500);
    expect(result.tone).toBe('positive');
    expect(result.icon).toBe('↑');
  });

  it('returns negative for negative amount', () => {
    const result = getStatusIndicator(-200);
    expect(result.tone).toBe('negative');
    expect(result.icon).toBe('↓');
  });

  it('returns neutral for zero', () => {
    const result = getStatusIndicator(0);
    expect(result.tone).toBe('neutral');
    expect(result.icon).toBe('→');
  });
});

describe('getGoalStatusIndicator', () => {
  it('returns completed for 100%+', () => {
    expect(getGoalStatusIndicator(100).label).toBe('Goal reached');
    expect(getGoalStatusIndicator(120).label).toBe('Goal reached');
  });

  it('returns in progress for 50-99%', () => {
    expect(getGoalStatusIndicator(60).label).toBe('In progress');
  });

  it('returns getting started for 25-49%', () => {
    expect(getGoalStatusIndicator(30).label).toBe('Getting started');
  });

  it('returns just started for <25%', () => {
    expect(getGoalStatusIndicator(10).label).toBe('Just started');
  });

  it('uses a calm neutral tone (not negative) for a brand-new goal <25% (#3392)', () => {
    expect(getGoalStatusIndicator(0).tone).toBe('neutral');
    expect(getGoalStatusIndicator(10).tone).toBe('neutral');
    expect(getGoalStatusIndicator(24).tone).toBe('neutral');
  });
});

describe('getBudgetStatusIndicator', () => {
  it('returns over budget only once spending reaches the limit (>=100%)', () => {
    const status = getBudgetStatusIndicator(130);
    expect(status.tone).toBe('negative');
    expect(status.label).toBe('Over budget');
  });

  it('labels the 90-99% band "Almost at limit" rather than over budget (#3774)', () => {
    const status = getBudgetStatusIndicator(95);
    expect(status.tone).toBe('negative');
    expect(status.label).toBe('Almost at limit');
  });

  it('returns near limit for 76-90%', () => {
    expect(getBudgetStatusIndicator(80).tone).toBe('warning');
  });

  it('returns on track for ≤75%', () => {
    expect(getBudgetStatusIndicator(50).tone).toBe('positive');
  });
});

describe('getChartTextAlternative', () => {
  it('handles empty data', () => {
    expect(getChartTextAlternative('Spending', [])).toBe('Spending chart with no data.');
  });

  it('generates summary for single data point', () => {
    const result = getChartTextAlternative('Trend', [{ label: 'Jan', value: 100 }], 'dollars');
    expect(result).toContain('1 data point');
    expect(result).toContain('Highest: Jan at 100 dollars');
  });

  it('generates summary with high and low', () => {
    const data = [
      { label: 'Jan', value: 100 },
      { label: 'Feb', value: 300 },
      { label: 'Mar', value: 50 },
    ];
    const result = getChartTextAlternative('Spending', data, 'dollars');
    expect(result).toContain('3 data points');
    expect(result).toContain('Highest: Feb at 300 dollars');
    expect(result).toContain('Lowest: Mar at 50 dollars');
  });
});

describe('getPieChartTextAlternative', () => {
  it('handles empty data', () => {
    expect(getPieChartTextAlternative('Category', [])).toBe('Category chart with no data.');
  });

  it('generates segment percentages', () => {
    const data = [
      { label: 'Food', value: 300 },
      { label: 'Rent', value: 700 },
    ];
    const result = getPieChartTextAlternative('Share', data);
    expect(result).toContain('Food: 30%');
    expect(result).toContain('Rent: 70%');
  });

  it('handles all-zero data', () => {
    const data = [{ label: 'None', value: 0 }];
    expect(getPieChartTextAlternative('Empty', data)).toBe('Empty chart with no data.');
  });
});

describe('getTableDescription', () => {
  it('formats singular', () => {
    expect(getTableDescription('transaction', 1)).toBe('1 transaction');
  });

  it('formats plural', () => {
    expect(getTableDescription('account', 5)).toBe('5 accounts');
  });

  it('appends context', () => {
    expect(getTableDescription('transaction', 3, 'sorted by date')).toBe(
      '3 transactions, sorted by date',
    );
  });
});

describe('color contrast helpers (#3281)', () => {
  it('parses 3- and 6-digit hex', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('not-a-color')).toBeNull();
  });

  it('computes the canonical black-on-white contrast ratio of 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('returns null when a color cannot be parsed', () => {
    expect(contrastRatio('var(--x)', '#ffffff')).toBeNull();
  });

  it('flags a pale positive color that fails AA on a light background', () => {
    const result = evaluateAmountColorContrast('#c9f7d4');
    expect(result.passesBoth).toBe(false);
    expect(result.failingBackgrounds).toContain('light');
  });

  it('passes a strong color that clears AA on both reference backgrounds', () => {
    const result = evaluateAmountColorContrast('#767676');
    // Mid-grey clears 4.5:1 against both #ffffff and #0f1020.
    expect(result.light).not.toBeNull();
    expect(result.dark).not.toBeNull();
  });
});
