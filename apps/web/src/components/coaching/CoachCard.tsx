// SPDX-License-Identifier: BUSL-1.1

import type { FC } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon, type IconName } from '../icons';
import type { CoachAlert, CoachSeverity } from '../../lib/coaching';
import './coach.css';

export interface CoachCardProps {
  readonly alerts: readonly CoachAlert[];
  readonly loading?: boolean;
  readonly onDismiss: (alertId: string) => void;
}

function getSeverityIcon(severity: CoachSeverity): IconName {
  switch (severity) {
    case 'critical':
      return 'alert-triangle';
    case 'warning':
      return 'alert-circle';
    case 'info':
    default:
      return 'info';
  }
}

function getSeverityLabel(severity: CoachSeverity): string {
  switch (severity) {
    case 'critical':
      return 'Critical';
    case 'warning':
      return 'Warning';
    case 'info':
    default:
      return 'Info';
  }
}

export const CoachCard: FC<CoachCardProps> = ({ alerts, loading = false, onDismiss }) => {
  return (
    <article className="card coach-card" aria-label="Financial coach alerts">
      <div className="coach-card__header">
        <div>
          <p className="coach-card__eyebrow">Proactive coach</p>
          <h3 className="coach-card__title">What needs attention now</h3>
        </div>
        <span className="coach-card__badge">
          <AppIcon name="sparkles" size={16} />
          {alerts.length === 0
            ? 'On track'
            : `${Math.min(alerts.length, 3)} alert${alerts.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {loading ? (
        <p className="coach-card__empty">Analyzing budgets, balances, and recurring spending…</p>
      ) : alerts.length === 0 ? (
        <p className="coach-card__empty">
          No active risks right now. Keep logging transactions and the coach will flag issues early.
        </p>
      ) : (
        <ul className="coach-alert-list" role="list">
          {alerts.slice(0, 3).map((alert) => (
            <li
              key={alert.id}
              className={`coach-alert coach-alert--${alert.severity}`}
              role="listitem"
            >
              <div className="coach-alert__icon" aria-hidden="true">
                <AppIcon name={getSeverityIcon(alert.severity)} size={18} />
              </div>
              <div className="coach-alert__content">
                <p className="coach-alert__eyebrow">{getSeverityLabel(alert.severity)}</p>
                <h4 className="coach-alert__title">{alert.title}</h4>
                <p className="coach-alert__message">{alert.message}</p>
                {alert.actionRoute && (
                  <Link className="coach-alert__action" to={alert.actionRoute}>
                    {alert.actionLabel ?? 'View details'}
                  </Link>
                )}
              </div>
              <button
                type="button"
                className="coach-alert__dismiss"
                onClick={() => onDismiss(alert.id)}
                aria-label={`Dismiss alert: ${alert.title}`}
              >
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
};
