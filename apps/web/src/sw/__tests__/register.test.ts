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

import { _resetServiceWorkerRegistrationForTesting, registerAppServiceWorker } from '../register';

describe('registerAppServiceWorker (#1965)', () => {
  beforeEach(() => {
    _resetServiceWorkerRegistrationForTesting();
  });

  afterEach(() => {
    _resetServiceWorkerRegistrationForTesting();
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

  it('clears the singleton on failure so callers can retry', async () => {
    const register = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ scope: '/' } as ServiceWorkerRegistration);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
      writable: true,
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const first = await registerAppServiceWorker();
    expect(first).toBeNull();
    expect(consoleError).toHaveBeenCalled();

    const second = await registerAppServiceWorker();
    expect(second).toEqual({ scope: '/' });
    expect(register).toHaveBeenCalledTimes(2);

    consoleError.mockRestore();
  });
});
