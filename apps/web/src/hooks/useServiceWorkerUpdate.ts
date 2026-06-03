// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useRef, useState } from 'react';
import { registerAppServiceWorker } from '../sw/register';

import type { ClientToSwMessage } from '../db/sync/types';

export interface UseServiceWorkerUpdateResult {
  updateAvailable: boolean;
  applyUpdate: () => void;
}

/**
 * Listen for waiting service workers and expose a way to activate them
 * immediately.
 *
 * The actual SW registration happens at app boot in `main.tsx` via
 * {@link registerAppServiceWorker} (#1965) — this hook reuses the
 * resulting Registration rather than registering its own, so the SW is
 * installed even on anonymous routes where this hook never mounts.
 */
export function useServiceWorkerUpdate(): UseServiceWorkerUpdateResult {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    let mounted = true;

    const trackInstallingWorker = (
      registration: ServiceWorkerRegistration,
      worker: ServiceWorker,
    ): void => {
      worker.addEventListener('statechange', () => {
        if (
          worker.state === 'installed' &&
          registration.waiting &&
          navigator.serviceWorker.controller &&
          mounted
        ) {
          registrationRef.current = registration;
          setUpdateAvailable(true);
        }
      });
    };

    const monitorRegistration = (registration: ServiceWorkerRegistration): void => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        registrationRef.current = registration;
        setUpdateAvailable(true);
      }

      if (registration.installing) {
        trackInstallingWorker(registration, registration.installing);
      }

      registration.addEventListener('updatefound', () => {
        if (registration.installing) {
          trackInstallingWorker(registration, registration.installing);
        }
      });
    };

    registerAppServiceWorker()
      .then((registration) => {
        if (mounted && registration) {
          monitorRegistration(registration);
        }
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console -- dev visibility; SW errors are non-fatal
        console.error('[sw] registration failed', err);
        registrationRef.current = null;
        setUpdateAvailable(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const applyUpdate = useCallback((): void => {
    const waitingWorker = registrationRef.current?.waiting;
    if (!waitingWorker) {
      return;
    }

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        window.location.reload();
      },
      { once: true },
    );

    const message: ClientToSwMessage = { type: 'SKIP_WAITING' };
    waitingWorker.postMessage(message);
  }, []);

  return { updateAvailable, applyUpdate };
}
