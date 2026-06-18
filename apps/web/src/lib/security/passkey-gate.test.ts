// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';

import {
  buildPasskeyGateRequestOptions,
  isPasskeyAppLockSupported,
  shouldLockApp,
  verifyPasskeyGate,
} from './passkey-gate';

function base64Url(values: number[]): string {
  return btoa(String.fromCharCode(...values))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('passkey gate helpers', () => {
  it('requires lock for manual, resume, and idle timeout triggers', () => {
    const policy = { enabled: true, idleTimeoutMs: 5_000, lockOnResume: true };

    expect(shouldLockApp(policy, 1_000, 2_000, 'manual')).toEqual({
      locked: true,
      reason: 'manual',
    });
    expect(shouldLockApp(policy, 1_000, 2_000, 'resume')).toEqual({
      locked: true,
      reason: 'resume',
    });
    expect(shouldLockApp(policy, 1_000, 7_000, 'activity')).toEqual({
      locked: true,
      reason: 'idle_timeout',
    });
    expect(shouldLockApp(policy, 1_000, 2_000, 'activity')).toEqual({
      locked: false,
      reason: 'disabled',
    });
  });

  it('builds a user-verifying WebAuthn request', () => {
    const options = buildPasskeyGateRequestOptions({
      challengeBase64Url: base64Url([1, 2, 3]),
      credentialIdsBase64Url: [base64Url([4, 5, 6])],
      rpId: 'finance.local',
      timeoutMs: 30_000,
    });

    expect([...new Uint8Array(options.challenge as ArrayBuffer)]).toEqual([1, 2, 3]);
    expect(options.userVerification).toBe('required');
    expect(options.allowCredentials?.[0]?.type).toBe('public-key');
  });

  it('reports unsupported browsers without invoking credentials', async () => {
    const credentials = { get: vi.fn() } as unknown as CredentialsContainer;

    expect(isPasskeyAppLockSupported(undefined, undefined)).toBe(false);
    await expect(
      verifyPasskeyGate({
        challenge: { challengeBase64Url: base64Url([1]) },
        credentials,
        publicKeyCredential: undefined,
      }),
    ).resolves.toMatchObject({ status: 'unsupported' });
    expect(credentials.get).not.toHaveBeenCalled();
  });

  it('maps successful, cancelled, and failed verification paths', async () => {
    const credential = { type: 'public-key', rawId: new ArrayBuffer(1) } as PublicKeyCredential;
    const publicKeyCredential =
      function PublicKeyCredential() {} as unknown as typeof PublicKeyCredential;

    await expect(
      verifyPasskeyGate({
        challenge: { challengeBase64Url: base64Url([1]) },
        credentials: {
          get: vi.fn().mockResolvedValue(credential),
        } as unknown as CredentialsContainer,
        publicKeyCredential,
      }),
    ).resolves.toMatchObject({ status: 'unlocked', credential });

    await expect(
      verifyPasskeyGate({
        challenge: { challengeBase64Url: base64Url([1]) },
        credentials: {
          get: vi.fn().mockRejectedValue(new DOMException('cancelled', 'NotAllowedError')),
        } as unknown as CredentialsContainer,
        publicKeyCredential,
      }),
    ).resolves.toMatchObject({ status: 'cancelled' });

    await expect(
      verifyPasskeyGate({
        challenge: { challengeBase64Url: base64Url([1]) },
        credentials: { get: vi.fn().mockResolvedValue(null) } as unknown as CredentialsContainer,
        publicKeyCredential,
      }),
    ).resolves.toMatchObject({ status: 'failed' });
  });
});
