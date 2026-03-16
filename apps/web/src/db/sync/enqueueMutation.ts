// SPDX-License-Identifier: BUSL-1.1

/**
 * Main-thread helper for enqueuing offline mutations.
 *
 * After writing to the local SQLite database, call {@link enqueueMutation}
 * to persist the mutation in the IndexedDB queue and signal the service
 * worker to register a Background Sync so the mutation is replayed when
 * the device regains connectivity.
 *
 * This module is designed to be imported by repository-layer code and React
 * hooks -- it must NOT import any React APIs so it can also be used from
 * plain utility functions.
 *
 * References: issue #416
 */

import { WebMutationQueue, type EnqueueInput } from './MutationQueue';
import { SYNC_TAG } from './types';

// ---------------------------------------------------------------------------
// Singleton queue instance
// ---------------------------------------------------------------------------

let _queue: WebMutationQueue | null = null;

/** Lazily initialised singleton to avoid creating the queue at import time. */
function getQueue(): WebMutationQueue {
  if (_queue === null) {
    _queue = new WebMutationQueue();
  }
  return _queue;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueue a mutation for eventual sync and request a Background Sync.
 *
 * This is the primary entry point for the repository / hook layer.  It:
 * 1. Writes the mutation to the IndexedDB queue.
 * 2. Asks the service worker to register a Background Sync so that the
 *    mutation is replayed when connectivity is restored.
 *
 * If Background Sync is not available (e.g. Firefox), the main thread
 * fallback in {@link useSyncStatus} will replay mutations via the
 * `online` event.
 */
export async function enqueueMutation(input: EnqueueInput): Promise<void> {
  const queue = getQueue();
  await queue.enqueue(input);
  requestBackgroundSync();
}

/**
 * Return the number of mutations currently pending in the queue.
 *
 * Useful for badge counts and status indicators.
 */
export async function getPendingMutationCount(): Promise<number> {
  const queue = getQueue();
  return queue.getPendingCount();
}

/**
 * Get direct access to the singleton queue instance.
 *
 * Prefer {@link enqueueMutation} for most use cases.  This is exposed for
 * advanced consumers like the sync-status hook that need to dequeue and
 * acknowledge mutations.
 */
export function getMutationQueue(): WebMutationQueue {
  return getQueue();
}

// ---------------------------------------------------------------------------
// Service-worker messaging
// ---------------------------------------------------------------------------

/**
 * Ask the service worker to register a Background Sync so that pending
 * mutations are replayed when the device regains connectivity.
 *
 * Fails silently when:
 * - No service worker is registered / controlling the page.
 * - Background Sync API is not supported.
 */
function requestBackgroundSync(): void {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    return;
  }

  // Prefer direct registration if the SW registration is available.
  void navigator.serviceWorker.ready
    .then((registration) => {
      if ('sync' in registration) {
        return (
          registration as ServiceWorkerRegistration & {
            sync: { register(tag: string): Promise<void> };
          }
        ).sync.register(SYNC_TAG);
      }
      // Fallback: ask the SW via postMessage.
      navigator.serviceWorker.controller?.postMessage({ type: 'REGISTER_SYNC' });
    })
    .catch(() => {
      // Background Sync not supported -- main-thread fallback will handle it.
    });
}
