// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';

import {
  completeWebAuthnAppLockChallenge,
  createWebAuthnAppLockChallenge,
  evaluateChallengePreflight,
} from './webauthn-challenge';

describe('WebAuthn app-lock challenge service', () => {
  const publicKeyCredential =
    function PublicKeyCredential() {} as unknown as typeof PublicKeyCredential;

  it('creates short-lived user-verifying challenges from strong random bytes', () => {
    const challenge = createWebAuthnAppLockChallenge({
      nowMs: 1_000,
      ttlMs: 30_000,
      randomBytes: new Uint8Array(32).fill(7),
    });

    expect(challenge.expiresAtMs).toBe(31_000);
    expect(challenge.timeoutMs).toBe(30_000);
    expect(challenge.challengeBase64Url.length).toBeGreaterThan(20);
  });

  it('rejects unsupported, expired, and replayed challenge paths before invoking WebAuthn', () => {
    const challenge = createWebAuthnAppLockChallenge({
      nowMs: 1_000,
      ttlMs: 10,
      randomBytes: new Uint8Array(32).fill(1),
    });
    const credentials = { get: vi.fn() } as unknown as CredentialsContainer;

    expect(evaluateChallengePreflight(challenge, 1_001, undefined, undefined)?.status).toBe(
      'unsupported',
    );
    expect(
      evaluateChallengePreflight(challenge, 2_000, credentials, publicKeyCredential)?.status,
    ).toBe('expired');
    expect(
      evaluateChallengePreflight(
        { ...challenge, usedAtMs: 1_002 },
        1_003,
        credentials,
        publicKeyCredential,
      )?.status,
    ).toBe('replayed');
    expect(credentials.get as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('marks a successful challenge as used to prevent replay', async () => {
    const challenge = createWebAuthnAppLockChallenge({
      nowMs: 1_000,
      randomBytes: new Uint8Array(32).fill(2),
    });
    const credential = { type: 'public-key', rawId: new ArrayBuffer(1) } as PublicKeyCredential;

    const result = await completeWebAuthnAppLockChallenge({
      challenge,
      nowMs: 1_100,
      credentials: {
        get: vi.fn().mockResolvedValue(credential),
      } as unknown as CredentialsContainer,
      publicKeyCredential,
    });

    expect(result).toMatchObject({ status: 'verified', credential });
    expect(result.challenge.usedAtMs).toBe(1_100);
    expect(
      evaluateChallengePreflight(
        result.challenge,
        1_101,
        { get: vi.fn() } as unknown as CredentialsContainer,
        publicKeyCredential,
      )?.status,
    ).toBe('replayed');
  });

  it('maps cancelled and failed WebAuthn results to recovery copy', async () => {
    const challenge = createWebAuthnAppLockChallenge({
      nowMs: 1_000,
      randomBytes: new Uint8Array(32).fill(3),
    });

    await expect(
      completeWebAuthnAppLockChallenge({
        challenge,
        nowMs: 1_100,
        credentials: {
          get: vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')),
        } as unknown as CredentialsContainer,
        publicKeyCredential,
      }),
    ).resolves.toMatchObject({ status: 'cancelled' });

    await expect(
      completeWebAuthnAppLockChallenge({
        challenge,
        nowMs: 1_100,
        credentials: { get: vi.fn().mockResolvedValue(null) } as unknown as CredentialsContainer,
        publicKeyCredential,
      }),
    ).resolves.toMatchObject({ status: 'failed' });
  });
});
