// SPDX-License-Identifier: BUSL-1.1

import React from 'react';
import type { StressIndicatorSummary } from '../../lib/wellness';

export interface StressAlertsProps {
  summary: StressIndicatorSummary;
}

export const StressAlerts: React.FC<StressAlertsProps> = ({ summary }) => {
  return (
    <section className="wellness-overview__card" aria-labelledby="wellness-stress-alerts-title">
      <div className="wellness-overview__section-heading">
        <div>
          <h3 id="wellness-stress-alerts-title">Stress alerts</h3>
          <p>{summary.summary}</p>
        </div>
      </div>

      {summary.indicators.length === 0 ? (
        <div className="wellness-alert wellness-alert--positive">
          <strong>No active alerts</strong>
          <p>Your recent cash flow, bills, and savings trend look steady.</p>
        </div>
      ) : (
        <div className="wellness-alert-list" role="list">
          {summary.indicators.map((indicator) => (
            <article
              key={indicator.kind}
              className={`wellness-alert wellness-alert--${indicator.level}`}
              role="listitem"
            >
              <div className="wellness-alert__header">
                <strong>{indicator.title}</strong>
                <span>{indicator.level.replace('-', ' ')}</span>
              </div>
              <p>{indicator.description}</p>
              <p className="wellness-alert__recommendation">{indicator.recommendation}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
