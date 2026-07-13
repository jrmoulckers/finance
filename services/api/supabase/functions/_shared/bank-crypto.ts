// SPDX-License-Identifier: BUSL-1.1

/**
 * Bank access-token encryption helpers (#3848).
 *
 * Provides authenticated encryption (AES-256-GCM) for aggregator access
 * tokens (Plaid/MX) before they are written to `bank_connections`. Uses the
 * Web Crypto API (crypto.subtle) available in the Deno runtime — NOT Node's
 * `crypto` module.
 *
 * Security:
 *   - AES-256-GCM provides confidentiality AND integrity (auth tag).
 *   - A fresh random 96-bit IV is generated for every encryption.
 *   - The key is derived from BANK_ENCRYPTION_KEY: a 64-char hex string is
 *     decoded to 32 raw bytes; any other value is hashed with SHA-256 to
 *     produce a stable 32-byte key.
 *   - NEVER log the plaintext token, the ciphertext, or the key material.
 *
 * Serialized format:  `aes256gcm:<base64url(iv)>:<base64url(ciphertext+tag)>`
 */

/** Prefix identifying the ciphertext envelope version/algorithm. */
export const TOKEN_ENVELOPE_PREFIX = 'aes256gcm';

/** Length of the AES-GCM initialization vector in bytes (96 bits). */
const IV_LENGTH = 12;

// ---------------------------------------------------------------------------
// base64url helpers (no padding)
// ---------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

const HEX_64_PATTERN = /^[0-9a-fA-F]{64}$/;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Derive a 32-byte AES-256 key from the configured key material.
 *
 * Accepts either a 64-character hex string (decoded directly to 32 bytes)
 * or any other string (hashed with SHA-256 to a deterministic 32 bytes).
 */
async function deriveKeyBytes(keyMaterial: string): Promise<Uint8Array> {
  if (HEX_64_PATTERN.test(keyMaterial)) {
    return hexToBytes(keyMaterial);
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyMaterial));
  return new Uint8Array(digest);
}

async function importAesKey(keyMaterial: string, usage: KeyUsage): Promise<CryptoKey> {
  const keyBytes = await deriveKeyBytes(keyMaterial);
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [usage]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt a plaintext access token for storage.
 *
 * @param plaintext The raw provider access token. NEVER logged.
 * @param keyMaterial The BANK_ENCRYPTION_KEY value.
 * @returns The serialized ciphertext envelope (safe to persist).
 */
export async function encryptToken(plaintext: string, keyMaterial: string): Promise<string> {
  if (!keyMaterial) {
    throw new Error('Encryption key not configured');
  }
  const key = await importAesKey(keyMaterial, 'encrypt');
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const data = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

  return [
    TOKEN_ENVELOPE_PREFIX,
    bytesToBase64Url(iv),
    bytesToBase64Url(new Uint8Array(ciphertext)),
  ].join(':');
}

/**
 * Decrypt a serialized ciphertext envelope back to the plaintext token.
 *
 * @param envelope The serialized value produced by {@link encryptToken}.
 * @param keyMaterial The BANK_ENCRYPTION_KEY value.
 * @returns The plaintext token. NEVER logged.
 */
export async function decryptToken(envelope: string, keyMaterial: string): Promise<string> {
  if (!keyMaterial) {
    throw new Error('Encryption key not configured');
  }
  const parts = envelope.split(':');
  if (parts.length !== 3 || parts[0] !== TOKEN_ENVELOPE_PREFIX) {
    throw new Error('Malformed ciphertext envelope');
  }

  const key = await importAesKey(keyMaterial, 'decrypt');
  const iv = base64UrlToBytes(parts[1]);
  const ciphertext = base64UrlToBytes(parts[2]);

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
