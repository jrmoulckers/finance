// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { AppIcon } from '../icons';
import type { MisalignmentAlert } from '../../lib/alignment';
import './alignment.css';

export interface MisalignmentAlertsProps {
  alerts: readonly MisalignmentAlert[];
}

function formatPercent(value?: number): string | null {
  if (value === undefined) {
    return null;
  }

  const percent = value * 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

export const MisalignmentAlerts: React.FC<MisalignmentAlertsProps> = ({ alerts }) => {
  return (
    <article className="alignment-card alignment-card--alerts">
      <div className="alignment-card__header">
        <div>
          <p className="alignment-card__eyebrow">Step 4 · Notice the friction</p>
          <h3>Gentle alignment nudges</h3>
          <p className="alignment-card__description">
            These are not judgments. They simply highlight where your money and stated priorities
            are sending different signals.
          </p>
        </div>
      </div>

      {alerts.length > 0 ? (
        <ul className="alignment-alerts__list" role="list">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={`alignment-alert alignment-alert--${alert.severity}`}
              role="listitem"
            >
              <span className="alignment-alert__icon" aria-hidden="true">
                <AppIcon
                  name={alert.severity === 'warning' ? 'alert-triangle' : 'info'}
                  size={18}
                />
              </span>
              <div className="alignment-alert__body">
                <div className="alignment-alert__header-row">
                  <strong>{alert.title}</strong>
                  {alert.actualShare !== undefined && alert.targetShare !== undefined ? (
                    <span className="alignment-alert__badge">
                      {formatPercent(alert.actualShare)} vs {formatPercent(alert.targetShare)}
                    </span>
                  ) : null}
                </div>
                <p>{alert.description}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="alignment-alert alignment-alert--positive">
          <span className="alignment-alert__icon" aria-hidden="true">
            <AppIcon name="check-circle" size={18} />
          </span>
          <div className="alignment-alert__body">
            <strong>Your spending is tracking with your values</strong>
            <p>
              No major contradictions stood out this cycle. Keep checking in as your priorities or
              spending patterns shift.
            </p>
          </div>
        </div>
      )}
    </article>
  );
};
