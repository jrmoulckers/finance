// SPDX-License-Identifier: BUSL-1.1

import {
  buildPasskeyGateRequestOptions,
  isPasskeyAppLockSupported,
  type PasskeyGateChallenge,
} from './passkey-gate';

export type WebAuthnChallengeStatus =
  | 'created'
  | 'verified'
  | 'unsupported'
  | 'cancelled'
  | 'failed'
  | 'expired'
  | 'replayed';

export interface WebAuthnAppLockChallenge extends PasskeyGateChallenge {
  readonly id: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly usedAtMs?: number;
}

export interface CreateWebAuthnChallengeOptions {
  readonly nowMs: number;
  readonly ttlMs?: number;
  readonly randomBytes?: Uint8Array;
  readonly crypto?: Crypto;
  readonly rpId?: string;
  readonly credentialIdsBase64Url?: readonly string[];
}

export interface CompleteWebAuthnChallengeOptions {
  readonly challenge: WebAuthnAppLockChallenge;
  readonly nowMs: number;
  readonly credentials?: CredentialsContainer;
  readonly publicKeyCredential?: typeof PublicKeyCredential;
}

export interface WebAuthnChallengeResult {
  readonly status: WebAuthnChallengeStatus;
  readonly challenge: WebAuthnAppLockChallenge;
  readonly credential?: PublicKeyCredential;
  readonly recoveryCopy: string;
  readonly error?: string;
}

export function createWebAuthnAppLockChallenge({
  nowMs,
  ttlMs = 60_000,
  randomBytes,
  crypto = globalThis.crypto,
  rpId,
  credentialIdsBase64Url,
}: CreateWebAuthnChallengeOptions): WebAuthnAppLockChallenge {
  if (ttlMs <= 0) throw new Error('WebAuthn challenge TTL must be positive.');
  const bytes = randomBytes ?? crypto.getRandomValues(new Uint8Array(32));
  if (bytes.byteLength < 16)
    throw new Error('WebAuthn challenges must contain at least 16 random bytes.');
  const challengeBase64Url = bytesToBase64Url(bytes);

  return {
    id: challengeBase64Url.slice(0, 22),
    challengeBase64Url,
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
    timeoutMs: ttlMs,
    rpId,
    credentialIdsBase64Url,
  };
}

export async function completeWebAuthnAppLockChallenge({
  challenge,
  nowMs,
  credentials = globalThis.navigator?.credentials,
  publicKeyCredential = globalThis.PublicKeyCredential,
}: CompleteWebAuthnChallengeOptions): Promise<WebAuthnChallengeResult> {
  const preflight = evaluateChallengePreflight(challenge, nowMs, credentials, publicKeyCredential);
  if (preflight) return preflight;

  try {
    const credential = await credentials.get({
      publicKey: buildPasskeyGateRequestOptions(challenge),
      mediation: 'optional',
    });

    if (!isPublicKeyCredential(credential)) {
      return finishChallenge(
        challenge,
        nowMs,
        'failed',
        undefined,
        'Passkey unlock did not return a public-key credential.',
      );
    }

    return finishChallenge(challenge, nowMs, 'verified', credential);
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'AbortError') {
      return finishChallenge(
        challenge,
        nowMs,
        'cancelled',
        undefined,
        'Passkey unlock was cancelled.',
      );
    }
    return finishChallenge(
      challenge,
      nowMs,
      'failed',
      undefined,
      error instanceof Error ? error.message : 'Passkey unlock failed.',
    );
  }
}

export function evaluateChallengePreflight(
  challenge: WebAuthnAppLockChallenge,
  nowMs: number,
  credentials: CredentialsContainer | undefined = globalThis.navigator?.credentials,
  publicKeyCredential: typeof PublicKeyCredential | undefined = globalThis.PublicKeyCredential,
): WebAuthnChallengeResult | null {
  if (!isPasskeyAppLockSupported(credentials, publicKeyCredential)) {
    return finishChallenge(
      challenge,
      nowMs,
      'unsupported',
      undefined,
      'Passkey app lock is not supported in this browser.',
    );
  }
  if (challenge.usedAtMs !== undefined) {
    return finishChallenge(
      challenge,
      nowMs,
      'replayed',
      undefined,
      'This passkey challenge was already used.',
    );
  }
  if (nowMs > challenge.expiresAtMs) {
    return finishChallenge(
      challenge,
      nowMs,
      'expired',
      undefined,
      'This passkey challenge expired.',
    );
  }
  return null;
}

function finishChallenge(
  challenge: WebAuthnAppLockChallenge,
  nowMs: number,
  status: Exclude<WebAuthnChallengeStatus, 'created'>,
  credential?: PublicKeyCredential,
  error?: string,
): WebAuthnChallengeResult {
  return {
    status,
    challenge: status === 'verified' ? { ...challenge, usedAtMs: nowMs } : challenge,
    credential,
    recoveryCopy:
      status === 'unsupported'
        ? 'Use the configured recovery method or disable app lock from a trusted session on this device.'
        : 'If passkey unlock fails, use the recovery method configured when app lock was enabled.',
    error,
  };
}

function isPublicKeyCredential(value: Credential | null): value is PublicKeyCredential {
  return value !== null && value.type === 'public-key' && 'rawId' in value;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
