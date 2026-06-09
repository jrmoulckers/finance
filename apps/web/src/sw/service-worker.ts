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

/**
 * Bump this value to invalidate all caches on the next deploy.
 *
 * v2 (#2021): forces eviction of the v1 precache that pinned the
 * pre-#2019 web bundle. That bundle was built without
 * `VITE_SUPABASE_URL`, so `isDemoMode()` evaluated true and the entire
 * app booted into local-only demo auth. Users with a populated v1
 * cache continued to see demo mode even after #2019 wired the env vars,
 * because the SW's `cacheFirst` strategy keeps serving the cached
 * `/assets/main-*.js` chunks until the cache name changes.
 */
const CACHE_VERSION = 'v2';

/** Cache bucket names. */
const STATIC_CACHE = `finance-static-${CACHE_VERSION}`;
const API_CACHE = `finance-api-${CACHE_VERSION}`;

/**
 * Build-time precache manifest.
 *
 * At build time, Vite injects __PRECACHE_MANIFEST__ with all generated
 * JS/CSS chunk paths (populated by the sw-precache-manifest plugin).
 * This ensures lazy route chunks are available offline even before first visit.
 */
declare const __PRECACHE_MANIFEST__: string[];
const PRECACHE_MANIFEST: string[] =
  typeof __PRECACHE_MANIFEST__ !== 'undefined' ? __PRECACHE_MANIFEST__ : [];

/**
 * File-extension patterns that qualify for cache-first treatment.
 * Matched against the URL pathname.
 */
const STATIC_EXTENSIONS = /\.(js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|ico|webp|avif|wasm)$/i;

// ---------------------------------------------------------------------------
// Install -- pre-cache app shell
// ---------------------------------------------------------------------------

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // Always precache core app shell
      await cache.addAll(['/', '/index.html', '/manifest.json']);
      // Precache build chunks individually — a single failure should not
      // block installation (e.g. dev mode without manifest).
      await Promise.allSettled(
        PRECACHE_MANIFEST.map((url) =>
          cache.add(url).catch(() => {
            /* non-critical: chunk will be cached on first visit */
          }),
        ),
      );
    }),
  );
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

  // Auth API: strictly network-only, never cached (#1886).
  // Auth responses carry bearer tokens (access_token in body, refresh
  // token in HttpOnly cookie) so any caching path would persist
  // credentials to disk-backed Cache Storage. The auth functions also
  // emit `Cache-Control: no-store`, but defence-in-depth here protects
  // against future strategy changes upstream.
  if (url.pathname.startsWith('/api/auth/')) {
    event.respondWith(networkOnlyNoStore(request));
    return;
  }

  // Sync API requests -> network-first (prefer fresh data, fall back to cache)
  if (url.pathname.startsWith('/api/sync/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Other API requests -> stale-while-revalidate (serve cached, update in background)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Static assets & app shell -> cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation requests (HTML) -> network-first with app-shell fallback (SPA)
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
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
  // Verify the message originates from our own origin to prevent
  // cross-origin iframes or windows from triggering SW actions.
  if (event.origin && event.origin !== self.location.origin) return;

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
 * **Navigation handler**: try network first for HTML navigations,
 * fall back to the cached app shell (`/index.html`) for offline SPA routing.
 */
async function navigationHandler(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline — serve the cached app shell so the SPA router can handle the path
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match('/index.html');
    if (cached) {
      return cached;
    }
    return new Response('Offline -- app shell not cached', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

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
 * **Network-only, no-store**: always go to the network for auth
 * requests, and never enter Cache Storage on any code path (success or
 * failure). Falls back to a JSON 503 when the network throws.
 *
 * Exported so a regression test can assert that `/api/auth/*` is never
 * routed through a caching strategy (#1886).
 */
export async function networkOnlyNoStore(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Network required for auth' }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      },
    );
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

/**
 * **Stale-while-revalidate**: serve from cache immediately (if available),
 * then update the cache in the background from the network.
 *
 * This provides the best user experience for API requests: instant responses
 * from cache with eventual consistency from the network.
 */
async function staleWhileRevalidate(request: Request): Promise<Response> {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  // Start the network request in the background
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // If we have a cached response, return it immediately
  if (cached) {
    // Fire-and-forget: update cache in background
    void networkPromise;
    return cached;
  }

  // No cached response — wait for network
  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
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
