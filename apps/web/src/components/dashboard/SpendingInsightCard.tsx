// SPDX-License-Identifier: BUSL-1.1

/**
 * SpendingInsightCard — a compact, plain-language "what stands out" summary for
 * the dashboard. Surfaces (a) the top spending category with its amount and
 * share and (b) the period-over-period direction and magnitude, using the data
 * already computed on the dashboard.
 *
 * Accessibility (WCAG 2.2 AA):
 * - Directional change uses a word ("more"/"less") plus an icon glyph, never
 *   color alone (1.4.1 Use of Color).
 * - Currency respects the active masking mode via `CurrencyDisplay`.
 * - Rendered as a self-contained `<article>` with an accessible label.
 *
 * References: issue #3756
 *
 * @module components/dashboard/SpendingInsightCard
 */

import { type FC } from 'react';
import { CurrencyDisplay } from '../common';
import './spending-insight-card.css';

export interface SpendingInsightTopCategory {
  /** Category display name. */
  name: string;
  /** Category spend in major currency units (dollars, not cents). */
  value: number;
}

export interface SpendingInsightComparison {
  /** Percentage change vs the previous period (positive = increase). */
  percentChange: number;
}

export interface SpendingInsightCardProps {
  /** Highest-spend category for the period, or `null` when unavailable. */
  topCategory: SpendingInsightTopCategory | null;
  /** Total spend across all categories in major units (for the share %). */
  totalSpending: number;
  /** Period-over-period comparison, or `null` when there is no prior period. */
  comparison: SpendingInsightComparison | null;
  /** ISO 4217 currency code for formatting. */
  currency?: string;
}

/**
 * A one-line spending insight card. Returns `null` when there is insufficient
 * data (no top category and no comparison) so the dashboard stays uncluttered.
 */
export const SpendingInsightCard: FC<SpendingInsightCardProps> = ({
  topCategory,
  totalSpending,
  comparison,
  currency = 'USD',
}) => {
  const hasTopCategory = topCategory != null && topCategory.value > 0;
  const hasComparison = comparison != null && Number.isFinite(comparison.percentChange);

  if (!hasTopCategory && !hasComparison) {
    return null;
  }

  const share =
    hasTopCategory && totalSpending > 0
      ? Math.round((topCategory.value / totalSpending) * 100)
      : null;

  const changeMagnitude = hasComparison ? Math.abs(Math.round(comparison.percentChange)) : 0;
  const changeDirection = hasComparison && comparison.percentChange >= 0 ? 'more' : 'less';
  const changeGlyph = changeDirection === 'more' ? '↑' : '↓';
  // Suppress the comparison clause when the rounded magnitude is 0 ("flat"),
  // which reads more naturally as no meaningful change.
  const showComparison = hasComparison && changeMagnitude > 0;

  return (
    <article className="spending-insight-card" aria-label="Spending insight">
      <span className="spending-insight-card__icon" aria-hidden="true">
        💡
      </span>
      <p className="spending-insight-card__text">
        {hasTopCategory && (
          <span>
            <strong>{topCategory.name}</strong> is your top category this period at{' '}
            <CurrencyDisplay
              amount={Math.round(topCategory.value * 100)}
              currency={currency}
              context={`${topCategory.name} category`}
            />
            {share !== null ? ` (${share}%)` : ''}.
          </span>
        )}{' '}
        {showComparison && (
          <span
            className={`spending-insight-card__change spending-insight-card__change--${changeDirection}`}
          >
            <span aria-hidden="true">{changeGlyph}</span> You&rsquo;re spending {changeMagnitude}%{' '}
            {changeDirection} than the previous period.
          </span>
        )}
      </p>
    </article>
  );
};

export default SpendingInsightCard;
