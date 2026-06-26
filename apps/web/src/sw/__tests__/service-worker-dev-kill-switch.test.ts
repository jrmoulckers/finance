// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the dev service-worker kill-switch (#3068, follow-up to #3064).
 *
 * On the Vite dev server the worker must not cache anything; instead it
 * self-destructs — purging caches, unregistering itself, and reloading every
 * open tab — so a browser that still has a stale production worker installed
 * auto-heals out of the HMR reload loop without any manual unregister.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IS_DEV_SERVICE_WORKER, selfDestructDevServiceWorker } from '../service-worker';

interface MockWindowClient {
  url: string;
  navigate: ReturnType<typeof vi.fn>;
}

const selfScope = self as unknown as {
  clients?: { claim: ReturnType<typeof vi.fn>; matchAll: ReturnType<typeof vi.fn> };
  registration?: { unregister: ReturnType<typeof vi.fn> };
};

let originalCaches: CacheStorage | undefined;
let originalClients: typeof selfScope.clients;
let originalRegistration: typeof selfScope.registration;

let cachesKeys: ReturnType<typeof vi.fn>;
let cachesDelete: ReturnType<typeof vi.fn>;
let claim: ReturnType<typeof vi.fn>;
let matchAll: ReturnType<typeof vi.fn>;
let unregister: ReturnType<typeof vi.fn>;

beforeEach(() => {
  cachesKeys = vi.fn().mockResolvedValue(['finance-static-v2', 'finance-sync-v2']);
  cachesDelete = vi.fn().mockResolvedValue(true);
  claim = vi.fn().mockResolvedValue(undefined);
  matchAll = vi.fn().mockResolvedValue([]);
  unregister = vi.fn().mockResolvedValue(true);

  originalCaches = (globalThis as { caches?: CacheStorage }).caches;
  originalClients = selfScope.clients;
  originalRegistration = selfScope.registration;

  (globalThis as { caches: unknown }).caches = { keys: cachesKeys, delete: cachesDelete };
  selfScope.clients = { claim, matchAll };
  selfScope.registration = { unregister };
});

afterEach(() => {
  if (originalCaches !== undefined) {
    (globalThis as { caches: CacheStorage }).caches = originalCaches;
  } else {
    delete (globalThis as { caches?: CacheStorage }).caches;
  }
  selfScope.clients = originalClients;
  selfScope.registration = originalRegistration;
  vi.restoreAllMocks();
});

describe('dev service-worker kill-switch (#3068)', () => {
  it('is inert under the Vitest runner / production (MODE !== "development")', () => {
    // Guards against the dev kill-switch ever activating in a production
    // build or the test runner, which would disable caching + offline.
    expect(IS_DEV_SERVICE_WORKER).toBe(false);
  });

  it('purges every cache, unregisters, and reloads all open tabs', async () => {
    const tabA: MockWindowClient = {
      url: 'http://localhost:5173/',
      navigate: vi.fn().mockResolvedValue(undefined),
    };
    const tabB: MockWindowClient = {
      url: 'http://localhost:5173/budgets',
      navigate: vi.fn().mockResolvedValue(undefined),
    };
    matchAll.mockResolvedValue([tabA, tabB]);

    await selfDestructDevServiceWorker();

    expect(cachesDelete).toHaveBeenCalledWith('finance-static-v2');
    expect(cachesDelete).toHaveBeenCalledWith('finance-sync-v2');
    expect(claim).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(tabA.navigate).toHaveBeenCalledWith('http://localhost:5173/');
    expect(tabB.navigate).toHaveBeenCalledWith('http://localhost:5173/budgets');
  });

  it('still unregisters when the cache purge rejects (best-effort)', async () => {
    cachesKeys.mockRejectedValue(new Error('cache boom'));

    await expect(selfDestructDevServiceWorker()).resolves.toBeUndefined();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('does not throw when unregister rejects', async () => {
    unregister.mockRejectedValue(new Error('unregister boom'));

    await expect(selfDestructDevServiceWorker()).resolves.toBeUndefined();
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it('swallows a tab navigate rejection so cleanup completes', async () => {
    const tab: MockWindowClient = {
      url: 'http://localhost:5173/',
      navigate: vi.fn().mockRejectedValue(new Error('navigate boom')),
    };
    matchAll.mockResolvedValue([tab]);

    await expect(selfDestructDevServiceWorker()).resolves.toBeUndefined();
    expect(tab.navigate).toHaveBeenCalledTimes(1);
  });
});
