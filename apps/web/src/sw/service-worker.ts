// SPDX-License-Identifier: BUSL-1.1

/**
 * Service Worker for the Finance PWA.
 *
 * Caching strategies:
 *   - Cache-first -- static assets (JS, CSS, images, fonts, WASM)
 *   - Network-first -- API calls (`/api/`)
 *
 * Offline mutation replay:
 *   Listens for the Background Sync API `sync` event and replays queued
 *   mutations from the IndexedDB-backed {@link WebMutationQueue}.  When
 *   Background Sync is not available the main thread falls back to the
 *   `online` event (see {@link useSyncStatus}).
 *
 * Cache versioning is enforced: when CACHE_VERSION changes, old caches
 * are automatically purged during activation.
 *
 * References: issues #58, #416
 */

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { replayMutations } from '../db/sync/replayMutations';
import { SYNC_TAG, type ClientToSwMessage, type SwToClientMessage } from '../db/sync/types';

// ---------------------------------------------------------------------------
// Cache configuration
// ---------------------------------------------------------------------------

/** Bump this value to invalidate all caches on the next deploy. */
const CACHE_VERSION = 'v1';

/** Cache bucket names. */
const STATIC_CACHE = `finance-static-${CACHE_VERSION}`;
const API_CACHE = `finance-api-${CACHE_VERSION}`;

/**
 * App-shell resources to pre-cache during installation.
 *
 * These URLs are cache-first and guarantee the app loads offline.
 * Update this list whenever the build output changes.
 */
const APP_SHELL: string[] = ['/', '/index.html', '/manifest.json'];

/**
 * File-extension patterns that qualify for cache-first treatment.
 * Matched against the URL pathname.
 */
const STATIC_EXTENSIONS = /\.(js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|ico|webp|avif|wasm)$/i;

// ---------------------------------------------------------------------------
// Install -- pre-cache app shell
// ---------------------------------------------------------------------------

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  // Activate immediately without waiting for existing clients to close
  void self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate -- purge stale caches
// ---------------------------------------------------------------------------

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  // Take control of all open tabs immediately
  void self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch -- strategy router
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // API requests -> network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets & app shell -> cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation requests (HTML) -> cache-first (SPA)
  if (request.mode === 'navigate') {
    event.respondWith(cacheFirst(request, '/index.html'));
    return;
  }

  // Everything else -- try cache, fall back to network
  event.respondWith(cacheFirst(request));
});

// ---------------------------------------------------------------------------
// Background Sync -- replay offline mutations
// ---------------------------------------------------------------------------

self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayMutations((message) => broadcastToClients(message)));
  }
});

// ---------------------------------------------------------------------------
// Message handler -- main-thread <-> service-worker communication
// ---------------------------------------------------------------------------

/**
 * Handle messages from the main thread.
 *
 * Supported message types:
 *   - `REGISTER_SYNC` -- register a Background Sync for mutation replay.
 *   - `SKIP_WAITING` -- activate a waiting service worker immediately.
 *   - `SYNC_NOW` -- immediately replay pending mutations (manual trigger).
 *   - `GET_PENDING_COUNT` -- reply with the current pending mutation count.
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as ClientToSwMessage | undefined;
  if (!data?.type) return;

  switch (data.type) {
    case 'REGISTER_SYNC':
      event.waitUntil(
        self.registration.sync.register(SYNC_TAG).catch(() => {
          // Background Sync not supported -- the main thread will
          // retry via online/offline listeners instead.
        }),
      );
      break;

    case 'SKIP_WAITING':
      void self.skipWaiting();
      break;

    case 'SYNC_NOW':
      event.waitUntil(replayMutations((message) => broadcastToClients(message)));
      break;

    case 'GET_PENDING_COUNT': {
      event.waitUntil(
        (async () => {
          const { WebMutationQueue } = await import('../db/sync/MutationQueue');
          const queue = new WebMutationQueue();
          const count = await queue.getPendingCount();
          broadcastToClients({ type: 'PENDING_COUNT', count });
        })(),
      );
      break;
    }
  }
});

// ---------------------------------------------------------------------------
// Caching strategies
// ---------------------------------------------------------------------------

/**
 * **Cache-first**: serve from cache if available, otherwise fetch from
 * the network and cache the response for next time.
 */
async function cacheFirst(request: Request, fallbackUrl?: string): Promise<Response> {
  const cache = await caches.open(STATIC_CACHE);

  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  if (fallbackUrl) {
    const fallbackCached = await cache.match(fallbackUrl);
    if (fallbackCached) {
      return fallbackCached;
    }
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline -- resource not cached', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * **Network-first**: try the network, cache the response, and fall back
 * to a cached copy if offline.
 */
async function networkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(API_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    return new Response(
      JSON.stringify({ error: 'offline', message: 'No cached response available' }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

/** Returns `true` when the pathname looks like a static asset. */
function isStaticAsset(pathname: string): boolean {
  return STATIC_EXTENSIONS.test(pathname);
}

// ---------------------------------------------------------------------------
// Client broadcast helper
// ---------------------------------------------------------------------------

/**
 * Send a message to all controlled browser tabs so the UI can react to
 * sync lifecycle events (started, completed, failed, pending count).
 */
async function broadcastToClients(message: SwToClientMessage): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage(message);
  }
}

// ---------------------------------------------------------------------------
// TypeScript SyncEvent augmentation (not yet in lib.webworker.d.ts)
// ---------------------------------------------------------------------------

interface SyncManager {
  register(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

interface SyncEvent extends ExtendableEvent {
  readonly lastChance: boolean;
  readonly tag: string;
}

declare global {
  interface ServiceWorkerRegistration {
    readonly sync: SyncManager;
  }

  interface ServiceWorkerGlobalScopeEventMap {
    sync: SyncEvent;
  }
}

export {};
