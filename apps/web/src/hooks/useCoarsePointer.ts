// SPDX-License-Identifier: BUSL-1.1

/**
 * useCoarsePointer — detects whether the primary input is a coarse/touch pointer.
 *
 * Swipe and long-press gestures only exist on touch devices, so swipe-specific
 * UI hints should be gated behind this check. Mouse + keyboard users otherwise
 * see guidance for gestures their device cannot perform — a confusing and
 * accessibility-unfriendly papercut.
 *
 * Detection mirrors the established `useReducedMotion` / `useBreakpoint`
 * matchMedia pattern. A device is treated as coarse/touch when its primary
 * pointer is coarse (`(pointer: coarse)`) or it has no hover-capable pointer
 * (`(hover: none)`). A desktop with a mouse matches neither and is reported as
 * a fine pointer.
 *
 * References: issue #3143
 */

import { useEffect, useState } from 'react';

const COARSE_POINTER_QUERY = '(pointer: coarse)';
const NO_HOVER_QUERY = '(hover: none)';

/**
 * Pure, non-reactive check for a coarse/touch primary pointer.
 *
 * SSR- and test-safe: returns `false` when `matchMedia` is unavailable.
 *
 * @returns `true` on touch-primary devices, `false` for mouse + keyboard.
 */
export function prefersCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return (
    window.matchMedia(COARSE_POINTER_QUERY).matches || window.matchMedia(NO_HOVER_QUERY).matches
  );
}

/**
 * Reactive hook that tracks whether the primary pointer is coarse/touch.
 *
 * Returns `true` on touch-primary devices and `false` for mouse + keyboard.
 * Re-evaluates if the pointing capability changes (e.g. a tablet docked to a
 * mouse, or a convertible laptop folding into tablet mode).
 *
 * @returns `true` when the primary pointer is coarse/touch.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(prefersCoarsePointer);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const coarsePointerMql = window.matchMedia(COARSE_POINTER_QUERY);
    const noHoverMql = window.matchMedia(NO_HOVER_QUERY);

    const update = () => {
      setCoarse(coarsePointerMql.matches || noHoverMql.matches);
    };

    coarsePointerMql.addEventListener('change', update);
    noHoverMql.addEventListener('change', update);
    update();

    return () => {
      coarsePointerMql.removeEventListener('change', update);
      noHoverMql.removeEventListener('change', update);
    };
  }, []);

  return coarse;
}
