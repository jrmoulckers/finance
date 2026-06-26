// SPDX-License-Identifier: BUSL-1.1

/**
 * Service Worker for the Finance PWA.
 *
 * Caching strategies:
 *   - Cache-first -- static assets (JS, CSS, images, fonts, WASM)
 *   - Network-first -- sync API calls (`/api/sync/`)
 *   - Network-only/no-store -- all other API calls (`/api/*`)
 *
 * Authenticated API responses can contain bearer tokens, financial data, or
 * user-specific state. Cache Storage is disk-backed and not covered by the
 * encrypted SQLite IndexedDB layer, so non-sync API responses are never cached.
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
 * References: issues #58, #416, #2028
 */

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import type { ClientToSwMessage, QueuedMutation, SwToClientMessage } from '../db/sync/types';

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
const SYNC_CACHE = `finance-sync-${CACHE_VERSION}`;
const RECEIPT_CACHE = `finance-receipts-${CACHE_VERSION}`;
const LEGACY_API_CACHE_PREFIX = 'finance-api-';
const SYNC_TAG = 'finance-offline-mutations';
const MUTATION_QUEUE_DB_NAME = 'finance-mutation-queue';
const MUTATION_QUEUE_STORE_NAME = 'mutations';
const MUTATION_QUEUE_DB_VERSION = 1;
const MAX_RETRY_COUNT = 5;
const REPLAY_BATCH_SIZE = 50;
const CONFLICT_DB_NAME = 'finance-sync-conflicts';
const CONFLICT_STORE_NAME = 'conflicts';
const CONFLICT_DB_VERSION = 1;
const RECEIPT_CACHE_MAX_ENTRIES = 120;
const RECEIPT_PATH_PATTERN = /\/(receipts?|attachments?)\//i;
const RECEIPT_IMAGE_EXTENSION_PATTERN = /\.(avif|gif|jpe?g|png|webp)$/i;
const SENSITIVE_RECEIPT_QUERY_PARAMS = new Set([
  'access_token',
  'authorization',
  'expires',
  'key',
  'policy',
  'signature',
  'sig',
  'token',
  'x-amz-credential',
  'x-amz-security-token',
  'x-amz-signature',
]);

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

const BASE_PATH = normalizeServiceWorkerBasePath(import.meta.env.BASE_URL);
const APP_INDEX_URL = withServiceWorkerBasePath(BASE_PATH, 'index.html');
const APP_SHELL_PRECACHE_URLS = getAppShellPrecacheUrls(BASE_PATH);

export function normalizeServiceWorkerBasePath(basePath: string | undefined): string {
  const trimmed = basePath?.trim();
  if (!trimmed || trimmed === '/' || trimmed === '.' || trimmed === './') {
    return '/';
  }

  let pathname = trimmed;
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
    pathname = new URL(trimmed).pathname;
  }

  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function withServiceWorkerBasePath(basePath: string, path: string): string {
  return `${normalizeServiceWorkerBasePath(basePath)}${path.replace(/^\/+/, '')}`;
}

export function getAppShellPrecacheUrls(basePath: string = BASE_PATH): string[] {
  return [
    withServiceWorkerBasePath(basePath, ''),
    withServiceWorkerBasePath(basePath, 'index.html'),
    withServiceWorkerBasePath(basePath, 'manifest.json'),
  ];
}

/**
 * File-extension patterns that qualify for cache-first treatment.
 * Matched against the URL pathname.
 */
const STATIC_EXTENSIONS = /\.(js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|ico|webp|avif|wasm)$/i;

function isReceiptImagePath(pathname: string): boolean {
  return RECEIPT_PATH_PATTERN.test(pathname) && RECEIPT_IMAGE_EXTENSION_PATTERN.test(pathname);
}

