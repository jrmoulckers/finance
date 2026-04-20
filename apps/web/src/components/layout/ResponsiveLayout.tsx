// SPDX-License-Identifier: BUSL-1.1

/**
 * Responsive layout container components.
 *
 * Provides declarative responsive layout primitives that consume the design
 * token breakpoints. Components render semantic HTML and add minimal CSS
 * utility classes — no inline styles (CSP compliant).
 *
 * Components:
 *   - `ResponsiveContainer` — max-width content wrapper with centered padding
 *   - `ResponsiveGrid` — auto-fill grid that adapts column count to viewport
 *   - `ResponsiveStack` — column on mobile, row on desktop
 *   - `useBreakpoint` — hook for programmatic breakpoint detection
 *
 * All layout uses CSS custom properties from the design token system.
 *
 * References: issue #627, #309
 */

import React, { useMemo, useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Breakpoint hook
// ---------------------------------------------------------------------------

/** Named breakpoint tiers matching the design token system. */
export type BreakpointTier = 'mobile' | 'tablet' | 'desktop' | 'widescreen';

/** Breakpoint pixel values (must match breakpoints.css). */
const BREAKPOINTS = {
  tablet: 640,
  desktop: 1024,
  widescreen: 1440,
} as const;

function getCurrentBreakpoint(): BreakpointTier {
  if (typeof window === 'undefined') return 'mobile';
  const width = window.innerWidth;
  if (width >= BREAKPOINTS.widescreen) return 'widescreen';
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
}

function subscribeResize(callback: () => void): () => void {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

function getServerBreakpoint(): BreakpointTier {
  return 'mobile'; // SSR-safe default: mobile-first
}

/**
 * React hook that returns the current viewport breakpoint tier.
 *
 * Re-renders the component when the viewport crosses a breakpoint boundary.
 *
 * Usage:
 * ```tsx
 * const breakpoint = useBreakpoint();
 * const isMobile = breakpoint === 'mobile';
 * ```
 */
export function useBreakpoint(): BreakpointTier {
  return useSyncExternalStore(subscribeResize, getCurrentBreakpoint, getServerBreakpoint);
}

/**
 * Returns `true` when the viewport is at or above the given tier.
 */
export function useMinBreakpoint(minTier: BreakpointTier): boolean {
  const current = useBreakpoint();
  const tiers: BreakpointTier[] = ['mobile', 'tablet', 'desktop', 'widescreen'];
  return tiers.indexOf(current) >= tiers.indexOf(minTier);
}

// ---------------------------------------------------------------------------
// ResponsiveContainer
// ---------------------------------------------------------------------------

export interface ResponsiveContainerProps {
  /** Maximum width. Defaults to 'default' (1200px). */
  maxWidth?: 'narrow' | 'default' | 'wide' | 'full';
  /** HTML element to render. Defaults to 'div'. */
  as?: 'div' | 'section' | 'article' | 'main';
  /** Additional CSS class names. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Max-width content container with responsive horizontal padding.
 *
 * Renders a semantic HTML element with centered content and responsive
 * padding that increases at larger breakpoints.
 */
export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  maxWidth = 'default',
  as: Element = 'div',
  className,
  children,
}) => {
  const classes = useMemo(() => {
    const parts = ['responsive-container', `responsive-container--${maxWidth}`];
    if (className) parts.push(className);
    return parts.join(' ');
  }, [maxWidth, className]);

  return <Element className={classes}>{children}</Element>;
};

// ---------------------------------------------------------------------------
// ResponsiveGrid
// ---------------------------------------------------------------------------

export interface ResponsiveGridProps {
  /** Minimum column width. Defaults to 280px. */
  minColWidth?: string;
  /** Gap between grid items. Defaults to '--spacing-4'. */
  gap?: string;
  /** Additional CSS class names. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Auto-fill responsive grid.
 *
 * Uses CSS Grid `auto-fill` with `minmax()` to create a grid that
 * automatically adjusts column count based on available space.
 */
export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({ className, children }) => {
  const classes = useMemo(() => {
    const parts = ['responsive-grid'];
    if (className) parts.push(className);
    return parts.join(' ');
  }, [className]);

  return <div className={classes}>{children}</div>;
};

// ---------------------------------------------------------------------------
// ResponsiveStack
// ---------------------------------------------------------------------------

export interface ResponsiveStackProps {
  /** Breakpoint at which to switch from column to row. Defaults to 'tablet'. */
  breakAt?: 'tablet' | 'desktop';
  /** Gap between items. */
  gap?: string;
  /** Vertical alignment for row layout. */
  align?: 'start' | 'center' | 'end' | 'stretch';
  /** Additional CSS class names. */
  className?: string;
  children: React.ReactNode;
}

/**
 * Stack layout: column on mobile, row at specified breakpoint.
 *
 * Provides a common pattern for form layouts, card rows, and action bars
 * that should stack vertically on small screens.
 */
export const ResponsiveStack: React.FC<ResponsiveStackProps> = ({
  breakAt = 'tablet',
  align = 'stretch',
  className,
  children,
}) => {
  const classes = useMemo(() => {
    const parts = [
      'responsive-stack',
      `responsive-stack--break-${breakAt}`,
      `responsive-stack--align-${align}`,
    ];
    if (className) parts.push(className);
    return parts.join(' ');
  }, [breakAt, align, className]);

  return <div className={classes}>{children}</div>;
};
