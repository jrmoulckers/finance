// SPDX-License-Identifier: BUSL-1.1

/**
 * ChartEmptyState — shared, accessible empty state for chart components.
 *
 * Charts that render no data used to either display a blank canvas (pie/donut)
 * or an empty gridded axis frame (bar), which reads as broken and offers no
 * guidance. This primitive standardises the "no data" affordance so every
 * chart surfaces the same `role="status"` message and visual treatment.
 *
 * Accessibility (WCAG 2.2 AA):
 * - Exposes `role="status"` so assistive tech announces the empty condition.
 * - Renders the chart title as a visible heading for context.
 * - Uses semantic text/border tokens with hardcoded fallbacks for contrast.
 *
 * References: issue #3784
 *
 * @module components/charts/ChartEmptyState
 */

import { type FC } from 'react';
import './chart-empty-state.css';

export interface ChartEmptyStateProps {
  /** Chart title, rendered as a visible heading above the message. */
  title: string;
  /** Optional element id applied to the heading (for `aria-labelledby`). */
  titleId?: string;
  /** Empty-state message. Defaults to a generic prompt. */
  message?: string;
}

export const DEFAULT_CHART_EMPTY_MESSAGE = 'No data to display yet.';

export const ChartEmptyState: FC<ChartEmptyStateProps> = ({
  title,
  titleId,
  message = DEFAULT_CHART_EMPTY_MESSAGE,
}) => (
  <div className="chart-empty-state" role="figure" aria-label={`${title}: ${message}`}>
    <h3 id={titleId} className="chart-title">
      {title}
    </h3>
    <p className="chart-empty-state__message" role="status">
      {message}
    </p>
  </div>
);

export default ChartEmptyState;
