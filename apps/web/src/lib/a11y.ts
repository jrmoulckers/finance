// SPDX-License-Identifier: BUSL-1.1

import type { IconName } from '../components/icons';

/**
 * Accessibility utility functions for the Finance web app.
 *
 * Provides screen-reader-friendly formatters for currency amounts,
 * percentages, and financial status indicators. These utilities ensure
 * that financial data is announced with full context — including sign,
 * currency, and surrounding meaning — so that assistive technology
 * users receive the same information as sighted users.
 *
 * References: issues #1689, #1693
 */

import { formatCurrency } from './currency';

// ---------------------------------------------------------------------------
// Currency formatting for screen readers
// ---------------------------------------------------------------------------

/**
 * Format a cents amount into a screen-reader-friendly label.
 *
 * Produces spoken-form output like:
 *   - "twelve dollars and thirty-four cents"
 *   - "negative forty-two dollars and fifty cents, Dining category"
 *
 * Falls back to a simpler form using `Intl.NumberFormat` with the
 * locale's full currency name and explicit "negative" prefix.
 *
 * @param amountInCents - Integer cents (e.g., 12345 = $123.45).
 * @param currency - ISO 4217 currency code (default: "USD").
 * @param context - Optional context string appended to the label
 *   (e.g., "Dining category", "Emergency Fund goal").
 *
 * @example
 * ```ts
 * formatCurrencyForScreenReader(-4250);
 * // "negative $42.50"
 *
 * formatCurrencyForScreenReader(-4250, 'USD', 'Dining category');
 * // "negative $42.50, Dining category"
 *
 * formatCurrencyForScreenReader(100000, 'EUR', 'Savings goal');
 * // "€1,000.00, Savings goal"
 * ```
 */
export function formatCurrencyForScreenReader(
  amountInCents: number,
  currency = 'USD',
  context?: string,
): string {
  const isNegative = amountInCents < 0;
  const formatted = formatCurrency(Math.abs(amountInCents), { currency });
  const base = isNegative ? `negative ${formatted}` : formatted;

  return context ? `${base}, ${context}` : base;
}

// ---------------------------------------------------------------------------
// Percentage formatting for screen readers
// ---------------------------------------------------------------------------

/**
 * Format a percentage value with context for screen readers.
 *
 * Produces labels like "75 percent of monthly budget used" instead of
 * bare "75%" which can be ambiguous for assistive technology.
 *
 * @param value - The percentage value (0–100+).
 * @param context - What the percentage measures
 *   (e.g., "of monthly budget used", "of goal reached").
 *
 * @example
 * ```ts
 * formatPercentForScreenReader(75, 'of monthly budget used');
 * // "75 percent of monthly budget used"
 * ```
 */
export function formatPercentForScreenReader(value: number, context: string): string {
  return `${value} percent ${context}`;
}

// ---------------------------------------------------------------------------
// Financial status text indicators
// ---------------------------------------------------------------------------

/**
 * Return a text indicator for a financial amount direction.
 *
 * Provides a non-color indicator (arrow + label) so that positive and
 * negative states are distinguishable without relying on color alone
 * (WCAG 1.4.1 — Use of Color).
 *
 * @param amount - The financial amount (positive = good, negative = bad
 *   in the budget-remaining context).
 *
 * @example
 * ```ts
 * getStatusIndicator(500);   // { icon: '↑', label: 'under budget', tone: 'positive' }
 * getStatusIndicator(-200);  // { icon: '↓', label: 'over budget', tone: 'negative' }
 * getStatusIndicator(0);     // { icon: '→', label: 'on budget', tone: 'neutral' }
 * ```
 */
export function getStatusIndicator(amount: number): {
  icon: string;
  label: string;
  tone: 'positive' | 'negative' | 'neutral';
} {
  if (amount > 0) {
    return { icon: '↑', label: 'under budget', tone: 'positive' };
  }
  if (amount < 0) {
    return { icon: '↓', label: 'over budget', tone: 'negative' };
  }
  return { icon: '→', label: 'on budget', tone: 'neutral' };
}

/**
 * Return a text indicator for goal progress percentage.
 *
 * @param percentComplete - The goal completion percentage (0–100+).
 *
 * @example
 * ```ts
 * getGoalStatusIndicator(100); // { icon: 'check', label: 'Goal reached', tone: 'positive' }
 * getGoalStatusIndicator(60);  // { icon: 'target', label: 'In progress', tone: 'positive' }
 * getGoalStatusIndicator(20);  // { icon: 'target', label: 'Getting started', tone: 'warning' }
 * ```
 */
