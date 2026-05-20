// SPDX-License-Identifier: BUSL-1.1

/**
 * Hook that detects the current browser font scale factor.
 *
 * Monitors the effective root font size relative to the browser
 * default of 16px. This enables components to adapt their layout
 * when users have enlarged their browser font size (e.g., switching
 * to stacked layouts at 150%+).
 *
 * WCAG 2.2 SC 1.4.4 requires content to remain usable at 200% text
 * size. This hook provides the scale factor so components can
 * proactively adjust before content clips or overflows.
 *
 * @module hooks/useFontScale
 * References: issue #1680
 */

import { useEffect, useState } from 'react';

/**
 * Get the current font scale factor relative to the 16px default.
 *
 * @returns The scale factor (e.g., 1.0 = default, 1.5 = 150%, 2.0 = 200%).
 */
function getFontScale(): number {
  if (typeof window === 'undefined') return 1;
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return rootFontSize / 16;
}

export interface UseFontScaleResult {
  /** Current font scale factor (1.0 = browser default 16px). */
  scale: number;
  /** Whether font size is enlarged (scale > 1.0). */
  isEnlarged: boolean;
  /** Whether font size is at or above 200% (WCAG 1.4.4 threshold). */
  isLargeScale: boolean;
}

/**
 * React hook that reactively tracks browser font scaling.
 *
 * Returns the current scale factor and boolean flags for
 * conditional layout adjustments.
 *
 * @example
 * ```tsx
 * const { isLargeScale } = useFontScale();
 *
 * return (
 *   <div className={isLargeScale ? 'stacked-layout' : 'side-by-side-layout'}>
 *     ...
 *   </div>
 * );
 * ```
 */
export function useFontScale(): UseFontScaleResult {
  const [scale, setScale] = useState(getFontScale);

  useEffect(() => {
    // ResizeObserver on documentElement detects font size changes
    const observer = new ResizeObserver(() => {
      setScale(getFontScale());
    });

    observer.observe(document.documentElement);

    return () => observer.disconnect();
  }, []);

  return {
    scale,
    isEnlarged: scale > 1,
    isLargeScale: scale >= 2,
  };
}
