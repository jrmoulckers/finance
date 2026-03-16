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
  /** `true` when the user has previously dismissed the install banner. */
  dismissed: boolean;
  /** Persist a dismissal flag so the banner does not reappear. */
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
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISSED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
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
      setDismissed(true);
      try {
        localStorage.setItem(DISMISSED_STORAGE_KEY, 'true');
      } catch {
        // Storage may be unavailable — swallow silently.
      }
    }
  }, []);

  /** Persist a dismissal flag so the banner does not reappear. */
  const dismiss = useCallback((): void => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_STORAGE_KEY, 'true');
    } catch {
      // Storage may be unavailable — swallow silently.
    }
  }, []);

  return {
    canInstall: promptAvailable && !dismissed,
    install,
    dismissed,
    dismiss,
  };
}
