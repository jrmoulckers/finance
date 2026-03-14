// SPDX-License-Identifier: BUSL-1.1

/**
 * Service Worker for the Finance PWA.
 *
 * Caching strategies:
 *   ΓÇó Cache-first ΓÇö static assets (JS, CSS, images, fonts, WASM)
 *   ΓÇó Network-first ΓÇö API calls (`/api/`)
 *
 * Background sync is registered for offline mutations so that queued
 * writes are replayed once the device regains connectivity.
 *
 * Cache versioning is enforced: when CACHE_VERSION changes, old caches
 * are automatically purged during activation.
 *
 * References: issue #58
 */

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// ---------------------------------------------------------------------------
// Cache configuration
// ---------------------------------------------------------------------------

/** Bump this value to invalidate all caches on the next deploy. */
const CACHE_VERSION = 'v1';

/** Cache bucket names. */
const STATIC_CACHE = `finance-static-${CACHE_VERSION}`;
const API_CACHE = `finance-api-${CACHE_VERSION}`;

/** Sync tag used for Background Sync registration. */
const SYNC_TAG = 'finance-offline-mutations';

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
// Install ΓÇö pre-cache app shell
// ---------------------------------------------------------------------------

self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  // Activate immediately without waiting for existing clients to close
  void self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate ΓÇö purge stale caches
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
// Fetch ΓÇö strategy router
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // API requests ΓåÆ network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets & app shell ΓåÆ cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation requests (HTML) ΓåÆ cache-first (SPA)
  if (request.mode === 'navigate') {
    event.respondWith(cacheFirst(request, '/index.html'));
    return;
  }

  // Everything else ΓÇö try cache, fall back to network
  event.respondWith(cacheFirst(request));
});

// ---------------------------------------------------------------------------
// Background Sync
// ---------------------------------------------------------------------------

self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayOfflineMutations());
  }
});

/**
 * Register a background-sync so that pending mutations are retried
 * when the browser regains connectivity.
 *
 * Called from the main thread via `postMessage`.
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'REGISTER_SYNC') {
    event.waitUntil(
      self.registration.sync.register(SYNC_TAG).catch(() => {
        // Background Sync not supported ΓÇö the main thread will
        // retry via online/offline listeners instead.
      }),
    );
  }

  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
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
    return new Response('Offline ΓÇö resource not cached', {
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

/**
 * Replay queued offline mutations.
 *
 * NOTE: The actual IndexedDB queue implementation lives in the app
 * layer.  This stub is the service-worker-side consumer and will be
 * wired up once the sync engine is integrated.
 */
async function replayOfflineMutations(): Promise<void> {
  // TODO: Wire up to the sync engine's IndexedDB mutation queue (#95)
  return Promise.resolve();
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
