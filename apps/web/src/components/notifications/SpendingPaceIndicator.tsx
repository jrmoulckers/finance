// SPDX-License-Identifier: BUSL-1.1

/**
 * Spending pace indicator component.
 *
 * Visual display of daily spending pace with a progress bar,
 * ahead/behind indicator, and remaining days estimate.
 *
 * @module components/notifications/SpendingPaceIndicator
 * References: #1648
 */

import type { FC } from 'react';
import { formatCentsForAlert } from '../../lib/notifications';
import type { SpendingPace } from '../../lib/notifications';
import './notifications.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Props for the SpendingPaceIndicator component. */
export interface SpendingPaceIndicatorProps {
  /** Spending pace data for a single budget. */
  pace: SpendingPace;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Determine the pace status class. */
function getPaceStatus(pace: SpendingPace): 'on-track' | 'over-pace' | 'critical' {
  if (pace.percentUsed >= 100) return 'critical';
  if (pace.isAheadOfPace) return 'over-pace';
  return 'on-track';
}

/** Get human-readable pace label. */
function getPaceLabel(pace: SpendingPace): string {
  const status = getPaceStatus(pace);
  switch (status) {
    case 'critical':
      return 'Limit reached';
    case 'over-pace':
      return 'Ahead of pace';
    case 'on-track':
      return 'On track';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Spending pace progress bar with context.
 *
 * Uses `role="progressbar"` with ARIA value attributes for
 * screen reader accessibility.
 */
export const SpendingPaceIndicator: FC<SpendingPaceIndicatorProps> = ({ pace }) => {
  const status = getPaceStatus(pace);
  const fillPercent = Math.min(pace.percentUsed, 100);
  const timeMarkerPercent = Math.min(pace.percentTimeElapsed, 100);

  return (
    <div className="spending-pace">
      <div className="spending-pace__header">
        <span className="spending-pace__label">{pace.budgetName}</span>
        <span className={`spending-pace__badge spending-pace__badge--${status}`}>
          {getPaceLabel(pace)}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="spending-pace__bar"
        role="progressbar"
        aria-valuenow={pace.percentUsed}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pace.budgetName} spending: ${pace.percentUsed}% of budget used, ${pace.percentTimeElapsed}% of time elapsed`}
      >
        <div
          className={`spending-pace__bar-fill spending-pace__bar-fill--${status}`}
          style={{ width: `${fillPercent}%` }}
        />
        {/* Time elapsed marker */}
        <div
          className="spending-pace__bar-marker"
          style={{ left: `${timeMarkerPercent}%` }}
          aria-hidden="true"
        />
      </div>

      {/* Detail row */}
      <div className="spending-pace__details">
        <span>
          {formatCentsForAlert(pace.spentCents)} of {formatCentsForAlert(pace.budgetAmountCents)}
        </span>
        <span>
          {pace.remainingDays} day{pace.remainingDays === 1 ? '' : 's'} left
        </span>
      </div>

      {/* Predictive info */}
      {pace.willOverspend && pace.daysUntilExhausted !== null && (
        <div className="spending-pace__details" aria-live="polite">
          <span>Projected: {formatCentsForAlert(pace.predictedTotalCents)}</span>
          {pace.daysUntilExhausted > 0 && (
            <span>
              ~{pace.daysUntilExhausted} day
              {pace.daysUntilExhausted === 1 ? '' : 's'} until exhausted
            </span>
          )}
        </div>
      )}
    </div>
  );
};
