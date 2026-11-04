// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const match = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('__PRECACHE_MANIFEST__', ['/assets/synthetic-chunk-123.js']);
  vi.stubGlobal('self', {
    location: new URL('http://localhost'),
    addEventListener: vi.fn(),
  });
  vi.stubGlobal('caches', {
    open: vi.fn().mockResolvedValue({ match, delete: vi.fn(), put: vi.fn() }),
  });
  match.mockReset().mockResolvedValue(
    new Response('/* synthetic build chunk */', {
      headers: { 'Content-Type': 'text/javascript', Vary: 'Origin' },
    }),
  );
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => vi.unstubAllGlobals());

it('matches a same-origin manifest chunk across module Origin header variation', async () => {
  const { cacheFirst } = await import('../service-worker');
  const request = new Request('http://localhost/assets/synthetic-chunk-123.js', {
    headers: { Origin: 'http://localhost' },
  });
  const response = await cacheFirst(request);
  expect(response.status).toBe(200);
  expect(match).toHaveBeenCalledWith(request, { ignoreVary: true });
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  'http://localhost/api/profile',
  'http://localhost/receipts/synthetic.png',
  'http://localhost/assets/not-in-manifest.js',
  'http://localhost/assets/synthetic-chunk-123.js?private=1',
  'https://other.invalid/assets/synthetic-chunk-123.js',
])('preserves Vary for non-manifest or non-origin requests: %s', async (url) => {
  const { cacheFirst } = await import('../service-worker');
  const request = new Request(url);
  await cacheFirst(request);
  expect(match).toHaveBeenCalledWith(request);
});
