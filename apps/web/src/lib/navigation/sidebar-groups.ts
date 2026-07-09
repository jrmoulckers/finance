// SPDX-License-Identifier: BUSL-1.1

/**
 * Persistence for the desktop sidebar's group expand/collapse state (#3640).
 *
 * The sidebar groups (Money, Plan, Insights, Connect) can be expanded or
 * collapsed by the user, but without persistence every navigation and reload
 * reset them to their static defaults. This module stores the user's explicit
 * choice in `localStorage` so it survives route changes and reloads.
 *
 * All access is defensive: when `localStorage` is unavailable (SSR, privacy
 * modes, quota errors) reads return `undefined` and writes are no-ops, so the
 * caller transparently falls back to the static defaults.
 */

const STORAGE_KEY = 'finance.nav.sidebar-groups';

type StoredGroups = Record<string, boolean>;

function readAll(): StoredGroups {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as StoredGroups;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * Returns the stored expanded state for a sidebar group, or `undefined` when
 * the user has never toggled it (so the caller uses its static default).
 */
export function getStoredGroupExpanded(group: string): boolean | undefined {
  const value = readAll()[group];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Persists the expanded state for a sidebar group. No-ops when storage is
 * unavailable.
 */
export function setStoredGroupExpanded(group: string, expanded: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    const next = { ...readAll(), [group]: expanded };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore write failures (quota / disabled storage) — the sidebar still
    // works, it just won't remember this session's choice.
  }
}

/** Exposed for tests. */
export const SIDEBAR_GROUPS_STORAGE_KEY = STORAGE_KEY;
