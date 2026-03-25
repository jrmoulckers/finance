// SPDX-License-Identifier: BUSL-1.1

import { useEffect } from 'react';

import { useReducedMotion } from '../../../hooks/useReducedMotion';

export type StreakTier = 'bronze' | 'silver' | 'gold';

export interface StreakBadgeProps {
  /** Number of consecutive days in the streak. */
  count: number;
  /** Visual tier of the badge. */
  tier?: StreakTier;
  /** Whether to show the shimmer animation. */
  shimmer?: boolean;
  /** Callback fired when the enter animation finishes. */
  onComplete?: () => void;
  /** Additional CSS class name. */
  className?: string;
}

function defaultTier(count: number): StreakTier {
  if (count >= 30) return 'gold';
  if (count >= 14) return 'silver';
  return 'bronze';
}

/**
 * Animated badge for logging streaks.
 *
 * Pops in with a bounce and optionally shimmers. The flame icon
 * flickers continuously. Respects `prefers-reduced-motion`.
 */
export function StreakBadge({
  count,
  tier,
  shimmer = false,
  onComplete,
  className = '',
}: StreakBadgeProps) {
  const reducedMotion = useReducedMotion();
  const resolvedTier = tier ?? defaultTier(count);

  useEffect(() => {
    if (reducedMotion) {
      onComplete?.();
      return;
    }

    const timeout = setTimeout(() => {
      onComplete?.();
    }, 800);

    return () => clearTimeout(timeout);
  }, [reducedMotion, onComplete]);

  const staticClass = reducedMotion ? 'streak-badge--static' : '';
  const shimmerClass = !reducedMotion && shimmer ? 'streak-badge--shimmer' : '';

  return (
    <span
      className={`streak-badge streak-badge--${resolvedTier} ${staticClass} ${shimmerClass} ${className}`.trim()}
      role="img"
      aria-label={`${count} day streak — ${resolvedTier} tier`}
      data-testid="streak-badge"
    >
      <span
        className={`streak-badge__flame${reducedMotion ? ' streak-badge__flame--static' : ''}`}
        aria-hidden="true"
      >
        🔥
      </span>
      <span className="streak-badge__count">{count}</span>
      <span className="streak-badge__label">day streak</span>
    </span>
  );
}

export default StreakBadge;
