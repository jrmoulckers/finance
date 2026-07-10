// SPDX-License-Identifier: BUSL-1.1

/**
 * Color-blind safe chart palette and shared chart utilities.
 * Uses the IBM Design Language CVD-safe palette from design tokens.
 * @module components/charts/chart-palette
 */

import { formatChartCurrency } from '../../lib/currency';
import { MaskingMode } from '../../lib/ui/privacy';

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

/**
 * Default number of individual categories to surface in a categorical chart
 * before the remainder is rolled into a single "Other" slice. Chosen to match
 * the six-entry CVD-safe palette so every visible slice gets a unique color.
 */
export const DEFAULT_TOP_N_CATEGORIES = 6;

/** Label applied to the aggregated remainder slice. */
export const OTHER_CATEGORY_LABEL = 'Other';

/** A named, numeric-valued slice used by the categorical charts. */
export interface NamedValue {
  name: string;
  value: number;
}

/**
 * Cap a categorical dataset at the largest `topN` entries and aggregate the
 * remainder into a single "Other" entry that preserves the grand total.
 *
 * The result is deterministic: sorted by value descending, with the "Other"
 * entry (when present) always last. When there are `topN` or fewer categories
 * the data is returned sorted but otherwise unchanged (no "Other" entry).
 */
export function groupTopNCategories<T extends NamedValue>(
  data: readonly T[],
  topN: number = DEFAULT_TOP_N_CATEGORIES,
  otherLabel: string = OTHER_CATEGORY_LABEL,
): NamedValue[] {
  const sorted = [...data]
    .map(({ name, value }) => ({ name, value }))
    .sort((left, right) => right.value - left.value);

  if (topN <= 0 || sorted.length <= topN) {
    return sorted;
  }

  const top = sorted.slice(0, topN);
  const otherTotal = sorted.slice(topN).reduce((sum, entry) => sum + entry.value, 0);
  return [...top, { name: otherLabel, value: otherTotal }];
}

/**
 * Build a short, human-readable caption for a categorical chart, e.g.
 * "$2,340 across 6 categories; Groceries is largest at 28%." Intended for a
 * compact visible summary line; returns an empty string when there is no data.
 */
export function buildCategoryCaption(
  dataPoints: readonly NamedValue[],
  currency = 'USD',
  maskingMode: MaskingMode = MaskingMode.Visible,
): string {
  if (dataPoints.length === 0) return '';
  const total = dataPoints.reduce((sum, d) => sum + d.value, 0);
  const largest = dataPoints.reduce((max, d) => (d.value > max.value ? d : max), dataPoints[0]);
  const share = total > 0 ? Math.round((largest.value / total) * 100) : 0;
  const noun = dataPoints.length === 1 ? 'category' : 'categories';
  const totalText = formatChartCurrency(total, currency, 'en-US', maskingMode);
  return `${totalText} across ${dataPoints.length} ${noun}; ${largest.name} is largest at ${share}%.`;
}

export function buildChartDescription(
  chartType: string,
  dataPoints: Array<{ label: string; value: number }>,
  currency = 'USD',
  maskingMode: MaskingMode = MaskingMode.Visible,
): string {
  if (dataPoints.length === 0) return `${chartType} with no data.`;
  const total = dataPoints.reduce((sum, d) => sum + d.value, 0);
  const summaries = dataPoints
    .map((d) => `${d.label}: ${formatChartCurrency(d.value, currency, 'en-US', maskingMode)}`)
    .join(', ');
  return `${chartType} showing ${dataPoints.length} categories totalling ${formatChartCurrency(total, currency, 'en-US', maskingMode)}. ${summaries}.`;
}
