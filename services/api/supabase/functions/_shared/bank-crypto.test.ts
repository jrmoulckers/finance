// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for bank access-token encryption (#3848).
 *
 * Verifies AES-256-GCM round-trips, that ciphertext never leaks the
 * plaintext, and that decryption fails with the wrong key.
 */

import {
  assert,
  assertEquals,
  assertNotEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import { decryptToken, encryptToken, TOKEN_ENVELOPE_PREFIX } from './bank-crypto.ts';

const HEX_KEY = '0'.repeat(63) + '1'; // 64 hex chars = 32 bytes
const PASSPHRASE_KEY = 'a-non-hex-passphrase-key-material';

Deno.test('encrypt then decrypt returns the original token (hex key)', async () => {
  const token = 'access-sandbox-1234567890';
  const envelope = await encryptToken(token, HEX_KEY);
  const decrypted = await decryptToken(envelope, HEX_KEY);
  assertEquals(decrypted, token);
});

Deno.test('encrypt then decrypt returns the original token (passphrase key)', async () => {
  const token = 'access-development-abcdef';
  const envelope = await encryptToken(token, PASSPHRASE_KEY);
  assertEquals(await decryptToken(envelope, PASSPHRASE_KEY), token);
});

Deno.test('ciphertext uses the versioned envelope format', async () => {
  const envelope = await encryptToken('secret-value', HEX_KEY);
  const parts = envelope.split(':');
  assertEquals(parts.length, 3);
  assertEquals(parts[0], TOKEN_ENVELOPE_PREFIX);
});

Deno.test('ciphertext never contains the plaintext token', async () => {
  const token = 'super-sensitive-access-token';
  const envelope = await encryptToken(token, HEX_KEY);
  assertEquals(envelope.includes(token), false);
});

Deno.test('a fresh IV is used for every encryption', async () => {
  const token = 'repeatable-input';
  const a = await encryptToken(token, HEX_KEY);
  const b = await encryptToken(token, HEX_KEY);
  assertNotEquals(a, b);
});

Deno.test('decryption fails with the wrong key', async () => {
  const envelope = await encryptToken('token', HEX_KEY);
  await assertRejects(() => decryptToken(envelope, 'f'.repeat(64)));
});

Deno.test('decryption rejects a malformed envelope', async () => {
  await assertRejects(() => decryptToken('not-an-envelope', HEX_KEY));
});

Deno.test('empty key material is rejected', async () => {
  await assertRejects(() => encryptToken('token', ''), Error, 'Encryption key not configured');
});

Deno.test('tampered ciphertext fails authentication', async () => {
  const envelope = await encryptToken('token', HEX_KEY);
  const parts = envelope.split(':');
  // Flip a character in the ciphertext segment.
  const tamperedCt = parts[2].startsWith('A') ? 'B' + parts[2].slice(1) : 'A' + parts[2].slice(1);
  const tampered = `${parts[0]}:${parts[1]}:${tamperedCt}`;
  await assertRejects(() => decryptToken(tampered, HEX_KEY));
});

Deno.test('envelope prefix documents the algorithm', () => {
  assertStringIncludes(TOKEN_ENVELOPE_PREFIX, 'aes256gcm');
  assert(TOKEN_ENVELOPE_PREFIX.length > 0);
});