function sanitizeReceiptCacheUrl(input: URL): string {
  const url = new URL(input.toString());
  for (const key of Array.from(url.searchParams.keys())) {
    if (SENSITIVE_RECEIPT_QUERY_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.hash = '';
  return url.toString();
}

function hasSensitiveReceiptToken(input: URL): boolean {
  for (const key of input.searchParams.keys()) {
    if (SENSITIVE_RECEIPT_QUERY_PARAMS.has(key.toLowerCase())) {
      return true;
    }
  }
  return false;
}

interface SyncConflict {
  readonly mutationId: string;
  readonly tableName: string;
  readonly recordId: string;
  readonly clientData: Record<string, unknown>;
  readonly serverData: Record<string, unknown>;
  resolvedAt: number | null;
  resolution: 'client' | 'server' | null;
}

interface PushResult {
  acknowledged: string[];
  conflicts: SyncConflict[];
  authError: boolean;
}

async function replayPendingMutations(
  broadcastResult?: (message: SwToClientMessage) => void,
): Promise<void> {
  const pending = await getMutationBatch(REPLAY_BATCH_SIZE);
  if (pending.length === 0) {
    return;
  }

  broadcastResult?.({ type: 'SYNC_STARTED' });
  const result = await pushMutationsToServer(pending);

  if (result.authError) {
    broadcastResult?.({
      type: 'SYNC_FAILED',
      error: 'Authentication required. Please sign in again.',
      authError: true,
    });
    return;
  }

  if (result.conflicts.length > 0) {
    await storeConflicts(result.conflicts);
  }

  const acknowledged = new Set(result.acknowledged);
  const conflictIds = new Set(result.conflicts.map((conflict) => conflict.mutationId));
  if (acknowledged.size > 0) {
    await deleteMutations([...acknowledged]);
  }
  if (conflictIds.size > 0) {
    await deleteMutations([...conflictIds]);
  }

  const failed = pending.filter(
    (mutation) => !acknowledged.has(mutation.id) && !conflictIds.has(mutation.id),
  );
  await Promise.all(failed.map((mutation) => retryMutation(mutation)));

  broadcastResult?.({
    type: 'SYNC_COMPLETED',
    syncedCount: acknowledged.size,
    failedCount: failed.length,
    conflictCount: result.conflicts.length,
  });
}

async function pushMutationsToServer(mutations: QueuedMutation[]): Promise<PushResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${self.location.origin}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mutations }),
      credentials: 'include',
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      return { acknowledged: [], conflicts: [], authError: true };
    }

    if (response.status === 409) {
      const body = (await response.json()) as {
        acknowledged?: string[];
        conflicts?: SyncConflict[];
      };
      return {
        acknowledged: body.acknowledged ?? [],
        conflicts: body.conflicts ?? [],
        authError: false,
      };
    }

    if (!response.ok) {
      return { acknowledged: [], conflicts: [], authError: false };
    }

    const body = (await response.json()) as {
      acknowledged?: string[];
      conflicts?: SyncConflict[];
    };
    return {
      acknowledged: body.acknowledged ?? mutations.map((mutation) => mutation.id),
      conflicts: body.conflicts ?? [],
      authError: false,
    };
  } catch {
    return { acknowledged: [], conflicts: [], authError: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

function openMutationDb(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(MUTATION_QUEUE_DB_NAME, MUTATION_QUEUE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MUTATION_QUEUE_STORE_NAME)) {
        const store = db.createObjectStore(MUTATION_QUEUE_STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_timestamp', 'timestamp', { unique: false });
        store.createIndex('by_table', 'tableName', { unique: false });
        store.createIndex('by_household', 'householdId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getMutationBatch(count: number): Promise<QueuedMutation[]> {
  const db = await openMutationDb();
  try {
    return await new Promise<QueuedMutation[]>((resolve, reject) => {
      const tx = db.transaction(MUTATION_QUEUE_STORE_NAME, 'readonly');
      const store = tx.objectStore(MUTATION_QUEUE_STORE_NAME);
      const index = store.index('by_timestamp');
      const mutations: QueuedMutation[] = [];
      const request = index.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && mutations.length < count) {
          mutations.push(cursor.value as QueuedMutation);
          cursor.continue();
          return;
        }
        resolve(mutations);
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function countPendingMutations(): Promise<number> {
  const db = await openMutationDb();
  try {
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(MUTATION_QUEUE_STORE_NAME, 'readonly');
      const request = tx.objectStore(MUTATION_QUEUE_STORE_NAME).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function deleteMutations(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;

  const db = await openMutationDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MUTATION_QUEUE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(MUTATION_QUEUE_STORE_NAME);
      ids.forEach((id) => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  } finally {
    db.close();
  }
}

async function retryMutation(mutation: QueuedMutation): Promise<void> {
  const nextRetryCount = mutation.retryCount + 1;
  if (nextRetryCount > MAX_RETRY_COUNT) {
    await deleteMutations([mutation.id]);
    return;
  }

  const db = await openMutationDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MUTATION_QUEUE_STORE_NAME, 'readwrite');
      tx.objectStore(MUTATION_QUEUE_STORE_NAME).put({ ...mutation, retryCount: nextRetryCount });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  } finally {
    db.close();
  }
}

async function storeConflicts(conflicts: SyncConflict[]): Promise<void> {
  if (conflicts.length === 0) return;

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CONFLICT_DB_NAME, CONFLICT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CONFLICT_STORE_NAME)) {
        const store = db.createObjectStore(CONFLICT_STORE_NAME, { keyPath: 'mutationId' });
        store.createIndex('by_table', 'tableName', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CONFLICT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CONFLICT_STORE_NAME);
      conflicts.forEach((conflict) => store.put(conflict));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Dev kill-switch (#3068, follow-up to #3064)
// ---------------------------------------------------------------------------

/**
 * True only when this worker is running on the Vite **dev server** (serve
 * mode, MODE `development`). A service worker must never control the dev
 * server: its caching shadows Vite with a stale app shell + modules, which
 * fights HMR / dependency re-optimization and triggers an infinite full-page
 * reload loop. In dev the worker becomes a self-destruct kill-switch (below).
 *
 * Evaluates to `false` for production builds (`vite preview`, MODE
 * `production`) and the Vitest runner (MODE `test`), where the worker behaves
 * normally — so the dev branches are dead-code-eliminated from the production
 * bundle.
 */
export const IS_DEV_SERVICE_WORKER: boolean = import.meta.env.MODE === 'development';

/**
 * Dev-only kill-switch: purge every cache this worker created, unregister the
 * worker, and reload all controlled tabs so they reload fresh from the Vite
 * dev server with no service worker in the way.
 *
 * The browser fetches the worker script out-of-band during its update check
 * (not through the worker's own `fetch` handler), so a browser that still has
 * a production worker installed from an earlier build picks this up on its
 * next navigation and auto-heals — no manual `chrome://serviceworker-internals`
 * unregister required. Best-effort: every step is guarded so a failure never
 * leaves the worker half-alive.
 */
export async function selfDestructDevServiceWorker(): Promise<void> {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    // best-effort: cache purge is non-fatal
  }

  // Control any open tabs so they can be reloaded, then remove the
  // registration so future loads are no longer controlled.
  await self.clients.claim();

  try {
    await self.registration.unregister();
  } catch {
    // best-effort: unregister is non-fatal
  }

  const windowClients = await self.clients.matchAll({ type: 'window' });
  await Promise.all(
    windowClients.map((client) =>
      (client as WindowClient).navigate((client as WindowClient).url).catch(() => {
        // best-effort: a controlled reload may be disallowed; the boot-time
        // unregisterDevServiceWorkers() in main.tsx covers that case.
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Install -- pre-cache app shell
// ---------------------------------------------------------------------------

self.addEventListener('install', (event: ExtendableEvent) => {
  if (IS_DEV_SERVICE_WORKER) {
    // Activate immediately so the activate handler can self-destruct without
    // waiting for old tabs to close. Skip precache entirely in dev.
    void self.skipWaiting();
    return;
  }

  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // Always precache the core app shell at the Vite public base path.
      await cache.addAll(APP_SHELL_PRECACHE_URLS);
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
  if (IS_DEV_SERVICE_WORKER) {
    event.waitUntil(selfDestructDevServiceWorker());
    return;
  }

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter(shouldDeleteCacheOnActivate).map((key) => caches.delete(key))),
      ),
  );
  // Take control of all open tabs immediately
  void self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch -- strategy router
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event: FetchEvent) => {
  if (IS_DEV_SERVICE_WORKER) {
    // Never intercept on the dev server — let every request hit Vite fresh.
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  switch (getFetchStrategyForPathname(url.pathname, request.mode)) {
    case 'receipt-cache-first':
      event.respondWith(receiptImageCacheFirst(request));
      return;
    case 'network-first':
      event.respondWith(networkFirst(request));
      return;
    case 'network-only-no-store':
      event.respondWith(networkOnlyNoStore(request));
      return;
    case 'cache-first':
      event.respondWith(cacheFirst(request));
      return;
    case 'navigation':
      event.respondWith(navigationHandler(request));
      return;
  }
});

// ---------------------------------------------------------------------------
// Background Sync -- replay offline mutations
// ---------------------------------------------------------------------------

self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayPendingMutations((message) => broadcastToClients(message)));
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
      event.waitUntil(replayPendingMutations((message) => broadcastToClients(message)));
      break;

    case 'GET_PENDING_COUNT': {
      event.waitUntil(
        (async () => {
          const count = await countPendingMutations();
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
    const cached = await cache.match(APP_INDEX_URL);
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
 * **Network-only, no-store**: always go to the network for
 * authenticated API requests, and never enter Cache Storage on any code
 * path (success or failure). Falls back to a JSON 503 when the network
 * throws.
 *
 * Exported so regression tests can assert that `/api/*` routes are never
 * routed through a caching strategy (#1886, #2028).
 */
export async function networkOnlyNoStore(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Network required for this API request' }),
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
 * to a cached copy if offline. Used only for sync API endpoints, whose
 * offline reconciliation payloads are intentionally available offline.
 */
async function networkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(SYNC_CACHE);

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

async function receiptImageCacheFirst(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const cacheKey = sanitizeReceiptCacheUrl(requestUrl);
  const cache = await caches.open(RECEIPT_CACHE);
  const cached = await cache.match(cacheKey);

  if (cached) {
    return withCacheStatusHeaders(cached, 'cached');
  }

  try {
    const response = await fetch(request);
    if (response.ok && !hasSensitiveReceiptToken(requestUrl)) {
      await cache.put(cacheKey, response.clone());
      await trimCacheEntries(cache, RECEIPT_CACHE_MAX_ENTRIES);
    }
    return response;
  } catch {
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Receipt image is not cached on this device' }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      },
    );
  }
}

async function trimCacheEntries(cache: Cache, maxEntries: number): Promise<void> {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

function withCacheStatusHeaders(response: Response, status: 'cached' | 'stale'): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Finance-Cache-Status', status);
  headers.set('X-Finance-Stale-At', new Date().toISOString());
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Returns `true` when the pathname looks like a static asset. */
function isStaticAsset(pathname: string): boolean {
  return STATIC_EXTENSIONS.test(pathname);
}

export type FetchStrategy =
  | 'receipt-cache-first'
  | 'network-first'
  | 'network-only-no-store'
  | 'cache-first'
  | 'navigation';

export function getFetchStrategyForPathname(
  pathname: string,
  requestMode?: RequestMode,
): FetchStrategy {
  if (isReceiptImagePath(pathname)) {
    return 'receipt-cache-first';
  }

  if (pathname.startsWith('/api/sync/')) {
    return 'network-first';
  }

  if (pathname.startsWith('/api/')) {
    return 'network-only-no-store';
  }

  if (isStaticAsset(pathname)) {
    return 'cache-first';
  }

  if (requestMode === 'navigate') {
    return 'navigation';
  }

  return 'cache-first';
}

function shouldDeleteCacheOnActivate(key: string): boolean {
  return (
    key.startsWith(LEGACY_API_CACHE_PREFIX) ||
    (key !== STATIC_CACHE && key !== SYNC_CACHE && key !== RECEIPT_CACHE)
  );
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
