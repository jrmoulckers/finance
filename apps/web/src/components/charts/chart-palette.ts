// SPDX-License-Identifier: BUSL-1.1

/**
 * Color-blind safe chart palette and shared chart utilities.
 * Uses the IBM Design Language CVD-safe palette from design tokens.
 * @module components/charts/chart-palette
 */

export const CHART_COLORS = [
  '#648FFF', // blue
  '#FE6100', // orange
  '#785EF0', // purple
  '#FFB000', // gold
  '#DC267F', // magenta
  '#009E73', // teal
] as const;

export const CHART_COLOR_LABELS = [
  'Blue', 'Orange', 'Purple', 'Gold', 'Magenta', 'Teal',
] as const;

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export function patternId(index: number): string {
  return `chart-pattern-${index}`;
}

export function formatChartCurrency(
  value: number,
  currency = 'USD',
  locale = 'en-US',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
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
