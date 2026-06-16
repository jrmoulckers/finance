// SPDX-License-Identifier: BUSL-1.1

/**
 * React hook for managing the PWA install prompt lifecycle.
 *
 * Captures the browser's `beforeinstallprompt` event and exposes a
 * declarative API so UI components can show an install banner and
 * trigger installation on demand.
 *
 * The hook is safe to use in browsers that do not fire
 * `beforeinstallprompt` (e.g. Firefox, Safari) — `canInstall` will
 * simply remain `false`.
 *
 * A "dismissed" flag is persisted in `localStorage` so the install
 * banner stays hidden after the user explicitly dismisses it.
 *
 * Usage:
 * ```tsx
 * const { canInstall, install, dismissed, dismiss } = useInstallPrompt();
 * ```
 *
 * References: issue #550
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISMISSED_STORAGE_KEY = 'finance-install-dismissed';
const MEANINGFUL_ACTION_STORAGE_KEY = 'finance-install-meaningful-action-at';
const INSTALL_EDUCATION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const MEANINGFUL_ACTION_EVENT = 'finance:pwa-meaningful-action';

export function recordPwaMeaningfulAction(now = Date.now()): void {
  try {
    localStorage.setItem(MEANINGFUL_ACTION_STORAGE_KEY, String(now));
  } catch {
    // Storage may be unavailable — the event still updates mounted hooks.
  }
  window.dispatchEvent(new CustomEvent(MEANINGFUL_ACTION_EVENT, { detail: { at: now } }));
}

function readTimestamp(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === 'true') return raw === 'true' ? 0 : null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isDismissedWithinCooldown(now = Date.now()): boolean {
  const dismissedAt = readTimestamp(DISMISSED_STORAGE_KEY);
  return dismissedAt !== null && now - dismissedAt < INSTALL_EDUCATION_COOLDOWN_MS;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal typing for the `BeforeInstallPromptEvent` which is not yet
 * part of the standard TypeScript DOM lib.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Return value of {@link useInstallPrompt}. */
export interface UseInstallPromptResult {
  /** `true` when a deferred install prompt is available and not dismissed. */
  canInstall: boolean;
  /** Trigger the native install prompt. Resolves when the user responds. */
  install: () => Promise<void>;
  /** `true` when the user has dismissed education within the 7-day cooldown. */
  dismissed: boolean;
  /** `true` after a meaningful finance action unlocks install education. */
  hasMeaningfulAction: boolean;
  /** `true` when the app is already running in installed display mode. */
  isStandalone: boolean;
  /** Persist a dismissal timestamp so education appears at most once per 7 days. */
  dismiss: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manage the PWA install prompt lifecycle.
 *
 * Captures `beforeinstallprompt`, holds the event until {@link install}
 * is called, and tracks whether the user has dismissed the prompt.
 *
 * @returns An object with install state and actions.
 */
export function useInstallPrompt(): UseInstallPromptResult {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [promptAvailable, setPromptAvailable] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => isDismissedWithinCooldown());
  const [hasMeaningfulAction, setHasMeaningfulAction] = useState<boolean>(
    () => readTimestamp(MEANINGFUL_ACTION_STORAGE_KEY) !== null,
  );
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(display-mode: standalone)').matches;
  });

  // Listen for the browser's install prompt event.
  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      // Prevent the browser's default mini-infobar.
      event.preventDefault();
      deferredPrompt.current = event as BeforeInstallPromptEvent;
      setPromptAvailable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // When the app is installed, clear the deferred prompt.
    const handleAppInstalled = () => {
      deferredPrompt.current = null;
      setPromptAvailable(false);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    const handleMeaningfulAction = () => setHasMeaningfulAction(true);
    window.addEventListener(MEANINGFUL_ACTION_EVENT, handleMeaningfulAction);
    return () => window.removeEventListener(MEANINGFUL_ACTION_EVENT, handleMeaningfulAction);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(display-mode: standalone)');
    const handleChange = () => setIsStandalone(media.matches);
    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  /** Persist a dismissal timestamp so the banner does not reappear for 7 days. */
  const dismiss = useCallback((): void => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_STORAGE_KEY, String(Date.now()));
    } catch {
      // Storage may be unavailable — swallow silently.
    }
  }, []);

  /** Trigger the native install prompt. */
  const install = useCallback(async (): Promise<void> => {
    const prompt = deferredPrompt.current;
    if (!prompt) {
      return;
    }

    const { outcome } = await prompt.prompt();

    // Clear the event — it can only be used once.
    deferredPrompt.current = null;
    setPromptAvailable(false);

    if (outcome === 'dismissed') {
      dismiss();
    }
  }, [dismiss]);

  return {
    canInstall: promptAvailable && hasMeaningfulAction && !dismissed && !isStandalone,
    install,
    dismissed,
    hasMeaningfulAction,
    isStandalone,
    dismiss,
  };
}
