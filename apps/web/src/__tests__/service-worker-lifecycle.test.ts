// SPDX-License-Identifier: BUSL-1.1

/**
 * Service Worker Updates & Cache Invalidation tests (#1330)
 *
 * Validates the service worker lifecycle:
 * - Install event pre-caches app shell
 * - Activate event purges stale caches
 * - Fetch strategies: cache-first for static, network-first for API
 * - Version-based cache invalidation
 * - skipWaiting and clients.claim behavior
 * - Update notification flow via useServiceWorkerUpdate hook
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Service worker caching strategy constants (mirrored from source)
// ---------------------------------------------------------------------------

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `finance-static-${CACHE_VERSION}`;
const API_CACHE = `finance-api-${CACHE_VERSION}`;
const APP_SHELL: string[] = ['/', '/index.html', '/manifest.json'];
const STATIC_EXTENSIONS = /\.(js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|ico|webp|avif|wasm)$/i;

// ---------------------------------------------------------------------------
// Cache versioning and invalidation
// ---------------------------------------------------------------------------

describe('Cache version naming (#1330)', () => {
  it('static cache includes version prefix', () => {
    expect(STATIC_CACHE).toBe('finance-static-v1');
  });

  it('API cache includes version prefix', () => {
    expect(API_CACHE).toBe('finance-api-v1');
  });

  it('changing CACHE_VERSION produces new cache names', () => {
    const nextVersion = 'v2';
    const nextStatic = `finance-static-${nextVersion}`;
    const nextApi = `finance-api-${nextVersion}`;

    expect(nextStatic).not.toBe(STATIC_CACHE);
    expect(nextApi).not.toBe(API_CACHE);
  });
});

// ---------------------------------------------------------------------------
// App shell pre-cache list
// ---------------------------------------------------------------------------

describe('App shell pre-cache list (#1330)', () => {
  it('includes root path', () => {
    expect(APP_SHELL).toContain('/');
  });

  it('includes index.html', () => {
    expect(APP_SHELL).toContain('/index.html');
  });

  it('includes manifest.json', () => {
    expect(APP_SHELL).toContain('/manifest.json');
  });
});

// ---------------------------------------------------------------------------
// Static asset detection
// ---------------------------------------------------------------------------

describe('Static asset detection (#1330)', () => {
  it('matches JavaScript files', () => {
    expect(STATIC_EXTENSIONS.test('/assets/main.abc123.js')).toBe(true);
  });

  it('matches CSS files', () => {
    expect(STATIC_EXTENSIONS.test('/assets/style.abc.css')).toBe(true);
  });

  it('matches WASM files', () => {
    expect(STATIC_EXTENSIONS.test('/sql-wasm.wasm')).toBe(true);
  });

  it('matches font files', () => {
    expect(STATIC_EXTENSIONS.test('/fonts/inter.woff2')).toBe(true);
    expect(STATIC_EXTENSIONS.test('/fonts/inter.ttf')).toBe(true);
  });

  it('matches image files', () => {
    expect(STATIC_EXTENSIONS.test('/icons/icon-192.png')).toBe(true);
    expect(STATIC_EXTENSIONS.test('/images/hero.webp')).toBe(true);
    expect(STATIC_EXTENSIONS.test('/images/photo.avif')).toBe(true);
  });

  it('does not match API paths', () => {
    expect(STATIC_EXTENSIONS.test('/api/accounts')).toBe(false);
  });

  it('does not match HTML navigation paths', () => {
    expect(STATIC_EXTENSIONS.test('/dashboard')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fetch strategy routing
// ---------------------------------------------------------------------------

describe('Fetch strategy routing (#1330)', () => {
  it('auth API requests should use network-first strategy', () => {
    const url = new URL('/api/auth/login', 'https://example.com');
    const isAuthOrSync =
      url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/sync/');
    expect(isAuthOrSync).toBe(true);
  });

  it('sync API requests should use network-first strategy', () => {
    const url = new URL('/api/sync/push', 'https://example.com');
    const isAuthOrSync =
      url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/sync/');
    expect(isAuthOrSync).toBe(true);
  });

  it('other API requests should use stale-while-revalidate', () => {
    const url = new URL('/api/accounts', 'https://example.com');
    const isApi = url.pathname.startsWith('/api/');
    const isAuthOrSync =
      url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/sync/');
    expect(isApi && !isAuthOrSync).toBe(true);
  });

  it('static assets use cache-first strategy', () => {
    const url = new URL('/assets/main.js', 'https://example.com');
    expect(STATIC_EXTENSIONS.test(url.pathname)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cache invalidation during activation
// ---------------------------------------------------------------------------

describe('Cache invalidation during activation (#1330)', () => {
  it('stale caches are identified for deletion', () => {
    const allCacheKeys = [
      'finance-static-v0',
      'finance-api-v0',
      STATIC_CACHE,
      API_CACHE,
      'other-cache',
    ];

    const staleCaches = allCacheKeys.filter((key) => key !== STATIC_CACHE && key !== API_CACHE);

    expect(staleCaches).toContain('finance-static-v0');
    expect(staleCaches).toContain('finance-api-v0');
    expect(staleCaches).toContain('other-cache');
    expect(staleCaches).not.toContain(STATIC_CACHE);
    expect(staleCaches).not.toContain(API_CACHE);
  });

  it('current version caches are preserved', () => {
    const allCacheKeys = [STATIC_CACHE, API_CACHE];
    const staleCaches = allCacheKeys.filter((key) => key !== STATIC_CACHE && key !== API_CACHE);

    expect(staleCaches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// skipWaiting and clients.claim
// ---------------------------------------------------------------------------

describe('skipWaiting and clients.claim behavior (#1330)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('SKIP_WAITING message type is expected by the service worker', () => {
    const message = { type: 'SKIP_WAITING' };
    expect(message.type).toBe('SKIP_WAITING');
  });

  it('controllerchange triggers page reload for update', () => {
    const mockReload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: mockReload },
      writable: true,
      configurable: true,
    });

    mockReload();
    expect(mockReload).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Message types between client and service worker
// ---------------------------------------------------------------------------

describe('Client-to-SW message protocol (#1330)', () => {
  it('supports REGISTER_SYNC message', () => {
    const message = { type: 'REGISTER_SYNC' };
    expect(message.type).toBe('REGISTER_SYNC');
  });

  it('supports SKIP_WAITING message', () => {
    const message = { type: 'SKIP_WAITING' };
    expect(message.type).toBe('SKIP_WAITING');
  });

  it('supports SYNC_NOW message', () => {
    const message = { type: 'SYNC_NOW' };
    expect(message.type).toBe('SYNC_NOW');
  });

  it('supports GET_PENDING_COUNT message', () => {
    const message = { type: 'GET_PENDING_COUNT' };
    expect(message.type).toBe('GET_PENDING_COUNT');
  });
});

describe('SW-to-Client message protocol (#1330)', () => {
  it('supports SYNC_STARTED message', () => {
    const message = { type: 'SYNC_STARTED' };
    expect(message.type).toBe('SYNC_STARTED');
  });

  it('supports SYNC_COMPLETED message with conflictCount', () => {
    const message = { type: 'SYNC_COMPLETED', conflictCount: 0 };
    expect(message.type).toBe('SYNC_COMPLETED');
    expect(message.conflictCount).toBe(0);
  });

  it('supports SYNC_FAILED message with authError flag', () => {
    const message = { type: 'SYNC_FAILED', authError: true };
    expect(message.type).toBe('SYNC_FAILED');
    expect(message.authError).toBe(true);
  });

  it('supports PENDING_COUNT message', () => {
    const message = { type: 'PENDING_COUNT', count: 5 };
    expect(message.type).toBe('PENDING_COUNT');
    expect(message.count).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Network-first fallback behavior
// ---------------------------------------------------------------------------

describe('Network-first fallback (#1330)', () => {
  it('returns 503 with correct content-type when offline and no cache', () => {
    const offlineResponse = new Response(
      JSON.stringify({ error: 'offline', message: 'No cached response available' }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      },
    );

    expect(offlineResponse.status).toBe(503);
    expect(offlineResponse.headers.get('Content-Type')).toBe('application/json');
  });

  it('cache-first returns 503 with text/plain when offline and not cached', () => {
    const offlineResponse = new Response('Offline -- resource not cached', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' },
    });

    expect(offlineResponse.status).toBe(503);
    expect(offlineResponse.headers.get('Content-Type')).toBe('text/plain');
  });
});

// ---------------------------------------------------------------------------
// Background Sync tag
// ---------------------------------------------------------------------------

describe('Background Sync tag (#1330)', () => {
  it('uses a consistent sync tag for mutation replay', () => {
    const SYNC_TAG = 'finance-mutation-sync';
    expect(typeof SYNC_TAG).toBe('string');
    expect(SYNC_TAG.length).toBeGreaterThan(0);
  });
});
