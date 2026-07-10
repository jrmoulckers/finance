// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ScrollableRegionProps {
  /**
   * Accessible name announced when a keyboard user focuses the scroll region.
   * Describe the content, e.g. "Investment holdings" — not "scroll area".
   */
  label: string;
  /** Content to make horizontally scrollable (typically a wide `<table>`). */
  children: React.ReactNode;
  /** Extra class names appended after the shared scroll classes. */
  className?: string;
}

// useLayoutEffect logs a warning during SSR; the web app renders on the client,
// but fall back to useEffect when `window` is unavailable so unit tests and any
// server render stay quiet.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Horizontally scrollable, keyboard-accessible wrapper for wide content
 * (primarily data tables) on narrow viewports.
 *
 * Renders the shared `.data-table-scroll themed-scrollbar` container (defined in
 * `styles/tables.css`) and, following the established "responsive table region"
 * pattern, exposes it as a labelled `role="region"`. A `tabIndex` of `0` is
 * applied only while the content actually overflows, so keyboard-only users can
 * scroll to clipped columns (WCAG 2.1.1) without the region becoming a needless
 * tab stop when everything already fits.
 */
export const ScrollableRegion: React.FC<ScrollableRegionProps> = ({
  label,
  children,
  className,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    // +1 tolerates sub-pixel rounding so we don't flag a 1px phantom overflow.
    setOverflowing(el.scrollWidth > el.clientWidth + 1);
  }, []);

  // Re-measure after every commit so newly rendered rows/columns are accounted
  // for; React bails out of the state update when the value is unchanged.
  useIsomorphicLayoutEffect(measure);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      if (typeof window === 'undefined') {
        return undefined;
      }
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    const el = ref.current;
    if (el) {
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, [measure]);

  const classes = ['data-table-scroll', 'themed-scrollbar', className].filter(Boolean).join(' ');

  return (
    <div
      ref={ref}
      className={classes}
      role="region"
      aria-label={label}
      tabIndex={overflowing ? 0 : undefined}
    >
      {children}
    </div>
  );
};

export default ScrollableRegion;
