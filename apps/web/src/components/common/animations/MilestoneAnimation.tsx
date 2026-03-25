// SPDX-License-Identifier: BUSL-1.1

import { useEffect } from 'react';

import { useReducedMotion } from '../../../hooks/useReducedMotion';

export type MilestoneLevel = 50 | 75 | 100;

export interface MilestoneAnimationProps {
  /** Current percentage achieved (0–100). */
  percentage: number;
  /** The milestone level this animation celebrates. */
  milestone: MilestoneLevel;
  /** Diameter of the ring in CSS pixels. */
  size?: number;
  /** Optional label below the ring (e.g. "Savings Goal"). */
  label?: string;
  /** Callback fired when the animation finishes. */
  onComplete?: () => void;
  /** Additional CSS class name. */
  className?: string;
}

/**
 * Milestone celebration effect with an animated progress ring.
 *
 * Shows an animated fill for 50%, 75%, and 100% milestones with
 * a star pop-in at 100%. Respects `prefers-reduced-motion`.
 */
export function MilestoneAnimation({
  percentage,
  milestone,
  size = 120,
  label,
  onComplete,
  className = '',
}: MilestoneAnimationProps) {
  const reducedMotion = useReducedMotion();

  const radius = (size - 12) / 2; // account for stroke-width: 6 on each side
  const circumference = 2 * Math.PI * radius;
  const displayPct = Math.min(percentage, 100);
  const targetOffset = circumference - (displayPct / 100) * circumference;

  useEffect(() => {
    if (reducedMotion) {
      onComplete?.();
      return;
    }

    // ring (1800ms) + star pop (500ms)
    const timeout = setTimeout(() => {
      onComplete?.();
    }, 2300);

    return () => clearTimeout(timeout);
  }, [reducedMotion, onComplete]);

  const staticSuffix = reducedMotion ? '--static' : '';
  const pulseClass = !reducedMotion && milestone === 100 ? 'milestone-animation--pulse' : '';

  return (
    <div
      className={`milestone-animation ${pulseClass} ${className}`.trim()}
      role="img"
      aria-label={`${milestone}% milestone reached — ${displayPct}% complete`}
      data-testid="milestone-animation"
      style={
        {
          '--ring-circumference': `${circumference}`,
          '--ring-target-offset': `${targetOffset}`,
        } as React.CSSProperties
      }
    >
      <div className="milestone-animation__ring-container" style={{ width: size, height: size }}>
        <svg className="milestone-animation__svg" width={size} height={size}>
          <circle className="milestone-animation__ring-bg" cx={size / 2} cy={size / 2} r={radius} />
          <circle
            className={`milestone-animation__ring-fill milestone-animation__ring-fill--${milestone}${staticSuffix ? ` milestone-animation__ring-fill${staticSuffix}` : ''}`}
            cx={size / 2}
            cy={size / 2}
            r={radius}
          />
        </svg>

        <div className="milestone-animation__center">
          <span className="milestone-animation__percentage">{displayPct}%</span>
          {milestone === 100 && (
            <span
              className={`milestone-animation__star${staticSuffix ? ` milestone-animation__star${staticSuffix}` : ''}`}
              aria-hidden="true"
            >
              ⭐
            </span>
          )}
        </div>
      </div>

      {label && <span className="milestone-animation__label">{label}</span>}
    </div>
  );
}

export default MilestoneAnimation;
