// SPDX-License-Identifier: BUSL-1.1

/**
 * ContextualTips — renders a list of contextual financial tips.
 *
 * Displays relevant financial advice based on the user's current data
 * and page context. Tips can be dismissed individually and feature
 * optional navigation actions.
 *
 * Accessibility:
 * - Uses `<section>` with `aria-label` for screen reader context
 * - Tips use `<article>` for self-contained content
 * - Dismiss buttons have descriptive `aria-label`
 * - Status updates use `aria-live="polite"`
 * - All interactive elements are keyboard-accessible
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { FinancialTip, TipSeverity } from './tips-engine';
import './tips.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ContextualTipsProps {
  /** Tips to display. */
  tips: FinancialTip[];
  /** Callback when user dismisses a tip. */
  onDismiss: (tipId: string) => void;
  /** Additional CSS class name. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSeverityIcon(severity: TipSeverity): string {
  switch (severity) {
    case 'critical':
      return '🚨';
    case 'warning':
      return '⚠️';
    case 'success':
      return '✅';
    case 'info':
    default:
      return '💡';
  }
}

function getSeverityLabel(severity: TipSeverity): string {
  switch (severity) {
    case 'critical':
      return 'Critical';
    case 'warning':
      return 'Warning';
    case 'success':
      return 'Success';
    case 'info':
    default:
      return 'Tip';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ContextualTips: React.FC<ContextualTipsProps> = ({
  tips,
  onDismiss,
  className = '',
}) => {
  const navigate = useNavigate();

  if (tips.length === 0) {
    return null;
  }

  return (
    <section className={`contextual-tips ${className}`.trim()} aria-label="Financial tips">
      <div className="contextual-tips__list" role="list" aria-live="polite">
        {tips.map((tip) => (
          <article
            key={tip.id}
            className={`contextual-tip contextual-tip--${tip.severity}`}
            role="listitem"
            aria-label={`${getSeverityLabel(tip.severity)}: ${tip.title}`}
          >
            <div className="contextual-tip__icon" aria-hidden="true">
              {getSeverityIcon(tip.severity)}
            </div>
            <div className="contextual-tip__content">
              <h3 className="contextual-tip__title">{tip.title}</h3>
              <p className="contextual-tip__description">{tip.description}</p>
              {tip.actionLabel && tip.actionRoute && (
                <button
                  type="button"
                  className="contextual-tip__action"
                  onClick={() => navigate(tip.actionRoute!)}
                  aria-label={tip.actionLabel}
                >
                  {tip.actionLabel}
                </button>
              )}
            </div>
            <button
              type="button"
              className="contextual-tip__dismiss"
              onClick={() => onDismiss(tip.id)}
              aria-label={`Dismiss tip: ${tip.title}`}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
};

export default ContextualTips;
