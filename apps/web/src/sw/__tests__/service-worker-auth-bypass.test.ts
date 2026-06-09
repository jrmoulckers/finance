// SPDX-License-Identifier: BUSL-1.1

/**
 * Regression test for the service worker auth bypass (#1886).
 *
 * The auth API responses carry bearer tokens (access_token in the body,
 * refresh token in the HttpOnly cookie). The `networkOnlyNoStore`
 * helper must NEVER write those responses to Cache Storage and must
 * return a deterministic 503 when the network is unreachable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { networkOnlyNoStore } from '../service-worker';

interface MockCache {
  put: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
}

let mockCache: MockCache;
let openMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch;
let originalCaches: CacheStorage | undefined;

beforeEach(() => {
  mockCache = { put: vi.fn(), match: vi.fn() };
  openMock = vi.fn().mockResolvedValue(mockCache);

  originalFetch = globalThis.fetch;
  originalCaches = (globalThis as { caches?: CacheStorage }).caches;
  (globalThis as { caches: unknown }).caches = { open: openMock };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalCaches !== undefined) {
    (globalThis as { caches: CacheStorage }).caches = originalCaches;
  } else {
    delete (globalThis as { caches?: CacheStorage }).caches;
  }
  vi.restoreAllMocks();
});

describe('networkOnlyNoStore (service worker auth bypass)', () => {
  it('does not open or write to any cache on a successful response', async () => {
    const successResponse = new Response(JSON.stringify({ access_token: 'secret' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(successResponse);

    const result = await networkOnlyNoStore(
      new Request('http://localhost/api/auth/refresh', { method: 'POST' }),
    );

    expect(result).toBe(successResponse);
    expect(openMock).not.toHaveBeenCalled();
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('keeps all non-sync API responses out of Cache Storage', async () => {
    const successResponse = new Response(JSON.stringify({ balance: 123 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(successResponse);

    await networkOnlyNoStore(new Request('http://localhost/api/accounts'));

    expect(openMock).not.toHaveBeenCalled();
    expect(mockCache.put).not.toHaveBeenCalled();
    expect(mockCache.match).not.toHaveBeenCalled();
  });

  it('returns 503 JSON with Cache-Control: no-store when the network fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));

    const result = await networkOnlyNoStore(
      new Request('http://localhost/api/auth/refresh', { method: 'POST' }),
    );

    expect(result.status).toBe(503);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(result.headers.get('Content-Type')).toBe('application/json');
    expect(openMock).not.toHaveBeenCalled();
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('does not read from cache on the fallback path', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));

    await networkOnlyNoStore(new Request('http://localhost/api/auth/login', { method: 'POST' }));

    expect(mockCache.match).not.toHaveBeenCalled();
  });
});
