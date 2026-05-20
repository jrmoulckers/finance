// SPDX-License-Identifier: BUSL-1.1

/**
 * Hook for announcing dynamic content changes to screen readers.
 *
 * Wraps the low-level `announce()` utility from `accessibility/aria.ts`
 * in a React hook with debouncing to prevent announcement floods
 * (e.g., rapid balance updates during sync).
 *
 * @module hooks/useAnnouncer
 * @see accessibility/aria.ts — underlying announce() function
 *
 * References: issue #1684
 */

import { useCallback, useRef } from 'react';
import { announce } from '../accessibility/aria';

export interface UseAnnouncerOptions {
  /** Minimum interval (ms) between announcements. @default 500 */
  debounceMs?: number;
  /** Politeness level. @default 'polite' */
  politeness?: 'polite' | 'assertive';
}

export interface UseAnnouncerResult {
  /** Announce a message to screen readers, respecting debounce interval. */
  announce: (message: string) => void;
  /** Announce immediately, bypassing debounce. Use for critical alerts only. */
  announceNow: (message: string) => void;
}

/**
 * React hook for debounced screen-reader announcements.
 *
 * Prevents announcement flooding during rapid state changes like
 * real-time balance updates or sync status transitions. Uses the
 * global `announce()` utility which manages persistent aria-live
 * regions in the DOM.
 *
 * @example
 * ```tsx
 * const { announce } = useAnnouncer();
 *
 * useEffect(() => {
 *   announce(`Net worth updated to ${formatCurrency(netWorth)}`);
 * }, [netWorth, announce]);
 * ```
 */
export function useAnnouncer(options: UseAnnouncerOptions = {}): UseAnnouncerResult {
  const { debounceMs = 500, politeness = 'polite' } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedAnnounce = useCallback(
    (message: string) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        announce(message, politeness);
        timerRef.current = null;
      }, debounceMs);
    },
    [debounceMs, politeness],
  );

  const announceNow = useCallback(
    (message: string) => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      announce(message, politeness);
    },
    [politeness],
  );

  return { announce: debouncedAnnounce, announceNow };
}
