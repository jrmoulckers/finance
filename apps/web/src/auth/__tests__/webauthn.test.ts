// SPDX-License-Identifier: BUSL-1.1

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function bytes(values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer as ArrayBuffer;
}

function base64Url(values: number[]): string {
  return btoa(String.fromCharCode(...values))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function installWebAuthnSurface(getMock = vi.fn()): void {
  Object.defineProperty(window, 'PublicKeyCredential', {
    configurable: true,
    writable: true,
    value: {},
  });

  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    writable: true,
    value: { get: getMock },
  });
}

describe('WebAuthn defensive initialisation', () => {
  beforeEach(() => {
    vi.resetModules();
    installWebAuthnSurface();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lazily initialises passkey authentication from inline config', async () => {
    const getMock = vi.fn().mockResolvedValue({
      id: 'credential-id',
      rawId: bytes([9, 8, 7]),
      type: 'public-key',
      response: {
        clientDataJSON: bytes([1, 2, 3]),
        authenticatorData: bytes([4, 5, 6]),
        signature: bytes([7, 8, 9]),
        userHandle: bytes([10, 11, 12]),
      },
      getClientExtensionResults: () => ({}),
    } as unknown as PublicKeyCredential);
    installWebAuthnSurface(getMock);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          challenge: base64Url([1, 2, 3, 4]),
          timeout: 60_000,
          rpId: 'localhost',
          userVerification: 'preferred',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          verified: true,
          user_id: 'user-1',
          access_token: 'access-token',
          user: { id: 'user-1', email: 'alex@example.com' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { authenticateWithPasskey, isWebAuthnReady } = await import('../webauthn');

    expect(isWebAuthnReady()).toBe(false);

    const result = await authenticateWithPasskey(undefined, {
      supabaseUrl: 'https://finance-test.supabase.co',
      supabaseAnonKey: 'anon-key',
    });

    expect(result).toMatchObject({
      verified: true,
      userId: 'user-1',
      accessToken: 'access-token',
      email: 'alex@example.com',
    });
    expect(isWebAuthnReady()).toBe(true);
    expect(getMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/functions/v1/passkey-authenticate?step=options',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({ apikey: 'anon-key' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/functions/v1/passkey-authenticate?step=verify',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        headers: expect.objectContaining({ apikey: 'anon-key' }),
      }),
    );
  });

  it('returns a clear retryable error when no config is available', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { authenticateWithPasskey } = await import('../webauthn');

    await expect(authenticateWithPasskey()).rejects.toThrow(
      'Passkey sign-in is still initialising. Try again in a moment.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
