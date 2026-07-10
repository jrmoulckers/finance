// SPDX-License-Identifier: BUSL-1.1

import { BREADCRUMB_HISTORY_LIMIT, NAVIGATION_HISTORY_LIMIT } from './guardrails';
import type { NavigationBreadcrumbEntry, NavigationHistoryState } from './types';

const STORAGE_KEY = 'finance:navigation-history:v1';

function createEmptyHistoryState(): NavigationHistoryState {
  return {
    version: 1,
    trail: [],
    visitCounts: {},
    scrollPositions: {},
  };
}

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function readHistoryState(): NavigationHistoryState {
  if (!canUseSessionStorage()) {
    return createEmptyHistoryState();
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyHistoryState();
    }

    const parsed = JSON.parse(raw) as Partial<NavigationHistoryState>;
    return {
      version: 1,
      trail: Array.isArray(parsed.trail) ? parsed.trail : [],
      visitCounts: parsed.visitCounts ?? {},
      scrollPositions: parsed.scrollPositions ?? {},
    };
  } catch {
    return createEmptyHistoryState();
  }
}

function writeHistoryState(state: NavigationHistoryState): void {
  if (!canUseSessionStorage()) {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function recordNavigationEntry(entry: NavigationBreadcrumbEntry): NavigationHistoryState {
  const state = readHistoryState();
  const visitCounts = {
    ...state.visitCounts,
    [entry.path]: (state.visitCounts[entry.path] ?? 0) + 1,
  };
  const trail = state.trail
    .filter((item) => item.key !== entry.key)
    .concat({ ...entry, visitedAt: entry.visitedAt || Date.now() })
    .slice(-NAVIGATION_HISTORY_LIMIT);

  const nextState: NavigationHistoryState = {
    ...state,
    visitCounts,
    trail,
  };

  writeHistoryState(nextState);
  return nextState;
}

export function getBreadcrumbTrail(
  currentPath: string,
  currentTitle: string,
  currentKey: string,
  limit = BREADCRUMB_HISTORY_LIMIT,
): NavigationBreadcrumbEntry[] {
  const state = readHistoryState();
  const withoutCurrent = state.trail.filter((entry) => entry.key !== currentKey);
  const recentEntries = withoutCurrent.slice(-(Math.max(limit, 1) - 1));

  return [
    ...recentEntries,
    { path: currentPath, title: currentTitle, key: currentKey, visitedAt: Date.now() },
  ];
}

export function recordScrollPosition(key: string, x: number, y: number): void {
  if (!key) {
    return;
  }

  const state = readHistoryState();
  const nextState: NavigationHistoryState = {
    ...state,
    scrollPositions: {
      ...state.scrollPositions,
      [key]: { x, y },
    },
  };

  writeHistoryState(nextState);
}

export function getScrollPosition(key: string): { x: number; y: number } | null {
  const position = readHistoryState().scrollPositions[key];
  return position ?? null;
}

export function getVisitCount(path: string): number {
  return readHistoryState().visitCounts[path] ?? 0;
}

/**
 * Snapshot of every recorded route's visit count. Used by the adaptive
 * bottom-nav (#3687) to rank destinations by how often the user visits them.
 */
export function getAllVisitCounts(): Readonly<Record<string, number>> {
  return { ...readHistoryState().visitCounts };
}

/**
 * The most recently visited routes, newest first, de-duplicated by path.
 *
 * Powers the command-palette "Recent" section (#3676). The current route is
 * excluded (navigating to where you already are is never useful) and the list
 * is capped at `limit`.
 */
export function getRecentRoutes(limit = 5, excludePath?: string): NavigationBreadcrumbEntry[] {
  const trail = readHistoryState().trail;
  const seen = new Set<string>();
  const recents: NavigationBreadcrumbEntry[] = [];
  // Walk newest → oldest so the first occurrence of a path wins.
  for (let i = trail.length - 1; i >= 0; i -= 1) {
    const entry = trail[i];
    if (entry.path === excludePath || seen.has(entry.path)) {
      continue;
    }
    seen.add(entry.path);
    recents.push(entry);
    if (recents.length >= limit) {
      break;
    }
  }
  return recents;
}

export function isMuscleMemoryRoute(path: string, minimumVisits = 3): boolean {
  return getVisitCount(path) >= minimumVisits;
}
