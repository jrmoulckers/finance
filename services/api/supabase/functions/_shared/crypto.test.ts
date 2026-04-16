// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for `_shared/crypto.ts` (#780).
 *
 * Validates:
 *   - timingSafeEqual returns true for identical strings
 *   - timingSafeEqual returns false for different strings
 *   - timingSafeEqual returns false for different length strings
 *   - timingSafeEqual handles empty strings correctly
 *   - timingSafeEqual handles Unicode strings
 *   - timingSafeEqual handles bearer token format used by CRON_SECRET
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import { timingSafeEqual } from './crypto.ts';

// ---------------------------------------------------------------------------
// Equality tests
// ---------------------------------------------------------------------------

Deno.test('timingSafeEqual — returns true for identical strings', async () => {
  const result = await timingSafeEqual('my-secret-key', 'my-secret-key');
  assertEquals(result, true);
});

Deno.test('timingSafeEqual — returns true for identical long strings', async () => {
  const secret = 'a'.repeat(256);
  const result = await timingSafeEqual(secret, secret);
  assertEquals(result, true);
});

Deno.test('timingSafeEqual — returns true for identical bearer token format', async () => {
  const token = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123';
  const result = await timingSafeEqual(token, token);
  assertEquals(result, true);
});

// ---------------------------------------------------------------------------
// Inequality tests
// ---------------------------------------------------------------------------

Deno.test('timingSafeEqual — returns false for completely different strings', async () => {
  const result = await timingSafeEqual('secret-a', 'secret-b');
  assertEquals(result, false);
});

Deno.test('timingSafeEqual — returns false when strings differ by one character', async () => {
  const result = await timingSafeEqual('Bearer abc123', 'Bearer abc124');
  assertEquals(result, false);
});

Deno.test('timingSafeEqual — returns false when first char differs', async () => {
  const result = await timingSafeEqual('Xearer abc123', 'Bearer abc123');
  assertEquals(result, false);
});

Deno.test('timingSafeEqual — returns false when last char differs', async () => {
  const result = await timingSafeEqual('Bearer abc123', 'Bearer abc12X');
  assertEquals(result, false);
});

// ---------------------------------------------------------------------------
// Length mismatch tests
// ---------------------------------------------------------------------------

Deno.test('timingSafeEqual — returns false for different lengths (a shorter)', async () => {
  const result = await timingSafeEqual('short', 'longer-string');
  assertEquals(result, false);
});

Deno.test('timingSafeEqual — returns false for different lengths (b shorter)', async () => {
  const result = await timingSafeEqual('longer-string', 'short');
  assertEquals(result, false);
});

Deno.test('timingSafeEqual — returns false when one is prefix of the other', async () => {
  const result = await timingSafeEqual('Bearer abc', 'Bearer abc123');
  assertEquals(result, false);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

Deno.test('timingSafeEqual — returns true for two empty strings', async () => {
  const result = await timingSafeEqual('', '');
  assertEquals(result, true);
});

Deno.test('timingSafeEqual — returns false for empty vs non-empty', async () => {
  const result = await timingSafeEqual('', 'non-empty');
  assertEquals(result, false);
});

Deno.test('timingSafeEqual — handles single character strings', async () => {
  assertEquals(await timingSafeEqual('a', 'a'), true);
  assertEquals(await timingSafeEqual('a', 'b'), false);
});

Deno.test('timingSafeEqual — handles Unicode strings', async () => {
  assertEquals(await timingSafeEqual('héllo wörld', 'héllo wörld'), true);
  assertEquals(await timingSafeEqual('héllo wörld', 'hello world'), false);
});

Deno.test('timingSafeEqual — handles special characters', async () => {
  const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  assertEquals(await timingSafeEqual(specialChars, specialChars), true);
});
