// SPDX-License-Identifier: BUSL-1.1

/**
 * Secure-context-safe UUID generation.
 *
 * `crypto.randomUUID()` is only defined in a secure context (HTTPS or
 * `localhost`). When the app is served over plain HTTP on a non-`localhost`
 * host (a LAN IP or a Tailscale hostname used for on-device testing), the API
 * is `undefined` and calling it throws `TypeError: crypto.randomUUID is not a
 * function`. Any code path that relies on it unguarded then breaks — including
 * privacy-consent recording during onboarding.
 *
 * This helper prefers the native API when available and otherwise falls back to
 * a `crypto.getRandomValues`-based RFC-4122 v4 generator, with a final
 * `Math.random` fallback so ID generation never throws.
 *
 * References: issue #3898 (onboarding privacy buttons dead in non-secure context)
 */

/** Generate an RFC-4122 v4 UUID that works in non-secure browsing contexts. */
export function safeRandomUUID(): string {
  const cryptoObj = globalThis.crypto;

  if (typeof cryptoObj?.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoObj?.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  // Set the version (4) and variant (RFC 4122) bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}
