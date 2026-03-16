// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  CHART_COLORS,
  CHART_COLOR_LABELS,
  chartColor,
  patternId,
  formatChartCurrency,
  buildChartDescription,
} from './chart-palette';

// ---------------------------------------------------------------------------
// CHART_COLORS
// ---------------------------------------------------------------------------

describe('CHART_COLORS', () => {
  it('has at least 6 colour entries for category variety', () => {
    expect(CHART_COLORS.length).toBeGreaterThanOrEqual(6);
  });

  it('contains valid hex colour strings', () => {
    for (const color of CHART_COLORS) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('has a matching CHART_COLOR_LABELS array of equal length', () => {
    expect(CHART_COLOR_LABELS.length).toBe(CHART_COLORS.length);
  });

  it('contains no duplicate colours', () => {
    const unique = new Set(CHART_COLORS);
    expect(unique.size).toBe(CHART_COLORS.length);
  });
});

// ---------------------------------------------------------------------------
// chartColor
// ---------------------------------------------------------------------------

describe('chartColor', () => {
  it('returns the colour at the given index', () => {
    expect(chartColor(0)).toBe(CHART_COLORS[0]);
    expect(chartColor(2)).toBe(CHART_COLORS[2]);
  });

  it('wraps around when index exceeds array length', () => {
    expect(chartColor(CHART_COLORS.length)).toBe(CHART_COLORS[0]);
    expect(chartColor(CHART_COLORS.length + 1)).toBe(CHART_COLORS[1]);
  });
});

// ---------------------------------------------------------------------------
// patternId
// ---------------------------------------------------------------------------

describe('patternId', () => {
  it('returns a prefixed pattern ID string', () => {
    expect(patternId(0)).toBe('chart-pattern-0');
    expect(patternId(5)).toBe('chart-pattern-5');
  });
});

// ---------------------------------------------------------------------------
// formatChartCurrency
// ---------------------------------------------------------------------------

describe('formatChartCurrency', () => {
  it('formats USD with no decimal places', () => {
    expect(formatChartCurrency(1234, 'USD')).toBe('$1,234');
  });

  it('formats zero correctly', () => {
    expect(formatChartCurrency(0, 'USD')).toBe('$0');
  });

  it('formats negative values', () => {
    const result = formatChartCurrency(-500, 'USD');
    expect(result).toContain('500');
  });

  it('defaults to USD when currency is omitted', () => {
    expect(formatChartCurrency(100)).toBe('$100');
  });

  it('formats EUR with the euro symbol', () => {
    const result = formatChartCurrency(1000, 'EUR');
    expect(result).toContain('€');
    expect(result).toContain('1,000');
  });

  it('respects a custom locale', () => {
    const result = formatChartCurrency(1000, 'EUR', 'de-DE');
    // German locale uses period or narrow-no-break space as thousands separator
    expect(result).toContain('€');
  });
});

// ---------------------------------------------------------------------------
// buildChartDescription
// ---------------------------------------------------------------------------

describe('buildChartDescription', () => {
  it('returns no-data description for an empty array', () => {
    expect(buildChartDescription('Bar chart', [])).toBe('Bar chart with no data.');
  });

  it('includes chart type, category count, and formatted total', () => {
    const desc = buildChartDescription('Pie chart', [
      { label: 'Food', value: 200 },
      { label: 'Rent', value: 800 },
    ]);
    expect(desc).toContain('Pie chart');
    expect(desc).toContain('2 categories');
    expect(desc).toContain('$1,000');
  });

  it('lists each category with its formatted value', () => {
    const desc = buildChartDescription(
      'Bar chart',
      [
        { label: 'Food', value: 50 },
        { label: 'Transport', value: 150 },
      ],
      'USD',
    );
    expect(desc).toContain('Food: $50');
    expect(desc).toContain('Transport: $150');
  });

  it('handles a single-item array', () => {
    const desc = buildChartDescription('Donut chart', [{ label: 'Savings', value: 3000 }]);
    expect(desc).toContain('1 categories');
    expect(desc).toContain('$3,000');
    expect(desc).toContain('Savings: $3,000');
  });
});
