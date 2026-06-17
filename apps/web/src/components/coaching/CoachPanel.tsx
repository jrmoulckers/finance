// SPDX-License-Identifier: BUSL-1.1

import type { FC } from 'react';
import { Link } from 'react-router-dom';
import { CurrencyDisplay } from '../common';
import { AppIcon, type IconName } from '../icons';
import type { CoachAnalysis, CoachSeverity, RecurrenceCadence } from '../../lib/coaching';
import './coach.css';

export interface CoachPanelProps {
  readonly analysis: CoachAnalysis | null;
  readonly loading?: boolean;
}

function getSeverityIcon(severity: CoachSeverity): IconName {
  switch (severity) {
    case 'critical':
      return 'alert-triangle';
    case 'warning':
      return 'alert-circle';
    case 'info':
    default:
      return 'sparkles';
  }
}

function formatCadence(cadence: RecurrenceCadence): string {
  switch (cadence) {
    case 'weekly':
      return 'Weekly';
    case 'biweekly':
      return 'Biweekly';
    case 'monthly':
    default:
      return 'Monthly';
  }
}

export const CoachPanel: FC<CoachPanelProps> = ({ analysis, loading = false }) => {
  if (loading) {
    return (
      <section className="card coach-panel" aria-label="Financial coach panel">
        <h3 className="coach-panel__title">Coach insights</h3>
        <p className="coach-panel__empty">Building your month-end forecast…</p>
      </section>
    );
  }

  if (analysis === null) {
    return null;
  }

  const riskBudgets = analysis.velocities
    .filter((velocity) => velocity.isOverspendRisk)
    .slice(0, 3);
  const recurringItems = analysis.cashFlow.recurringItems.slice(0, 4);
  const suggestions = analysis.suggestions.slice(0, 4);

  return (
    <section className="card coach-panel" aria-label="Financial coach panel">
      <div className="coach-panel__header">
        <div>
          <p className="coach-card__eyebrow">Cash flow + pacing</p>
          <h3 className="coach-panel__title">Coach insights</h3>
        </div>
      </div>

      <div className="coach-metrics" role="list" aria-label="Coach forecast summary">
        <article className="coach-metric" role="listitem">
          <span className="coach-metric__label">Current liquid balance</span>
          <strong className="coach-metric__value">
            <CurrencyDisplay amount={analysis.cashFlow.currentBalanceCents} colorize />
          </strong>
        </article>
        <article className="coach-metric" role="listitem">
          <span className="coach-metric__label">Projected month-end balance</span>
          <strong className="coach-metric__value">
            <CurrencyDisplay amount={analysis.cashFlow.projectedEndBalanceCents} colorize />
          </strong>
        </article>
        <article className="coach-metric" role="listitem">
          <span className="coach-metric__label">Recurring income left</span>
          <strong className="coach-metric__value">
            <CurrencyDisplay amount={analysis.cashFlow.projectedRecurringIncomeCents} colorize />
          </strong>
        </article>
        <article className="coach-metric" role="listitem">
          <span className="coach-metric__label">Projected discretionary burn</span>
          <strong className="coach-metric__value">
            <CurrencyDisplay
              amount={-analysis.cashFlow.projectedDiscretionaryExpenseCents}
              colorize
            />
          </strong>
        </article>
      </div>

      <div className="coach-panel__grid">
        <section className="coach-panel__section" aria-labelledby="coach-budget-watchlist-title">
          <h4 id="coach-budget-watchlist-title" className="coach-panel__section-title">
            Budget watchlist
          </h4>
          {riskBudgets.length === 0 ? (
            <p className="coach-panel__empty">All monthly budgets are currently on pace.</p>
          ) : (
            <ul className="coach-panel__list" role="list">
              {riskBudgets.map((velocity) => (
                <li key={velocity.id} className="coach-panel__item" role="listitem">
                  <div>
                    <p className="coach-panel__item-title">{velocity.categoryName}</p>
                    <p className="coach-panel__item-body">
                      Projected to land around{' '}
                      <CurrencyDisplay amount={velocity.projectedSpendCents} /> against a{' '}
                      <CurrencyDisplay amount={velocity.budgetAmountCents} /> budget.
                    </p>
                  </div>
                  <p className="coach-panel__meta">
                    Suggested pace: <CurrencyDisplay amount={velocity.recommendedDailySpendCents} />{' '}
                    / day
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="coach-panel__section" aria-labelledby="coach-recurring-title">
          <h4 id="coach-recurring-title" className="coach-panel__section-title">
            Upcoming recurring cash flow
          </h4>
          {recurringItems.length === 0 ? (
            <p className="coach-panel__empty">
              No recurring patterns were strong enough to project yet.
            </p>
          ) : (
            <ul className="coach-panel__list" role="list">
              {recurringItems.map((item) => (
                <li key={item.id} className="coach-panel__item" role="listitem">
                  <div>
                    <p className="coach-panel__item-title">{item.label}</p>
                    <p className="coach-panel__item-body">
                      {formatCadence(item.cadence)} · next expected {item.nextExpectedDate}
                    </p>
                  </div>
                  <p className="coach-panel__meta">
                    {item.occurrencesRemaining} left ·{' '}
                    <CurrencyDisplay
                      amount={
                        item.type === 'INCOME'
                          ? item.projectedAmountCents
                          : -item.projectedAmountCents
                      }
                      colorize
                    />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="coach-panel__section" aria-labelledby="coach-anomalies-title">
          <h4 id="coach-anomalies-title" className="coach-panel__section-title">
            Today's spikes
          </h4>
          {analysis.anomalies.length === 0 ? (
            <p className="coach-panel__empty">No unusual category spikes detected today.</p>
          ) : (
            <ul className="coach-panel__list" role="list">
              {analysis.anomalies.map((anomaly) => (
                <li key={anomaly.id} className="coach-panel__item" role="listitem">
                  <div>
                    <p className="coach-panel__item-title">{anomaly.categoryName}</p>
                    <p className="coach-panel__item-body">
                      <CurrencyDisplay amount={anomaly.todaySpendCents} /> today vs. a typical{' '}
                      <CurrencyDisplay amount={anomaly.baselineDailySpendCents} /> day.
                    </p>
                  </div>
                  <p className="coach-panel__meta">{anomaly.ratio.toFixed(1)}× normal pace</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="coach-panel__section" aria-labelledby="coach-suggestions-title">
          <h4 id="coach-suggestions-title" className="coach-panel__section-title">
            Suggested next steps
          </h4>
          <ul className="coach-panel__list" role="list">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id} className="coach-panel__item" role="listitem">
                <div className="coach-panel__suggestion-header">
                  <span className={`coach-pill coach-pill--${suggestion.severity}`}>
                    <AppIcon name={getSeverityIcon(suggestion.severity)} size={14} />
                    {suggestion.severity}
                  </span>
                  <p className="coach-panel__item-title">{suggestion.title}</p>
                </div>
                <p className="coach-panel__item-body">{suggestion.description}</p>
                {suggestion.actionRoute && (
                  <Link className="coach-alert__action" to={suggestion.actionRoute}>
                    {suggestion.actionLabel ?? 'Learn more'}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
};
