// SPDX-License-Identifier: BUSL-1.1

import { useEffect, useState } from 'react';

import { useReducedMotion } from './useReducedMotion';

/**
 * Lifecycle stage of a mount/exit transition.
 *
 * - `entering` — mounted, initial (pre-animation) styles applied this frame.
 * - `entered` — enter animation is running / has completed; content visible.
 * - `exiting` — exit animation is running; content still mounted.
 * - `exited` — fully hidden; the consumer should unmount its content.
 */
export type MountTransitionStage = 'entering' | 'entered' | 'exiting' | 'exited';

/**
 * Default enter duration in milliseconds. Mirrors the `--duration-normal`
 * motion token (`duration.normal`, 250ms) so JS unmount timing stays in sync
 * with the token-driven CSS transition.
 */
export const DEFAULT_ENTER_DURATION_MS = 250;

/**
 * Default exit duration in milliseconds. Mirrors the `--duration-fast` motion
 * token (`duration.fast`, 150ms).
 */
export const DEFAULT_EXIT_DURATION_MS = 150;

/** Options for {@link useMountTransition}. */
export interface UseMountTransitionOptions {
  /** Whether the content should currently be shown. */
  isVisible: boolean;
  /**
   * Enter animation duration in ms. Defaults to {@link DEFAULT_ENTER_DURATION_MS}
   * (the `--duration-normal` token).
   */
  enterDuration?: number;
  /**
   * Exit animation duration in ms — the hook keeps the content mounted for this
   * long after `isVisible` becomes false. Defaults to
   * {@link DEFAULT_EXIT_DURATION_MS} (the `--duration-fast` token).
   */
  exitDuration?: number;
  /**
   * Force reduced-motion behavior. Defaults to the live `useReducedMotion()`
   * preference (which honors `prefers-reduced-motion: reduce` and
   * `html[data-reduced-motion='true']`). Exposed mainly for testing and
   * fully-controlled usage.
   */
  reducedMotion?: boolean;
}

/** Result of {@link useMountTransition}. */
export interface MountTransitionResult {
  /** Whether the consumer should render its content this frame. */
  shouldRender: boolean;
  /** Current lifecycle stage, suitable for driving enter/exit CSS classes. */
  stage: MountTransitionStage;
}

function scheduleFrame(callback: () => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(callback);
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }

  const timer = setTimeout(callback, 0);
  return () => clearTimeout(timer);
}

/**
 * Reduced-motion-safe mount/exit transition primitive.
 *
 * Standardizes the "animate in on mount, animate out before unmount" pattern so
 * banners, panels, and list items don't each re-implement (and occasionally
 * forget) the `prefers-reduced-motion` guard. The hook owns the mount lifecycle
 * and exposes a `stage` for driving CSS classes plus `shouldRender` for delaying
 * unmount until the exit animation completes.
 *
 * Under reduced motion the transition collapses to an instant show/hide: no
 * timers are scheduled and `shouldRender` tracks `isVisible` synchronously.
 *
 * Durations are token-driven (see {@link DEFAULT_ENTER_DURATION_MS} /
 * {@link DEFAULT_EXIT_DURATION_MS}); the accompanying CSS classes should use the
 * matching `--duration-*` / `--easing-*` custom properties.
 *
 * @example
 * ```tsx
 * const { shouldRender, stage } = useMountTransition({ isVisible: open });
 * return shouldRender ? (
 *   <div className={`fade fade--${stage}`}>…</div>
 * ) : null;
 * ```
 */
export function useMountTransition({
  isVisible,
  exitDuration = DEFAULT_EXIT_DURATION_MS,
  reducedMotion,
}: UseMountTransitionOptions): MountTransitionResult {
  const systemReducedMotion = useReducedMotion();
  const prefersReducedMotion = reducedMotion ?? systemReducedMotion;

  const [stage, setStage] = useState<MountTransitionStage>(() => {
    if (!isVisible) {
      return 'exited';
    }
    return prefersReducedMotion ? 'entered' : 'entering';
  });

  useEffect(() => {
    if (prefersReducedMotion) {
      setStage(isVisible ? 'entered' : 'exited');
      return undefined;
    }

    if (isVisible) {
      setStage('entering');
      const cancelFrame = scheduleFrame(() => setStage('entered'));
      return cancelFrame;
    }

    setStage((previous) => (previous === 'exited' ? 'exited' : 'exiting'));
    const timer = setTimeout(() => setStage('exited'), exitDuration);
    return () => clearTimeout(timer);
  }, [isVisible, prefersReducedMotion, exitDuration]);

  return {
    shouldRender: stage !== 'exited',
    stage,
  };
}
