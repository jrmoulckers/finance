// SPDX-License-Identifier: BUSL-1.1

/**
 * Milestone Celebration — confetti/sparkle overlay for achievements.
 *
 * Displays an animated celebration when the user reaches a milestone.
 * Respects `prefers-reduced-motion` by falling back to a static badge.
 * Screen readers are notified via `aria-live`.
 *
 * @module components/celebrations/MilestoneCelebration
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppIcon } from '../icons';

import type { Milestone, MilestoneType } from '../../hooks/useMilestones';
import { useReducedMotion } from '../../hooks/useReducedMotion';

import './milestone-celebration.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Props for {@link MilestoneCelebration}. */
export interface MilestoneCelebrationProps {
  /** The milestone to celebrate. */
  milestone: Milestone;
  /** Called when the user dismisses the celebration. */
  onDismiss: (type: MilestoneType) => void;
  /** Called when the user clicks "Don't show again". */
  onDismissPermanently: (type: MilestoneType) => void;
  /** Optional CSS class name. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Render an animated celebration overlay for a milestone achievement.
 */
export const MilestoneCelebration: React.FC<MilestoneCelebrationProps> = ({
  milestone,
  onDismiss,
  onDismissPermanently,
  className = '',
}) => {
  const reducedMotion = useReducedMotion();
  const dismissRef = useRef<HTMLButtonElement>(null);

  // Focus the dismiss button when the celebration appears
  useEffect(() => {
    requestAnimationFrame(() => {
      dismissRef.current?.focus();
    });
  }, []);

  const handleDismiss = useCallback(() => {
    onDismiss(milestone.type);
  }, [milestone.type, onDismiss]);

  const handleDontShowAgain = useCallback(() => {
    onDismissPermanently(milestone.type);
  }, [milestone.type, onDismissPermanently]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDismiss();
      }
    },
    [handleDismiss],
  );

  return (
    <div
      className={`milestone-celebration ${reducedMotion ? 'milestone-celebration--static' : ''} ${className}`}
      role="status"
      aria-live="polite"
      onKeyDown={handleKeyDown}
      data-testid="milestone-celebration"
      data-milestone-type={milestone.type}
    >
      {/* Sparkle particles (hidden from assistive technology) */}
      {!reducedMotion && (
        <div className="milestone-celebration__sparkles" aria-hidden="true">
          <span className="milestone-celebration__sparkle" />
          <span className="milestone-celebration__sparkle" />
          <span className="milestone-celebration__sparkle" />
          <span className="milestone-celebration__sparkle" />
        </div>
      )}

      {/* Icon */}
      <span className="milestone-celebration__icon" aria-hidden="true">
        <AppIcon name={milestone.icon} />
      </span>

      {/* Text */}
      <h3 className="milestone-celebration__title">{milestone.title}</h3>
      <p className="milestone-celebration__description">{milestone.description}</p>

      {/* Actions */}
      <div className="milestone-celebration__actions">
        <button
          ref={dismissRef}
          type="button"
          className="milestone-celebration__dismiss"
          onClick={handleDismiss}
          aria-label={`Dismiss ${milestone.title}`}
          data-testid="milestone-dismiss"
        >
          Got it!
        </button>
        <button
          type="button"
          className="milestone-celebration__dont-show"
          onClick={handleDontShowAgain}
          data-testid="milestone-dont-show"
        >
          Don&apos;t show again
        </button>
      </div>
    </div>
  );
};
