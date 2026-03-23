// SPDX-License-Identifier: BUSL-1.1

import { useCallback, useEffect, useRef, useState } from 'react';
import serviceWorkerUrl from '../sw/service-worker.ts?worker&url';

import type { ClientToSwMessage } from '../db/sync/types';

export interface UseServiceWorkerUpdateResult {
  updateAvailable: boolean;
  applyUpdate: () => void;
}

/** Listen for waiting service workers and expose a way to activate them immediately. */
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

    navigator.serviceWorker
      .register(serviceWorkerUrl, { scope: '/', type: 'module' })
      .then((registration) => {
        if (mounted) {
          monitorRegistration(registration);
        }
      })
      .catch(() => {
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
