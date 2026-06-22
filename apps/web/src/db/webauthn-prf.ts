// SPDX-License-Identifier: BUSL-1.1

/**
 * Local WebAuthn PRF helper for at-rest encryption (#2806).
 *
 * This is intentionally *separate* from the server-backed passkey sign-in flow
 * (`src/auth/webauthn.ts`). It creates / evaluates a device-bound credential
 * purely to derive a stable, high-entropy secret via the WebAuthn `prf`
 * extension. That secret wraps the SQLite data key — it never leaves the device
 * and is never sent to a server.
 *
 * The PRF secret is reproducible: evaluating the same credential with the same
 * salt always yields the same bytes, which lets us unwrap the data key later
 * with a hardware-backed authenticator (Touch ID / Windows Hello / security
 * key) instead of a passphrase.
 *
 * @see https://w3c.github.io/webauthn/#prf-extension
 */

import { base64UrlToBytes, bytesToBase64Url } from '../lib/security/encryption-at-rest';

const PRF_SALT_BYTES = 32;
const USER_HANDLE_BYTES = 16;
const CEREMONY_TIMEOUT_MS = 60_000;

/** Metadata + secret produced when enrolling a WebAuthn wrapping factor. */
export interface WebAuthnPrfEnrollment {
  readonly credentialIdBase64Url: string;
  readonly prfSaltBase64Url: string;
  readonly prfSecret: Uint8Array;
  readonly label: string;
}

interface PrfExtensionResults {
  readonly prf?: { readonly results?: { readonly first?: ArrayBuffer | Uint8Array } };
}

/** Feature-detect WebAuthn availability (PRF support is verified at runtime). */
export function isWebAuthnPrfSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function'
  );
}

function relyingPartyId(): string {
  return typeof window !== 'undefined' && window.location?.hostname
    ? window.location.hostname
    : 'localhost';
}

function readPrfSecret(credential: PublicKeyCredential): Uint8Array {
  const results = credential.getClientExtensionResults() as PrfExtensionResults;
  const first = results.prf?.results?.first;
  if (!first) {
    throw new Error(
      'This authenticator did not return a PRF secret. Use a passphrase or recovery code instead.',
    );
  }
  return first instanceof Uint8Array ? new Uint8Array(first) : new Uint8Array(first);
}

/**
 * Create a new device-bound credential and derive its PRF secret.
 *
 * The returned `prfSecret` must be consumed immediately (to wrap the data key)
 * and then zeroed by the caller.
 */
export async function createWebAuthnPrfCredential(
  label = 'Passkey',
): Promise<WebAuthnPrfEnrollment> {
  if (!isWebAuthnPrfSupported()) {
    throw new Error('Passkeys are not supported in this browser.');
  }

  const prfSalt = crypto.getRandomValues(new Uint8Array(PRF_SALT_BYTES));
  const userHandle = crypto.getRandomValues(new Uint8Array(USER_HANDLE_BYTES));
  const challenge = crypto.getRandomValues(new Uint8Array(PRF_SALT_BYTES));

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Finance', id: relyingPartyId() },
      user: {
        id: userHandle,
        name: 'finance-encryption',
        displayName: 'Finance encryption key',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      timeout: CEREMONY_TIMEOUT_MS,
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
      attestation: 'none',
      extensions: {
        prf: { eval: { first: toArrayBuffer(prfSalt) } },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Passkey enrollment was cancelled.');
  }

  // Some authenticators only surface PRF output on assertion (get), not on
  // create. Fall back to an immediate evaluation in that case.
  let prfSecret: Uint8Array;
  try {
    prfSecret = readPrfSecret(credential);
  } catch {
    prfSecret = await evaluateWebAuthnPrf(
      bytesToBase64Url(new Uint8Array(credential.rawId)),
      bytesToBase64Url(prfSalt),
    );
  }

  return {
    credentialIdBase64Url: bytesToBase64Url(new Uint8Array(credential.rawId)),
    prfSaltBase64Url: bytesToBase64Url(prfSalt),
    prfSecret,
    label,
  };
}

/**
 * Re-evaluate the PRF secret for an enrolled credential + salt (for unlock /
 * rotation). The returned secret must be consumed immediately and then zeroed.
 */
export async function evaluateWebAuthnPrf(
  credentialIdBase64Url: string,
  prfSaltBase64Url: string,
): Promise<Uint8Array> {
  if (!isWebAuthnPrfSupported()) {
    throw new Error('Passkeys are not supported in this browser.');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(PRF_SALT_BYTES));
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: relyingPartyId(),
      timeout: CEREMONY_TIMEOUT_MS,
      userVerification: 'required',
      allowCredentials: [
        {
          type: 'public-key',
          id: toArrayBuffer(base64UrlToBytes(credentialIdBase64Url)),
        },
      ],
      extensions: {
        prf: { eval: { first: toArrayBuffer(base64UrlToBytes(prfSaltBase64Url)) } },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Passkey verification was cancelled.');
  }

  return readPrfSecret(credential);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
