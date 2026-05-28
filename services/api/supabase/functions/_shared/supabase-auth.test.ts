// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the Supabase Auth wrapper helpers (#1886).
 *
 * Coverage focuses on the pure code paths — PKCE material generation,
 * provider type guards, and authorize-URL construction. The HTTP-bound
 * grant helpers (passwordGrant, refreshGrant, pkceGrant, signupUser) are
 * exercised by the per-function integration tests with fetch mocks.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import {
  SUPPORTED_PROVIDERS,
  buildAuthorizeUrl,
  generatePkceMaterial,
  isSupportedProvider,
} from './supabase-auth.ts';

// ---------------------------------------------------------------------------
// isSupportedProvider
// ---------------------------------------------------------------------------

Deno.test('isSupportedProvider — accepts google, github, apple', () => {
  assertEquals(isSupportedProvider('google'), true);
  assertEquals(isSupportedProvider('github'), true);
  assertEquals(isSupportedProvider('apple'), true);
});

Deno.test('isSupportedProvider — rejects unknown provider', () => {
  assertEquals(isSupportedProvider('facebook'), false);
  assertEquals(isSupportedProvider(''), false);
  assertEquals(isSupportedProvider('GOOGLE'), false); // case-sensitive
});

Deno.test('SUPPORTED_PROVIDERS — exposes exactly google/github/apple', () => {
  assertEquals([...SUPPORTED_PROVIDERS], ['google', 'github', 'apple']);
});

// ---------------------------------------------------------------------------
// generatePkceMaterial
// ---------------------------------------------------------------------------

Deno.test('generatePkceMaterial — verifier is URL-safe base64, 43+ chars', async () => {
  const pkce = await generatePkceMaterial();
  assert(/^[A-Za-z0-9_-]+$/.test(pkce.codeVerifier), 'verifier must be URL-safe');
  assert(pkce.codeVerifier.length >= 43, 'verifier must be at least 43 chars');
});

Deno.test(
  'generatePkceMaterial — challenge is URL-safe and matches SHA-256(verifier)',
  async () => {
    const pkce = await generatePkceMaterial();
    assert(/^[A-Za-z0-9_-]+$/.test(pkce.codeChallenge), 'challenge must be URL-safe');

    // SHA-256(verifier) base64url should be exactly 43 chars (256 bits / 6 ≈ 42.67).
    assertEquals(pkce.codeChallenge.length, 43);

    // Recompute to confirm.
    const expected = await sha256Base64Url(pkce.codeVerifier);
    assertEquals(pkce.codeChallenge, expected);
  },
);

Deno.test('generatePkceMaterial — successive calls produce distinct material', async () => {
  const a = await generatePkceMaterial();
  const b = await generatePkceMaterial();
  assert(a.codeVerifier !== b.codeVerifier);
  assert(a.codeChallenge !== b.codeChallenge);
});

// ---------------------------------------------------------------------------
// buildAuthorizeUrl
// ---------------------------------------------------------------------------

Deno.test('buildAuthorizeUrl — embeds provider, challenge, redirect_to (no state)', async () => {
  Deno.env.set('SUPABASE_URL', 'https://example.supabase.co');
  try {
    const pkce = await generatePkceMaterial();
    const url = buildAuthorizeUrl('google', pkce, 'http://localhost:5173/api/auth/oauth-callback');
    const parsed = new URL(url);

    assertEquals(parsed.origin, 'https://example.supabase.co');
    assertEquals(parsed.pathname, '/auth/v1/authorize');
    assertEquals(parsed.searchParams.get('provider'), 'google');
    assertEquals(parsed.searchParams.get('code_challenge'), pkce.codeChallenge);
    assertEquals(parsed.searchParams.get('code_challenge_method'), 'S256');
    // Supabase Cloud owns the `state` value end-to-end; passing our own
    // nonce causes it to reject the callback with `bad_oauth_state`.
    assertEquals(parsed.searchParams.get('state'), null);
    assertEquals(
      parsed.searchParams.get('redirect_to'),
      'http://localhost:5173/api/auth/oauth-callback',
    );
  } finally {
    Deno.env.delete('SUPABASE_URL');
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
