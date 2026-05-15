// SPDX-License-Identifier: BUSL-1.1

/**
 * Color-blind safe chart palette and shared chart utilities.
 * Uses the IBM Design Language CVD-safe palette from design tokens.
 * @module components/charts/chart-palette
 */

import { formatChartCurrency } from '../../lib/currency';

/**
 * Re-export the centralized chart currency formatter so that existing
 * imports from this module continue to work without changes.
 */
export { formatChartCurrency };

/**
 * Hardcoded hex fallbacks for the IBM CVD-safe chart palette.
 * Used when CSS custom properties are unavailable (tests, SSR, canvas export).
 */
export const CHART_COLORS_HEX = [
  '#648FFF', // blue
  '#FE6100', // orange
  '#785EF0', // purple
  '#FFB000', // gold
  '#DC267F', // magenta
  '#009E73', // teal
] as const;

/**
 * Chart colors routed through CSS custom properties from the design token system.
 * Each entry references a `--color-chart-N` variable with a hex fallback so charts
 * adapt when the token values change (e.g. future theme overrides or high-contrast
 * palettes). The order is intentionally interleaved warm/cool for maximum visual
 * contrast between adjacent series.
 */
export const CHART_COLORS = [
  'var(--color-chart-1, #648FFF)', // blue
  'var(--color-chart-4, #FE6100)', // orange
  'var(--color-chart-2, #785EF0)', // purple
  'var(--color-chart-5, #FFB000)', // gold
  'var(--color-chart-3, #DC267F)', // magenta
  'var(--color-chart-6, #009E73)', // teal
] as const;

export const CHART_COLOR_LABELS = ['Blue', 'Orange', 'Purple', 'Gold', 'Magenta', 'Teal'] as const;

/** Returns the chart color CSS custom property reference at the given index (wraps). */
export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/** Returns the raw hex fallback at the given index (for non-DOM contexts). */
export function chartColorHex(index: number): string {
  return CHART_COLORS_HEX[index % CHART_COLORS_HEX.length];
}

export function patternId(index: number): string {
  return `chart-pattern-${index}`;
}

export function buildChartDescription(
  chartType: string,
  dataPoints: Array<{ label: string; value: number }>,
  currency = 'USD',
): string {
  if (dataPoints.length === 0) return `${chartType} with no data.`;
  const total = dataPoints.reduce((sum, d) => sum + d.value, 0);
  const summaries = dataPoints
    .map((d) => `${d.label}: ${formatChartCurrency(d.value, currency)}`)
    .join(', ');
  return `${chartType} showing ${dataPoints.length} categories totalling ${formatChartCurrency(total, currency)}. ${summaries}.`;
}
