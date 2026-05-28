// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the `redirect_to` allowlist (#1886).
 *
 * The allowlist is the single defence against open-redirect attacks on
 * the OAuth callback, so the test coverage focuses on rejection of
 * crafted inputs.
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import { DEFAULT_POST_LOGIN_PATH, validateRedirectTo } from './redirect-allowlist.ts';

Deno.test('validateRedirectTo — accepts /dashboard', () => {
  assertEquals(validateRedirectTo('/dashboard'), '/dashboard');
});

Deno.test('validateRedirectTo — accepts /', () => {
  assertEquals(validateRedirectTo('/'), '/');
});

Deno.test('validateRedirectTo — accepts /onboarding', () => {
  assertEquals(validateRedirectTo('/onboarding'), '/onboarding');
});

Deno.test('validateRedirectTo — rejects null', () => {
  assertEquals(validateRedirectTo(null), null);
});

Deno.test('validateRedirectTo — rejects undefined', () => {
  assertEquals(validateRedirectTo(undefined), null);
});

Deno.test('validateRedirectTo — rejects empty string', () => {
  assertEquals(validateRedirectTo(''), null);
});

Deno.test('validateRedirectTo — rejects absolute URL', () => {
  assertEquals(validateRedirectTo('https://evil.com/dashboard'), null);
});

Deno.test('validateRedirectTo — rejects protocol-relative URL', () => {
  assertEquals(validateRedirectTo('//evil.com'), null);
});

Deno.test('validateRedirectTo — rejects backslash-prefixed URL', () => {
  // Some browsers normalise `/\evil.com` as `//evil.com` (open-redirect bypass).
  assertEquals(validateRedirectTo('/\\evil.com'), null);
});

Deno.test('validateRedirectTo — rejects path not on allowlist', () => {
  assertEquals(validateRedirectTo('/admin'), null);
  assertEquals(validateRedirectTo('/settings'), null);
});

Deno.test('validateRedirectTo — rejects path missing leading slash', () => {
  assertEquals(validateRedirectTo('dashboard'), null);
});

Deno.test('validateRedirectTo — rejects oversized input', () => {
  assertEquals(validateRedirectTo('/' + 'a'.repeat(300)), null);
});

Deno.test('DEFAULT_POST_LOGIN_PATH — is /dashboard', () => {
  assertEquals(DEFAULT_POST_LOGIN_PATH, '/dashboard');
});
