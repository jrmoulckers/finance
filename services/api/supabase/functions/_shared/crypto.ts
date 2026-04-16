// SPDX-License-Identifier: BUSL-1.1

/**
 * Cryptographic utilities for Supabase Edge Functions (#780).
 *
 * Provides timing-safe string comparison to prevent timing attacks
 * against secret comparisons (e.g. CRON_SECRET, API keys).
 *
 * Uses Web Crypto API (available in Deno runtime) to compute HMAC
 * digests of both strings with a fixed key and verify one against
 * the other — ensuring constant-time comparison regardless of
 * where the strings differ.
 *
 * NEVER log or return secrets being compared.
 */

// ---------------------------------------------------------------------------
// Timing-safe string comparison
// ---------------------------------------------------------------------------

/**
 * Compare two strings in constant time to prevent timing attacks.
 *
 * Implementation:
 *   1. Encode both strings as UTF-8 byte arrays
 *   2. If lengths differ, return false (length is not secret)
 *   3. Import both as HMAC-SHA-256 keys with a fixed signing payload
 *   4. Sign the same fixed message with both keys
 *   5. Verify one signature against the other key — `crypto.subtle.verify`
 *      is specified to run in constant time.
 *
 * This approach avoids the need for Node.js `crypto.timingSafeEqual`
 * which is not available in the Deno runtime used by Supabase Edge
 * Functions.
 *
 * @param a First string (e.g. the expected secret)
 * @param b Second string (e.g. the provided secret)
 * @returns true if the strings are equal, false otherwise
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  // Length difference is not timing-sensitive — the lengths of
  // secrets are not confidential (and constant-time comparison
  // of different-length buffers is undefined behaviour anyway).
  if (aBytes.length !== bBytes.length) {
    return false;
  }

  // HMAC requires a non-zero key length. Two empty strings are
  // trivially equal — and there is no timing information to leak.
  if (aBytes.length === 0) {
    return true;
  }

  // Fixed message to sign — content is irrelevant, only needs
  // to be the same for both HMAC operations.
  const fixedMessage = new Uint8Array(32);

  const algorithm = { name: 'HMAC', hash: 'SHA-256' };

  const [aKey, bKey] = await Promise.all([
    crypto.subtle.importKey('raw', aBytes, algorithm, false, ['sign', 'verify']),
    crypto.subtle.importKey('raw', bBytes, algorithm, false, ['sign']),
  ]);

  // Sign the fixed message with key derived from string b
  const bSignature = await crypto.subtle.sign('HMAC', bKey, fixedMessage);

  // Verify b's signature against key derived from string a.
  // crypto.subtle.verify performs a constant-time comparison
  // of the computed HMAC vs. the provided signature.
  return crypto.subtle.verify('HMAC', aKey, bSignature, fixedMessage);
}
