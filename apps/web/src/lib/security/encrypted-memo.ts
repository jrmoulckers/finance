// SPDX-License-Identifier: BUSL-1.1

/**
 * Encrypted Memo — encryption/decryption helpers with redaction and export controls.
 *
 * Provides memo encryption using a placeholder encoding for tests.
 * The API is structured for Web Crypto API (SubtleCrypto) — the real
 * implementation will swap the encode/decode logic while keeping the
 * same interface.
 *
 * Placeholder implementation uses base64 encoding (NOT real encryption).
 * This is intentional — see the inline TODO markers for where real
 * AES-GCM encryption will be integrated.
 *
 * References: issue #1723
 */

import type { EncryptedMemo, MemoExportOptions } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Algorithm identifier for the placeholder implementation. */
const PLACEHOLDER_ALGORITHM = 'placeholder-base64';

/** Redaction marker for exported memos. */
const REDACTED_MARKER = '[REDACTED]';

// ---------------------------------------------------------------------------
// Base64 helpers (placeholder for Web Crypto)
// ---------------------------------------------------------------------------

/**
 * Encode a string to base64.
 *
 * @param text - The plaintext to encode.
 * @returns Base64-encoded string.
 */
function toBase64(text: string): string {
  // TODO(crypto): Replace with AES-GCM encryption via SubtleCrypto
  return btoa(
    encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, p1: string) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );
}

/**
 * Decode a base64 string.
 *
 * @param encoded - The base64-encoded string.
 * @returns Decoded plaintext.
 */
function fromBase64(encoded: string): string {
  // TODO(crypto): Replace with AES-GCM decryption via SubtleCrypto
  return decodeURIComponent(
    Array.from(atob(encoded))
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join(''),
  );
}

/**
 * Generate a placeholder initialization vector.
 *
 * @returns A base64-encoded random IV string.
 */
function generateIv(): string {
  // TODO(crypto): Use crypto.getRandomValues(new Uint8Array(12)) for real AES-GCM
  const array = new Uint8Array(12);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

// ---------------------------------------------------------------------------
// Encryption / Decryption
// ---------------------------------------------------------------------------

/**
 * Encrypt a memo string.
 *
 * In the placeholder implementation, this uses base64 encoding.
 * The production implementation will use AES-GCM via Web Crypto API.
 *
 * @param plaintext - The memo text to encrypt.
 * @returns An EncryptedMemo object.
 */
export function encryptMemo(plaintext: string): EncryptedMemo {
  if (!plaintext) {
    throw new Error('Cannot encrypt an empty memo.');
  }

  return {
    ciphertext: toBase64(plaintext),
    iv: generateIv(),
    algorithm: PLACEHOLDER_ALGORITHM,
    encryptedAt: new Date().toISOString(),
  };
}

/**
 * Decrypt an encrypted memo.
 *
 * @param memo - The EncryptedMemo to decrypt.
 * @returns The decrypted plaintext string.
 */
export function decryptMemo(memo: EncryptedMemo): string {
  if (memo.algorithm !== PLACEHOLDER_ALGORITHM) {
    throw new Error(`Unsupported algorithm: ${memo.algorithm}`);
  }

  return fromBase64(memo.ciphertext);
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Redact a memo for export — replaces content with [REDACTED].
 *
 * @param _memo - The EncryptedMemo to redact (content is ignored).
 * @returns The redaction marker string.
 */
export function redactMemo(_memo: EncryptedMemo): string {
  return REDACTED_MARKER;
}

/**
 * Check if a string is a redacted marker.
 *
 * @param text - The text to check.
 * @returns True if the text is the redaction marker.
 */
export function isRedacted(text: string): boolean {
  return text === REDACTED_MARKER;
}

// ---------------------------------------------------------------------------
// Export controls
// ---------------------------------------------------------------------------

/**
 * Process a memo for export based on export options.
 *
 * @param memo - The EncryptedMemo to process.
 * @param options - Export settings controlling inclusion and redaction.
 * @returns The processed memo string, or null if excluded from export.
 */
export function processMemoForExport(
  memo: EncryptedMemo,
  options: MemoExportOptions,
): string | null {
  if (!options.includeMemos) {
    return null;
  }

  if (options.redactMemos) {
    return redactMemo(memo);
  }

  return decryptMemo(memo);
}

/**
 * Batch-process multiple memos for export.
 *
 * @param memos - An array of EncryptedMemo objects.
 * @param options - Export settings.
 * @returns An array of processed memo strings (excluded memos are filtered out).
 */
export function batchProcessMemosForExport(
  memos: readonly EncryptedMemo[],
  options: MemoExportOptions,
): string[] {
  const results: string[] = [];

  for (const memo of memos) {
    const processed = processMemoForExport(memo, options);
    if (processed !== null) {
      results.push(processed);
    }
  }

  return results;
}
