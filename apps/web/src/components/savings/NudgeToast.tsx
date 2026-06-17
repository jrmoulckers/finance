// SPDX-License-Identifier: BUSL-1.1

import React from 'react';

import { AppIcon } from '../icons';
import type { SavingsNudge } from '../../lib/savings';

export interface NudgeToastProps {
  readonly nudge: SavingsNudge;
  readonly onDismiss: (nudgeId: string) => void;
  readonly onAction?: (nudge: SavingsNudge) => void;
}

function getToneStyles(tone: SavingsNudge['tone']) {
  switch (tone) {
    case 'warning':
      return {
        background: 'rgba(245, 158, 11, 0.14)',
        borderColor: '#F59E0B',
        icon: 'alert-triangle' as const,
      };
    case 'success':
      return {
        background: 'rgba(5, 150, 105, 0.12)',
        borderColor: '#059669',
        icon: 'check-circle' as const,
      };
    default:
      return {
        background: 'rgba(37, 99, 235, 0.12)',
        borderColor: '#2563EB',
        icon: 'sparkles' as const,
      };
  }
}

export function NudgeToast({ nudge, onDismiss, onAction }: NudgeToastProps) {
  const toneStyles = getToneStyles(nudge.tone);

  return (
    <div
      role={nudge.tone === 'warning' ? 'alert' : 'status'}
      aria-live={nudge.tone === 'warning' ? 'assertive' : 'polite'}
      className="card"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--spacing-3)',
        borderLeft: `4px solid ${toneStyles.borderColor}`,
        background: toneStyles.background,
      }}
    >
      <span aria-hidden="true" style={{ marginTop: '0.2rem' }}>
        <AppIcon name={toneStyles.icon} size={18} />
      </span>
      <div style={{ flex: 1 }}>
        <p className="card__title">AI savings nudge</p>
        <h3 style={{ marginTop: 0, marginBottom: 'var(--spacing-2)' }}>{nudge.title}</h3>
        <p style={{ marginTop: 0, color: 'var(--semantic-text-secondary)' }}>{nudge.message}</p>
        <div style={{ display: 'flex', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
          {onAction ? (
            <button
              type="button"
              className="form-button form-button--secondary"
              onClick={() => onAction(nudge)}
            >
              {nudge.actionLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="form-button form-button--secondary"
            onClick={() => onDismiss(nudge.id)}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export default NudgeToast;
