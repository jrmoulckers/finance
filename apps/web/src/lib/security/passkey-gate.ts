// SPDX-License-Identifier: BUSL-1.1

/** App-lock helpers built on WebAuthn user verification/passkeys. */

export type AppLockDecisionReason = 'disabled' | 'manual' | 'idle_timeout' | 'resume' | 'unsupported';
export type PasskeyGateStatus = 'unlocked' | 'unsupported' | 'cancelled' | 'failed';

export interface AppLockPolicy {
  readonly enabled: boolean;
  readonly idleTimeoutMs: number;
  readonly lockOnResume: boolean;
}

export interface AppLockState {
  readonly locked: boolean;
  readonly reason: AppLockDecisionReason;
}

export interface PasskeyGateChallenge {
  readonly challengeBase64Url: string;
  readonly rpId?: string;
  readonly credentialIdsBase64Url?: readonly string[];
  readonly timeoutMs?: number;
}

export interface PasskeyGateResult {
  readonly status: PasskeyGateStatus;
  readonly credential?: PublicKeyCredential;
  readonly error?: string;
}

export interface VerifyPasskeyGateOptions {
  readonly challenge: PasskeyGateChallenge;
  readonly credentials?: CredentialsContainer;
  readonly publicKeyCredential?: typeof PublicKeyCredential;
}

export function isPasskeyAppLockSupported(
  credentials: CredentialsContainer | undefined = globalThis.navigator?.credentials,
  publicKeyCredential: typeof PublicKeyCredential | undefined = globalThis.PublicKeyCredential,
): boolean {
  return typeof publicKeyCredential !== 'undefined' && typeof credentials?.get === 'function';
}

export function shouldLockApp(
  policy: AppLockPolicy,
  lastUnlockedAtMs: number | null,
  nowMs: number,
  event: 'manual' | 'activity' | 'resume',
): AppLockState {
  if (!policy.enabled) return { locked: false, reason: 'disabled' };
  if (event === 'manual') return { locked: true, reason: 'manual' };
  if (event === 'resume' && policy.lockOnResume) return { locked: true, reason: 'resume' };
  if (lastUnlockedAtMs === null || nowMs - lastUnlockedAtMs >= policy.idleTimeoutMs) {
    return { locked: true, reason: 'idle_timeout' };
  }
  return { locked: false, reason: 'disabled' };
}

export function buildPasskeyGateRequestOptions(
  challenge: PasskeyGateChallenge,
): PublicKeyCredentialRequestOptions {
  return {
    challenge: base64UrlToArrayBuffer(challenge.challengeBase64Url),
    rpId: challenge.rpId,
    timeout: challenge.timeoutMs ?? 60_000,
    userVerification: 'required',
    allowCredentials: challenge.credentialIdsBase64Url?.map((id) => ({
      id: base64UrlToArrayBuffer(id),
      type: 'public-key',
    })),
  };
}

export async function verifyPasskeyGate({
  challenge,
  credentials = globalThis.navigator?.credentials,
  publicKeyCredential = globalThis.PublicKeyCredential,
}: VerifyPasskeyGateOptions): Promise<PasskeyGateResult> {
  if (!isPasskeyAppLockSupported(credentials, publicKeyCredential)) {
    return { status: 'unsupported', error: 'Passkey app lock is not supported in this browser.' };
  }

  try {
    const credential = await credentials.get({
      publicKey: buildPasskeyGateRequestOptions(challenge),
      mediation: 'optional',
    });

    if (!isPublicKeyCredential(credential)) {
      return { status: 'failed', error: 'Passkey unlock did not return a public-key credential.' };
    }

    return { status: 'unlocked', credential };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'AbortError') {
      return { status: 'cancelled', error: 'Passkey unlock was cancelled.' };
    }
    return { status: 'failed', error: error instanceof Error ? error.message : 'Passkey unlock failed.' };
  }
}

function isPublicKeyCredential(value: Credential | null): value is PublicKeyCredential {
  return value !== null && value.type === 'public-key' && 'rawId' in value;
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}
