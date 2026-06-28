// SPDX-License-Identifier: BUSL-1.1

/**
 * Regression test for the SQLite-WASM cache-poisoning trap (#3091).
 *
 * A dev server / misconfigured host can answer an unknown
 * `/assets/sql-wasm/*.wasm` request with `200` + the SPA shell
 * (`index.html`) via history-API fallback. The previous `cacheFirst`
 * cached any `response.ok`, so it would persist that HTML under the asset
 * URL and serve it `cache-first` forever — `WebAssembly.instantiate()`
 * then receives `<!do…` instead of the `\0asm` magic word, the data layer
 * crashes, and a freshly signed-up user is bounced back to an empty form.
 *
 * `cacheFirst` must therefore (a) never write an HTML response under a
 * static-asset URL, and (b) evict + bypass any such entry already in the
 * cache so the cache self-heals without a CACHE_VERSION bump.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cacheFirst } from '../service-worker';

interface MockCache {
  put: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

const WASM_URL = 'http://localhost/assets/sql-wasm/sql-wasm-browser.wasm';

let mockCache: MockCache;
let openMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch;
let originalCaches: CacheStorage | undefined;

function htmlShellResponse(): Response {
  return new Response('<!doctype html><html><head></head><body></body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function wasmResponse(): Response {
  // `\0asm` magic word + version.
  return new Response(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]), {
    status: 200,
    headers: { 'Content-Type': 'application/wasm' },
  });
}

beforeEach(() => {
  mockCache = { put: vi.fn(), match: vi.fn().mockResolvedValue(undefined), delete: vi.fn() };
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

describe('cacheFirst (SQLite-WASM cache-poisoning guard, #3091)', () => {
  it('never caches an HTML SPA-fallback response served under a .wasm URL', async () => {
    const html = htmlShellResponse();
    globalThis.fetch = vi.fn().mockResolvedValue(html);

    const result = await cacheFirst(new Request(WASM_URL));

    // The real (broken) response still surfaces to the caller…
    expect(result).toBe(html);
    // …but it is never persisted, so the cache cannot be poisoned.
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('caches a legitimate application/wasm response under a .wasm URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(wasmResponse());

    await cacheFirst(new Request(WASM_URL));

    expect(mockCache.put).toHaveBeenCalledTimes(1);
  });

  it('evicts a previously poisoned entry and re-fetches from the network', async () => {
    mockCache.match.mockResolvedValueOnce(htmlShellResponse());
    const fresh = wasmResponse();
    globalThis.fetch = vi.fn().mockResolvedValue(fresh);

    const result = await cacheFirst(new Request(WASM_URL));

    // Poisoned entry deleted, network hit, fresh wasm returned + re-cached.
    expect(mockCache.delete).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(result).toBe(fresh);
    expect(mockCache.put).toHaveBeenCalledTimes(1);
  });

  it('still serves a valid cached asset without hitting the network', async () => {
    const cachedWasm = wasmResponse();
    mockCache.match.mockResolvedValueOnce(cachedWasm);
    globalThis.fetch = vi.fn();

    const result = await cacheFirst(new Request(WASM_URL));

    expect(result).toBe(cachedWasm);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockCache.delete).not.toHaveBeenCalled();
    expect(mockCache.put).not.toHaveBeenCalled();
  });

  it('does not apply the HTML guard to non-asset URLs (scoping)', async () => {
    const html = htmlShellResponse();
    globalThis.fetch = vi.fn().mockResolvedValue(html);

    await cacheFirst(new Request('http://localhost/offline-shell'));

    // A non-asset path is outside the guard, so normal caching still applies.
    expect(mockCache.put).toHaveBeenCalledTimes(1);
  });
});
