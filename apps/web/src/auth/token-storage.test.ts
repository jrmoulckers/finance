// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearTokens, initTokenManager, refreshAccessToken } from './token-storage';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('refreshAccessToken', () => {
  const onSessionExpired = vi.fn();

  beforeEach(() => {
    clearTokens();
    onSessionExpired.mockReset();
    initTokenManager({ refreshEndpoint: '/api/auth/refresh', onSessionExpired });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearTokens();
  });

  it('returns success with the refreshed access token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ access_token: 'header.payload.signature', expires_in: 3600 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshAccessToken()).resolves.toEqual({
      kind: 'success',
      token: 'header.payload.signature',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/refresh',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
  });

  it('returns session_expired for HTTP 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'expired' }, 401)));

    await expect(refreshAccessToken()).resolves.toEqual({ kind: 'session_expired' });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('returns network_error for fetch failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await refreshAccessToken();

    expect(result.kind).toBe('network_error');
    if (result.kind === 'network_error') {
      expect(result.error).toBeInstanceOf(TypeError);
      expect(result.error.message).toBe('Failed to fetch');
    }
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('returns network_error for server errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'unavailable' }, 503)));

    const result = await refreshAccessToken();

    expect(result.kind).toBe('network_error');
    if (result.kind === 'network_error') {
      expect(result.error.message).toContain('HTTP 503');
    }
    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});
