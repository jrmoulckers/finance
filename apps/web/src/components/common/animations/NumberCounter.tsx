// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '../../../hooks/useReducedMotion';

export interface NumberCounterProps {
  /** The target number to count up to. */
  target: number;
  /** Starting value (defaults to 0). */
  from?: number;
  /** Animation duration in milliseconds. */
  duration?: number;
  /** Custom formatter (e.g. currency formatting). */
  formatter?: (value: number) => string;
  /** Callback fired when the counter reaches the target. */
  onComplete?: () => void;
  /** Accessible label for screen readers. */
  'aria-label'?: string;
  /** Additional CSS class name. */
  className?: string;
}

function defaultFormatter(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Smooth count-up animation for financial amounts.
 *
 * Uses `requestAnimationFrame` with an ease-out curve for natural deceleration.
 * When `prefers-reduced-motion: reduce` is active, the target value is shown immediately.
 */
export function NumberCounter({
  target,
  from = 0,
  duration = 1200,
  formatter = defaultFormatter,
  onComplete,
  'aria-label': ariaLabel,
  className = '',
}: NumberCounterProps) {
  const reducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(reducedMotion ? target : from);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  // Ease-out cubic for natural deceleration
  const easeOut = useCallback((t: number) => 1 - Math.pow(1 - t, 3), []);

  useEffect(() => {
    if (reducedMotion) {
      setDisplayValue(target);
      onComplete?.();
      return;
    }

    const range = target - from;
    startTimeRef.current = 0;

    const tick = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOut(progress);
      const currentValue = from + range * easedProgress;

      setDisplayValue(currentValue);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayValue(target);
        onComplete?.();
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, from, duration, reducedMotion, easeOut, onComplete]);

  return (
    <span
      className={`number-counter ${!reducedMotion ? 'number-counter--animating' : ''} ${className}`.trim()}
      role="status"
      aria-label={ariaLabel ?? `Value: ${formatter(target)}`}
      aria-live="polite"
      data-testid="number-counter"
    >
      {formatter(displayValue)}
    </span>
  );
}

export default NumberCounter;
