// SPDX-License-Identifier: BUSL-1.1

export const SIMPLIFIED_MODE_STORAGE_KEY = 'finance-simplified-mode';
export const SINGLE_KEY_SHORTCUTS_STORAGE_KEY = 'finance-single-key-shortcuts-enabled';
export const SINGLE_KEY_SHORTCUTS_CHANGE_EVENT = 'finance:single-key-shortcuts-change';
const COGNITIVE_ATTRIBUTE = 'data-a11y-cognitive';

/**
 * Whether the user has requested reduced motion.
 *
 * Returns `true` when either the OS-level `prefers-reduced-motion: reduce`
 * media query matches, or the app-level `html[data-reduced-motion='true']`
 * override is set. Use this single helper instead of ad-hoc `matchMedia`
 * checks so motion decisions stay consistent across the app.
 */
export function prefersReducedMotion(): boolean {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-reduced-motion');
    if (attr === 'true') return true;
  }
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function getStoredSimplifiedModePreference(): boolean {
  try {
    return localStorage.getItem(SIMPLIFIED_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function applySimplifiedModePreference(enabled: boolean): void {
  if (typeof document === 'undefined') return;

  if (enabled) {
    document.documentElement.setAttribute(COGNITIVE_ATTRIBUTE, 'true');
  } else {
    document.documentElement.removeAttribute(COGNITIVE_ATTRIBUTE);
  }
}

export function setSimplifiedModePreference(enabled: boolean): void {
  try {
    localStorage.setItem(SIMPLIFIED_MODE_STORAGE_KEY, String(enabled));
  } catch {
    // localStorage unavailable — still apply for this session
  }

  applySimplifiedModePreference(enabled);
}

export function applyStoredSimplifiedModePreference(): void {
  applySimplifiedModePreference(getStoredSimplifiedModePreference());
}

export function getStoredSingleKeyShortcutsPreference(): boolean {
  try {
    const stored = localStorage.getItem(SINGLE_KEY_SHORTCUTS_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

export function setSingleKeyShortcutsPreference(enabled: boolean): void {
  try {
    localStorage.setItem(SINGLE_KEY_SHORTCUTS_STORAGE_KEY, String(enabled));
  } catch {
    // localStorage unavailable — still notify the current tab.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SINGLE_KEY_SHORTCUTS_CHANGE_EVENT, { detail: enabled }));
  }
}
