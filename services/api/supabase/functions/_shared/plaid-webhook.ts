// SPDX-License-Identifier: BUSL-1.1

/**
 * Plaid webhook signature verification (#3848).
 *
 * Plaid signs each webhook with a JWT (JWS, ES256) delivered in the
 * `Plaid-Verification` header. Verification follows Plaid's documented flow:
 *
 *   1. Decode the JWT header; require alg === 'ES256' and read `kid`.
 *   2. Fetch the public verification key for that `kid`
 *      (POST /webhook_verification_key/get) — injected here as `fetchKey`.
 *   3. Verify the JWT signature (ECDSA P-256 / SHA-256) over `header.payload`.
 *   4. Reject tokens whose `iat` is older than the replay window (5 min).
 *   5. Compute SHA-256 of the RAW request body and compare (timing-safe) to
 *      the `request_body_sha256` claim.
 *
 * Security:
 *   - Uses only Web Crypto (crypto.subtle) — no Node APIs.
 *   - Fails closed on any malformed input.
 *   - NEVER logs the body, the JWT, or key material.
 */

import type { PlaidVerificationKey } from './plaid.ts';

/** Maximum accepted age of a webhook JWT (seconds) — replay protection. */
const MAX_WEBHOOK_AGE_SECONDS = 300;

/** Options for {@link verifyPlaidWebhook}. */
export interface VerifyPlaidWebhookOptions {
  /** Resolves the public verification key for a given `kid`. */
  fetchKey: (keyId: string) => Promise<PlaidVerificationKey | null>;
  /** Current time in ms (injectable for tests). Defaults to Date.now(). */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// base64url helpers
// ---------------------------------------------------------------------------

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlToJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
}

// ---------------------------------------------------------------------------
// SHA-256 body hashing
// ---------------------------------------------------------------------------

/** Compute the lowercase hex SHA-256 digest of a UTF-8 string. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time comparison of two equal-length hex strings. */
function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// JWS verification
// ---------------------------------------------------------------------------

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface PlaidJwtClaims {
  iat: number;
  request_body_sha256: string;
}

async function importVerifyKey(key: PlaidVerificationKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    { kty: key.kty, crv: key.crv, x: key.x, y: key.y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
}

/**
 * Verify a Plaid webhook.
 *
 * @param rawBody The exact raw request body string (unparsed).
 * @param verificationHeader The `Plaid-Verification` header value (a JWT).
 * @param options Key fetcher and optional clock.
 * @returns true only if every check passes.
 */
export async function verifyPlaidWebhook(
  rawBody: string,
  verificationHeader: string | null,
  options: VerifyPlaidWebhookOptions,
): Promise<boolean> {
  if (!verificationHeader) return false;

  const parts = verificationHeader.split('.');
  if (parts.length !== 3) return false;

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: JwtHeader;
  try {
    header = base64UrlToJson<JwtHeader>(headerB64);
  } catch {
    return false;
  }

  // Plaid only signs webhooks with ES256; reject anything else (incl. "none").
  if (header.alg !== 'ES256' || !header.kid) return false;

  const key = await options.fetchKey(header.kid);
  if (!key) return false;

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await importVerifyKey(key);
  } catch {
    return false;
  }

  let signatureValid: boolean;
  try {
    const signature = base64UrlToBytes(signatureB64);
    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    signatureValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      signature,
      signedData,
    );
  } catch {
    return false;
  }
  if (!signatureValid) return false;

  let claims: PlaidJwtClaims;
  try {
    claims = base64UrlToJson<PlaidJwtClaims>(payloadB64);
  } catch {
    return false;
  }

  // Replay protection: reject stale tokens.
  const nowSeconds = Math.floor((options.now?.() ?? Date.now()) / 1000);
  if (
    typeof claims.iat !== 'number' ||
    Math.abs(nowSeconds - claims.iat) > MAX_WEBHOOK_AGE_SECONDS
  ) {
    return false;
  }

  // Bind the signed claim to the actual delivered body.
  if (typeof claims.request_body_sha256 !== 'string') return false;
  const actualHash = await sha256Hex(rawBody);
  return timingSafeHexEqual(actualHash, claims.request_body_sha256);
}