export function getGoalStatusIndicator(percentComplete: number): {
  icon: IconName;
  label: string;
  tone: 'positive' | 'warning' | 'negative';
} {
  if (percentComplete >= 100) {
    return { icon: 'check', label: 'Goal reached', tone: 'positive' };
  }
  if (percentComplete >= 50) {
    return { icon: 'target', label: 'In progress', tone: 'positive' };
  }
  if (percentComplete >= 25) {
    return { icon: 'target', label: 'Getting started', tone: 'warning' };
  }
  return { icon: 'target', label: 'Just started', tone: 'negative' };
}

/**
 * Return a text indicator for budget usage percentage.
 *
 * @param percentUsed - Budget usage percentage (0–100+).
 *
 * @example
 * ```ts
 * getBudgetStatusIndicator(95);  // { icon: 'alert-triangle', label: 'Over limit', tone: 'negative' }
 * getBudgetStatusIndicator(80);  // { icon: 'target', label: 'Near limit', tone: 'warning' }
 * getBudgetStatusIndicator(50);  // { icon: 'check', label: 'On track', tone: 'positive' }
 * ```
 */
export function getBudgetStatusIndicator(percentUsed: number): {
  icon: IconName;
  label: string;
  tone: 'positive' | 'warning' | 'negative';
} {
  if (percentUsed > 90) {
    return { icon: 'alert-triangle', label: 'Over limit', tone: 'negative' };
  }
  if (percentUsed > 75) {
    return { icon: 'target', label: 'Near limit', tone: 'warning' };
  }
  return { icon: 'check', label: 'On track', tone: 'positive' };
}

// ---------------------------------------------------------------------------
// Chart text alternatives for screen readers
// ---------------------------------------------------------------------------

export interface ChartDataPoint {
  label: string;
  value: number;
}

/**
 * Generate a text alternative for a bar or line chart.
 *
 * Produces a screen-reader-friendly summary of chart data, including
 * the chart title, data point count, and high/low values. This enables
 * blind users to understand chart trends without seeing the visual.
 *
 * @param title - Chart title (e.g., "Spending Trend").
 * @param data - Array of labelled data points.
 * @param unit - Unit label (e.g., "dollars", "percent").
 *
 * @example
 * ```ts
 * getChartTextAlternative('Spending Trend', [
 *   { label: 'Jan', value: 500 },
 *   { label: 'Feb', value: 300 },
 * ], 'dollars');
 * // "Spending Trend chart with 2 data points. Highest: Jan at 500 dollars. Lowest: Feb at 300 dollars."
 * ```
 */
export function getChartTextAlternative(title: string, data: ChartDataPoint[], unit = ''): string {
  if (data.length === 0) {
    return `${title} chart with no data.`;
  }

  const unitSuffix = unit ? ` ${unit}` : '';
  let highest = data[0];
  let lowest = data[0];

  for (const point of data) {
    if (point.value > highest.value) highest = point;
    if (point.value < lowest.value) lowest = point;
  }

  const parts = [
    `${title} chart with ${data.length} data point${data.length !== 1 ? 's' : ''}.`,
    `Highest: ${highest.label} at ${highest.value}${unitSuffix}.`,
  ];

  if (data.length > 1 && lowest !== highest) {
    parts.push(`Lowest: ${lowest.label} at ${lowest.value}${unitSuffix}.`);
  }

  return parts.join(' ');
}

/**
 * Generate a text alternative for a pie or donut chart.
 *
 * Lists each segment with its percentage of the total, enabling
 * screen reader users to understand the distribution.
 *
 * @param title - Chart title (e.g., "Category Share").
 * @param data - Array of named segments with values.
 *
 * @example
 * ```ts
 * getPieChartTextAlternative('Category Share', [
 *   { label: 'Food', value: 300 },
 *   { label: 'Rent', value: 700 },
 * ]);
 * // "Category Share chart. Food: 30%. Rent: 70%."
 * ```
 */
export function getPieChartTextAlternative(title: string, data: ChartDataPoint[]): string {
  if (data.length === 0) {
    return `${title} chart with no data.`;
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return `${title} chart with no data.`;
  }

  const segments = data
    .map((d) => {
      const pct = Math.round((d.value / total) * 100);
      return `${d.label}: ${pct}%`;
    })
    .join('. ');

  return `${title} chart. ${segments}.`;
}

/**
 * Generate an accessible description for a financial data table.
 *
 * Provides a summary of table contents for screen readers,
 * including row count and key metrics.
 *
 * @param entityName - The entity type (e.g., "transaction", "account").
 * @param count - Number of rows.
 * @param context - Additional context (e.g., "sorted by date").
 */
export function getTableDescription(entityName: string, count: number, context?: string): string {
  const plural = count !== 1 ? 's' : '';
  const base = `${count} ${entityName}${plural}`;
  return context ? `${base}, ${context}` : base;
}
