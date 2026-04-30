// SPDX-License-Identifier: BUSL-1.1

/**
 * Predictive Balance Card — dashboard widget showing end-of-month forecast.
 *
 * Displays:
 *   - Current total balance
 *   - Predicted end-of-month balance
 *   - Change direction (up/down/flat) with color coding
 *   - Per-account breakdown (collapsible)
 *   - Confidence indicator
 *
 * Accessibility:
 *   - Semantic heading hierarchy
 *   - aria-label on trend indicators
 *   - role="status" for prediction values
 *   - Keyboard-accessible expand/collapse
 *
 * References: issue #324
 */

import React, { useCallback, useState } from 'react';
import { CurrencyDisplay } from '../common';
import type { PredictionSummary, AccountPrediction } from '../../lib/predictiveBalance';

import '../../styles/predictive-balance.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PredictiveBalanceCardProps {
  /** Prediction data from usePredictiveBalance hook. */
  prediction: PredictionSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTrendIcon(trend: AccountPrediction['trend']): string {
  switch (trend) {
    case 'positive':
      return '📈';
    case 'negative':
      return '📉';
    case 'flat':
      return '➡️';
  }
}

function getTrendLabel(trend: AccountPrediction['trend']): string {
  switch (trend) {
    case 'positive':
      return 'Balance increasing';
    case 'negative':
      return 'Balance decreasing';
    case 'flat':
      return 'Balance stable';
  }
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.7) return 'High';
  if (confidence >= 0.4) return 'Medium';
  return 'Low';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PredictiveBalanceCard: React.FC<PredictiveBalanceCardProps> = ({ prediction }) => {
  const [showDetails, setShowDetails] = useState(false);

  const toggleDetails = useCallback(() => {
    setShowDetails((prev) => !prev);
  }, []);

  const overallTrend: AccountPrediction['trend'] =
    prediction.predictedChangeCents > 1000
      ? 'positive'
      : prediction.predictedChangeCents < -1000
        ? 'negative'
        : 'flat';

  return (
    <article className="predictive-card" aria-label="End-of-month balance prediction">
      <div className="predictive-card__header">
        <h3 className="predictive-card__title">End-of-Month Forecast</h3>
        <span className="predictive-card__date">by {prediction.endOfMonth}</span>
      </div>

      <div className="predictive-card__main" role="status" aria-live="polite">
        <div className="predictive-card__prediction">
          <span className="predictive-card__label">Predicted Balance</span>
          <span className="predictive-card__amount">
            <CurrencyDisplay amount={prediction.totalPredictedBalanceCents} colorize />
          </span>
        </div>

        <div className="predictive-card__change">
          <span
            className={`predictive-card__trend predictive-card__trend--${overallTrend}`}
            aria-label={getTrendLabel(overallTrend)}
          >
            <span aria-hidden="true">{getTrendIcon(overallTrend)}</span>
            <CurrencyDisplay amount={prediction.predictedChangeCents} colorize showSign />
          </span>
        </div>

        <div className="predictive-card__current">
          <span className="predictive-card__label">Current Balance</span>
          <span className="predictive-card__amount predictive-card__amount--current">
            <CurrencyDisplay amount={prediction.totalCurrentBalanceCents} />
          </span>
        </div>
      </div>

      {prediction.accounts.length > 1 && (
        <>
          <button
            type="button"
            className="predictive-card__toggle"
            onClick={toggleDetails}
            aria-expanded={showDetails}
            aria-controls="predictive-account-details"
          >
            {showDetails ? 'Hide' : 'Show'} account breakdown
            <span aria-hidden="true">{showDetails ? ' ▲' : ' ▼'}</span>
          </button>

          {showDetails && (
            <div id="predictive-account-details" className="predictive-card__details">
              {prediction.accounts.map((account) => (
                <div key={account.accountId} className="predictive-card__account">
                  <div className="predictive-card__account-header">
                    <span className="predictive-card__account-name">{account.accountName}</span>
                    <span
                      className={`predictive-card__account-trend predictive-card__trend--${account.trend}`}
                      aria-label={getTrendLabel(account.trend)}
                    >
                      <span aria-hidden="true">{getTrendIcon(account.trend)}</span>
                    </span>
                  </div>
                  <div className="predictive-card__account-amounts">
                    <span>
                      <CurrencyDisplay amount={account.currentBalanceCents} /> →{' '}
                      <CurrencyDisplay amount={account.predictedBalanceCents} colorize />
                    </span>
                  </div>
                  <div className="predictive-card__account-meta">
                    <span>
                      Avg daily: <CurrencyDisplay amount={account.avgDailySpendingCents} /> out,{' '}
                      <CurrencyDisplay amount={account.avgDailyIncomeCents} /> in
                    </span>
                    <span className="predictive-card__confidence">
                      {getConfidenceLabel(account.confidence)} confidence
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
};

export default PredictiveBalanceCard;
