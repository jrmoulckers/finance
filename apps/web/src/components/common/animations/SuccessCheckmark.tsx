// SPDX-License-Identifier: BUSL-1.1

import { useEffect } from 'react';

import { useReducedMotion } from '../../../hooks/useReducedMotion';

export interface SuccessCheckmarkProps {
  /** Diameter of the checkmark circle in CSS pixels. */
  size?: number;
  /** Color of the checkmark and circle stroke. */
  color?: string;
  /** Callback fired when the animation finishes. */
  onComplete?: () => void;
  /** Additional CSS class name. */
  className?: string;
}

/**
 * Animated SVG checkmark for successful save / create operations.
 *
 * The circle draws in first, then the check path follows.
 * When `prefers-reduced-motion: reduce` is active, both elements render
 * immediately in their final state.
 */
export function SuccessCheckmark({
  size = 56,
  color = 'var(--semantic-status-positive)',
  onComplete,
  className = '',
}: SuccessCheckmarkProps) {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      onComplete?.();
      return;
    }

    // Total animation: circle (600ms) + check (300ms) + scale bounce (400ms)
    const timeout = setTimeout(() => {
      onComplete?.();
    }, 1300);

    return () => clearTimeout(timeout);
  }, [reducedMotion, onComplete]);

  const staticClass = reducedMotion ? '--static' : '';

  return (
    <div
      className={`success-checkmark ${reducedMotion ? '' : 'success-checkmark--animated'} ${className}`.trim()}
      role="img"
      aria-label="Success"
      data-testid="success-checkmark"
    >
      <svg
        className="success-checkmark__svg"
        width={size}
        height={size}
        viewBox="0 0 52 52"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className={`success-checkmark__circle${staticClass ? ' success-checkmark__circle' + staticClass : ''}`}
          cx="26"
          cy="26"
          r="25"
          fill="none"
          stroke={color}
          strokeWidth="2"
        />
        <path
          className={`success-checkmark__check${staticClass ? ' success-checkmark__check' + staticClass : ''}`}
          fill="none"
          stroke={color}
          strokeWidth="3"
          d="M14.1 27.2l7.1 7.2 16.7-16.8"
        />
      </svg>
    </div>
  );
}

export default SuccessCheckmark;
