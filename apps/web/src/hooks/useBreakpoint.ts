// SPDX-License-Identifier: BUSL-1.1

/**
 * useBreakpoint — Media query hook for responsive layout decisions.
 *
 * Returns the current breakpoint category (mobile, tablet, or desktop)
 * based on viewport width. Uses matchMedia for efficient listener-based
 * detection instead of polling.
 *
 * Breakpoints:
 *   - mobile: < 768px
 *   - tablet: 768px–1023px
 *   - desktop: >= 1024px
 *
 * @example
 * ```tsx
 * const { breakpoint, isMobile, isTablet, isDesktop } = useBreakpoint();
 * ```
 *
 * References: issue #1336
 */

import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Named breakpoint categories. */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

/** Result shape returned by {@link useBreakpoint}. */
export interface UseBreakpointResult {
  /** The current named breakpoint. */
  breakpoint: Breakpoint;

  /** True when viewport is < 768px. */
  isMobile: boolean;

  /** True when viewport is 768px–1023px. */
  isTablet: boolean;

  /** True when viewport is >= 1024px. */
  isDesktop: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABLET_QUERY = '(min-width: 768px)';
const DESKTOP_QUERY = '(min-width: 1024px)';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Determine the current breakpoint from media query states.
 */
function resolveBreakpoint(isTabletMatch: boolean, isDesktopMatch: boolean): Breakpoint {
  if (isDesktopMatch) return 'desktop';
  if (isTabletMatch) return 'tablet';
  return 'mobile';
}

/**
 * React hook that tracks the current responsive breakpoint.
 */
export function useBreakpoint(): UseBreakpointResult {
  const getBreakpoint = useCallback((): Breakpoint => {
    if (typeof window === 'undefined') return 'desktop';
    const tablet = window.matchMedia(TABLET_QUERY).matches;
    const desktop = window.matchMedia(DESKTOP_QUERY).matches;
    return resolveBreakpoint(tablet, desktop);
  }, []);

  const [breakpoint, setBreakpoint] = useState<Breakpoint>(getBreakpoint);

  useEffect(() => {
    const tabletMq = window.matchMedia(TABLET_QUERY);
    const desktopMq = window.matchMedia(DESKTOP_QUERY);

    const handler = () => {
      setBreakpoint(resolveBreakpoint(tabletMq.matches, desktopMq.matches));
    };

    tabletMq.addEventListener('change', handler);
    desktopMq.addEventListener('change', handler);

    return () => {
      tabletMq.removeEventListener('change', handler);
      desktopMq.removeEventListener('change', handler);
    };
  }, []);

  return {
    breakpoint,
    isMobile: breakpoint === 'mobile',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
  };
}
