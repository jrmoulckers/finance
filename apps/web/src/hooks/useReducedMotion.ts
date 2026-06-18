// SPDX-License-Identifier: BUSL-1.1

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
const STORAGE_KEY = 'finance-reduced-motion-preference';
const ATTRIBUTE = 'data-reduced-motion';
const CHANGE_EVENT = 'finance:reduced-motion-preference-change';

function getSystemReducedMotionPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(QUERY).matches;
}

export function getStoredReducedMotionPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function applyReducedMotionPreference(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  if (enabled) {
    document.documentElement.setAttribute(ATTRIBUTE, 'true');
  } else {
    document.documentElement.removeAttribute(ATTRIBUTE);
  }
}

export function setReducedMotionPreference(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // localStorage unavailable — still apply for this session
  }

  applyReducedMotionPreference(enabled);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: enabled }));
  }
}

export function applyStoredReducedMotionPreference(): void {
  applyReducedMotionPreference(
    getSystemReducedMotionPreference() || getStoredReducedMotionPreference(),
  );
}

/**
 * Reactive hook that tracks the user's reduced-motion preference.
 *
 * Returns `true` when the system requests reduced motion or when the app's
 * explicit reduced-motion preference has been enabled and persisted.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => getSystemReducedMotionPreference() || getStoredReducedMotionPreference(),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mql = window.matchMedia(QUERY);
    const update = () => {
      setReduced(mql.matches || getStoredReducedMotionPreference());
    };

    const mediaHandler = () => update();
    const storageHandler = (event: StorageEvent) => {
      if (!event.key || event.key === STORAGE_KEY) {
        update();
      }
    };
    const customHandler = () => update();

    mql.addEventListener('change', mediaHandler);
    window.addEventListener('storage', storageHandler);
    window.addEventListener(CHANGE_EVENT, customHandler);
    update();

    return () => {
      mql.removeEventListener('change', mediaHandler);
      window.removeEventListener('storage', storageHandler);
      window.removeEventListener(CHANGE_EVENT, customHandler);
    };
  }, []);

  return reduced;
}
