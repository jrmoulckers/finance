// SPDX-License-Identifier: BUSL-1.1

/**
 * useDeepLink — Deep link parser for application routes.
 *
 * Extracts route parameters from URL patterns like `/accounts/:id` and
 * `/transactions/:id`. Supports SPA navigation and external deep links.
 *
 * @example
 * ```tsx
 * const { params, matchedRoute } = useDeepLink('/accounts/:id', location.pathname);
 * // If pathname is '/accounts/abc-123':
 * // params = { id: 'abc-123' }
 * // matchedRoute = '/accounts/:id'
 * ```
 *
 * References: issue #1337
 */

import { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extracted route parameters as key-value pairs. */
export type RouteParams = Record<string, string>;

/** A route pattern definition. */
export interface RoutePattern {
  /** Route pattern with named parameters (e.g., '/accounts/:id'). */
  pattern: string;

  /** Optional label for the route (used in breadcrumbs, etc.). */
  label?: string;
}

/** Result shape returned by {@link useDeepLink}. */
export interface UseDeepLinkResult {
  /** Extracted parameters from the matched route. */
  params: RouteParams;

  /** The pattern that matched, or null if no match. */
  matchedRoute: string | null;

  /** Whether the current path matches any of the provided patterns. */
  isMatch: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Parse a route pattern and attempt to match it against a pathname.
 *
 * @param pattern - Route pattern like '/accounts/:id'
 * @param pathname - Actual URL path to match against
 * @returns Extracted params if matched, null otherwise
 */
export function matchRoute(pattern: string, pathname: string): RouteParams | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: RouteParams = {};

  for (let i = 0; i < patternParts.length; i++) {
    const pPart = patternParts[i];
    const uPart = pathParts[i];

    if (pPart.startsWith(':')) {
      // Named parameter — extract value
      const paramName = pPart.slice(1);
      params[paramName] = decodeURIComponent(uPart);
    } else if (pPart !== uPart) {
      // Static segment mismatch
      return null;
    }
  }

  return params;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook for deep link route matching and parameter extraction.
 *
 * @param patterns - One or more route patterns to match against
 * @param pathname - The current URL pathname
 */
export function useDeepLink(patterns: string | string[], pathname: string): UseDeepLinkResult {
  const patternList = useMemo(() => (Array.isArray(patterns) ? patterns : [patterns]), [patterns]);

  return useMemo(() => {
    for (const pattern of patternList) {
      const params = matchRoute(pattern, pathname);
      if (params !== null) {
        return { params, matchedRoute: pattern, isMatch: true };
      }
    }
    return { params: {}, matchedRoute: null, isMatch: false };
  }, [patternList, pathname]);
}
