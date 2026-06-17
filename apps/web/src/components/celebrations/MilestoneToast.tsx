// SPDX-License-Identifier: BUSL-1.1

import { useEffect, useRef } from 'react';

import { ConfettiAnimation } from '../common';
import { AppIcon } from '../icons';
import type { DetectedMilestone } from '../../lib/milestones';

import './milestone-toast.css';

const AUTO_DISMISS_MS = 8_000;

export interface MilestoneToastProps {
  readonly milestone: DetectedMilestone;
  readonly onDismiss: (milestoneId: string) => void;
}

export function MilestoneToast({ milestone, onDismiss }: MilestoneToastProps) {
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    dismissTimerRef.current = setTimeout(() => {
      onDismiss(milestone.id);
    }, AUTO_DISMISS_MS);

    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [milestone.id, onDismiss]);

  return (
    <div
      className={`milestone-toast milestone-toast--${milestone.category}`}
      role="status"
      aria-live="polite"
      data-testid="milestone-toast"
    >
      {milestone.confetti ? (
        <div className="milestone-toast__confetti" aria-hidden="true">
          <ConfettiAnimation width={320} height={180} particleCount={48} duration={1800} />
        </div>
      ) : null}
      <div className="milestone-toast__icon">
        <AppIcon name={milestone.icon} size={20} />
      </div>
      <div className="milestone-toast__content">
        <span className="milestone-toast__badge">{milestone.badge}</span>
        <h3 className="milestone-toast__title">{milestone.title}</h3>
        <p className="milestone-toast__message">{milestone.message}</p>
      </div>
      <button
        type="button"
        className="milestone-toast__dismiss"
        onClick={() => onDismiss(milestone.id)}
        aria-label="Dismiss milestone celebration"
      >
        ×
      </button>
    </div>
  );
}
