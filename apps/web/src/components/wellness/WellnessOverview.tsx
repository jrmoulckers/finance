// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import { CurrencyDisplay } from '../common';
import type { FinancialWellnessSnapshot, MoodState } from '../../lib/wellness';
import { AnxietyGauge } from './AnxietyGauge';
import { MoodSpendingChart } from './MoodSpendingChart';
import { StressAlerts } from './StressAlerts';
import './wellness.css';

export interface WellnessOverviewProps {
  overview: FinancialWellnessSnapshot;
}

function formatMoodState(moodState: MoodState | null): string {
  if (!moodState) {
    return 'Not enough tags yet';
  }

  return moodState.charAt(0).toUpperCase() + moodState.slice(1);
}

function formatCorrelation(value: number): string {
  if (value === 0) {
    return 'Neutral';
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

export const WellnessOverview: React.FC<WellnessOverviewProps> = ({ overview }) => {
  return (
    <section className="wellness-overview" aria-labelledby="wellness-overview-title">
      <header className="wellness-overview__header">
        <div>
          <p className="wellness-overview__eyebrow">Financial wellness insights</p>
          <h2 id="wellness-overview-title">Mood correlation + anxiety snapshot</h2>
          <p className="wellness-overview__subtitle">
            Local-first signals that connect cash flow, bill pressure, and optional mood tags.
          </p>
        </div>
      </header>

      <div className="wellness-overview__top-grid">
        <article className="wellness-overview__card">
          <div className="wellness-overview__section-heading">
            <div>
              <h3>Financial anxiety score</h3>
              <p>{overview.anxietyScore.summary}</p>
            </div>
          </div>
          <div className="wellness-overview__gauge-layout">
            <AnxietyGauge result={overview.anxietyScore} />
            <ul className="wellness-overview__breakdown" role="list">
              <li>
                <span>Overdraft proximity</span>
                <strong>{overview.anxietyScore.breakdown.overdraftProximity}/20</strong>
              </li>
              <li>
                <span>Spending volatility</span>
                <strong>{overview.anxietyScore.breakdown.spendingVolatility}/20</strong>
              </li>
              <li>
                <span>Bill stress</span>
                <strong>{overview.anxietyScore.breakdown.billStress}/20</strong>
              </li>
              <li>
                <span>Debt pressure</span>
                <strong>{overview.anxietyScore.breakdown.debtPressure}/20</strong>
              </li>
              <li>
                <span>Savings trajectory</span>
                <strong>{overview.anxietyScore.breakdown.savingsTrajectory}/20</strong>
              </li>
            </ul>
          </div>
        </article>

        <article className="wellness-overview__card">
          <div className="wellness-overview__section-heading">
            <div>
              <h3>Mood correlation snapshot</h3>
              <p>{overview.moodCorrelation.summary}</p>
            </div>
          </div>
          <div className="wellness-overview__stat-grid">
            <div>
              <span>Tagged expenses</span>
              <strong>{overview.moodCorrelation.entriesTagged}</strong>
            </div>
            <div>
              <span>Correlation</span>
              <strong>{formatCorrelation(overview.moodCorrelation.correlation)}</strong>
            </div>
            <div>
              <span>Dominant mood</span>
              <strong>{formatMoodState(overview.moodCorrelation.dominantMoodState)}</strong>
            </div>
            <div>
              <span>Average tagged spend</span>
              <strong>
                <CurrencyDisplay
                  amount={overview.moodCorrelation.averageTaggedSpending}
                  currency={overview.currencyCode}
                  context="average tagged spend"
                />
              </strong>
            </div>
          </div>
          <div className="wellness-overview__meta-row">
            <span>{overview.moodCorrelation.spikeCount} spending spikes</span>
            <span>{overview.moodCorrelation.dropCount} lighter-spend days</span>
          </div>
        </article>
      </div>

      <article className="wellness-overview__card">
        <MoodSpendingChart
          correlation={overview.moodCorrelation}
          currencyCode={overview.currencyCode}
        />
      </article>

      <div className="wellness-overview__bottom-grid">
        <section className="wellness-overview__card" aria-labelledby="wellness-patterns-title">
          <div className="wellness-overview__section-heading">
            <div>
              <h3 id="wellness-patterns-title">Emotional spending patterns</h3>
              <p>Detected from recent mood-tagged expenses.</p>
            </div>
          </div>

          {overview.moodCorrelation.patterns.length === 0 ? (
            <p className="wellness-overview__empty-copy">
              Tag a few more purchases to surface emotional spending patterns here.
            </p>
          ) : (
            <div className="wellness-pattern-list" role="list">
              {overview.moodCorrelation.patterns.map((pattern) => (
                <article key={pattern.id} className="wellness-pattern" role="listitem">
                  <div className="wellness-pattern__header">
                    <strong>{pattern.title}</strong>
                    <span>{pattern.intensity}</span>
                  </div>
                  <p>{pattern.description}</p>
                  <div className="wellness-pattern__meta">
                    <span>{pattern.occurrences} tagged purchases</span>
                    <span>
                      Avg{' '}
                      <CurrencyDisplay
                        amount={pattern.averageSpending}
                        currency={overview.currencyCode}
                        context={`${pattern.title} average spending`}
                      />
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <StressAlerts summary={overview.stressIndicators} />
      </div>
    </section>
  );
};
