// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the app-boot service-worker registration (#1965).
 *
 * The registration must:
 *   - Call `navigator.serviceWorker.register()` at the root scope using
 *     the canonical `/sw.js` URL emitted by Vite's `input.sw` entry.
 *   - Return the same Promise to all callers (singleton).
 *   - Resolve to `null` (not throw) when `serviceWorker` is unavailable.
 *   - Clear the cache on failure so retries are possible after fixing
 *     the underlying issue (e.g. flaky network for the SW script).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetServiceWorkerRegistrationForTesting,
  isViteDevServer,
  registerAppServiceWorker,
  unregisterDevServiceWorkers,
} from '../register';

describe('registerAppServiceWorker (#1965)', () => {
  beforeEach(() => {
    _resetServiceWorkerRegistrationForTesting();
  });

  afterEach(() => {
    _resetServiceWorkerRegistrationForTesting();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('registers the SW at the root scope using a root-served URL', async () => {
    const fakeReg = { scope: '/' } as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(fakeReg);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
      writable: true,
    });

    const result = await registerAppServiceWorker();
    expect(register).toHaveBeenCalledTimes(1);

    // The URL must be a root-served path (either `/sw.js` for the
    // production bundle or `/src/sw/service-worker.ts` for dev) so the
    // browser permits `scope: '/'` without a Service-Worker-Allowed
    // header on a non-root path.
    const [url, options] = register.mock.calls[0] ?? [];
    expect(typeof url).toBe('string');
    expect((url as string).startsWith('/')).toBe(true);
    expect((url as string).startsWith('/assets/')).toBe(false);
    expect(options).toMatchObject({ scope: '/', type: 'module' });
    expect(result).toBe(fakeReg);
  });

  it('returns the same promise for concurrent callers (singleton)', async () => {
    const fakeReg = { scope: '/' } as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(fakeReg);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
      writable: true,
    });

    const a = registerAppServiceWorker();
    const b = registerAppServiceWorker();
    const c = registerAppServiceWorker();

    expect(a).toBe(b);
    expect(b).toBe(c);

    await Promise.all([a, b, c]);

    // Only one underlying register() call, even with three callers.
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('resolves to null when serviceWorker is unavailable', async () => {
    // Strip serviceWorker from navigator
    const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const result = await registerAppServiceWorker();
    expect(result).toBeNull();

    // Restore so it doesn't leak into other tests
    if (original) Object.defineProperty(navigator, 'serviceWorker', original);
  });

  it('does not register a service worker on the Vite dev server (#3064)', async () => {
    // The dev server runs in MODE 'development'; a production SW there shadows
    // the dev server and causes an infinite HMR reload loop.
    vi.stubEnv('MODE', 'development');

    const register = vi.fn().mockResolvedValue({ scope: '/' } as ServiceWorkerRegistration);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
      writable: true,
    });

    expect(isViteDevServer()).toBe(true);

    const result = await registerAppServiceWorker();

    expect(register).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('still registers under the Vitest runner (MODE "test")', async () => {
    // Guard against a regression where the dev-server skip also disables the
    // SW in tests / production. The default Vitest MODE is 'test'.
    expect(isViteDevServer()).toBe(false);

    const register = vi.fn().mockResolvedValue({ scope: '/' } as ServiceWorkerRegistration);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
      writable: true,
    });

    await registerAppServiceWorker();

    expect(register).toHaveBeenCalledTimes(1);
  });
});

describe('unregisterDevServiceWorkers (#3064)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('unregisters every worker and clears every cache', async () => {
    const unregisterA = vi.fn().mockResolvedValue(true);
    const unregisterB = vi.fn().mockResolvedValue(true);
    const getRegistrations = vi
      .fn()
      .mockResolvedValue([{ unregister: unregisterA }, { unregister: unregisterB }]);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations },
      configurable: true,
      writable: true,
    });

    const cacheDelete = vi.fn().mockResolvedValue(true);
    const cacheKeys = vi.fn().mockResolvedValue(['finance-static-v1', 'finance-sync-v1']);
    vi.stubGlobal('caches', { keys: cacheKeys, delete: cacheDelete });

    await unregisterDevServiceWorkers();

    expect(unregisterA).toHaveBeenCalledTimes(1);
    expect(unregisterB).toHaveBeenCalledTimes(1);
    expect(cacheDelete).toHaveBeenCalledWith('finance-static-v1');
    expect(cacheDelete).toHaveBeenCalledWith('finance-sync-v1');
  });

  it('is a no-op (no throw) when serviceWorker is unavailable', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    await expect(unregisterDevServiceWorkers()).resolves.toBeUndefined();

    if (original) Object.defineProperty(navigator, 'serviceWorker', original);
  });

  it('swallows errors so cleanup never blocks app start', async () => {
    const getRegistrations = vi.fn().mockRejectedValue(new Error('boom'));
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations },
      configurable: true,
      writable: true,
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(unregisterDevServiceWorkers()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });
});
