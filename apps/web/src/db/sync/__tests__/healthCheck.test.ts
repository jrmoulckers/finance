// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the connection health check module.
 *
 * References: issue #535
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSyncHealth, clearHealthCheckCache, getCachedHealthCheck } from '../healthCheck';
import { resetSyncConfig } from '../replayMutations';

describe('checkSyncHealth', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    resetSyncConfig();
    clearHealthCheckCache();

    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearHealthCheckCache();
  });

  it('should return reachable: true when server responds 200', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { Date: new Date().toUTCString() },
      }),
    );

    const result = await checkSyncHealth();
    expect(result.reachable).toBe(true);
    expect(result.status).toBe(200);
    expect(result.latencyMs).toBeTypeOf('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should return reachable: false when server responds 500', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));

    const result = await checkSyncHealth();
    expect(result.reachable).toBe(false);
    expect(result.status).toBe(500);
  });

  it('should return reachable: false on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Network error'));

    const result = await checkSyncHealth();
    expect(result.reachable).toBe(false);
    expect(result.status).toBeNull();
    expect(result.latencyMs).toBeNull();
  });

  it('should return reachable: false when offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });

    const result = await checkSyncHealth();
    expect(result.reachable).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should return cached result within cooldown period', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }));

    const first = await checkSyncHealth();
    const second = await checkSyncHealth();

    // fetch should only have been called once
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('should bypass cache when force=true', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await checkSyncHealth();
    await checkSyncHealth(true);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should clear cache', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    await checkSyncHealth();
    expect(getCachedHealthCheck()).not.toBeNull();

    clearHealthCheckCache();
    expect(getCachedHealthCheck()).toBeNull();
  });

  it('should capture server time from Date header', async () => {
    const serverDate = new Date().toUTCString();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { Date: serverDate },
      }),
    );

    const result = await checkSyncHealth();
    expect(result.serverTime).toBe(serverDate);
  });

  it('should send HEAD request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }));

    await checkSyncHealth();

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init as RequestInit).method).toBe('HEAD');
  });
});
