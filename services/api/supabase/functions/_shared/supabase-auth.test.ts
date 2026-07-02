// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for the Supabase Auth wrapper helpers (#1886).
 *
 * Coverage focuses on the pure code paths — PKCE material generation,
 * provider type guards, and authorize-URL construction. The HTTP-bound
 * grant helpers (passwordGrant, refreshGrant, pkceGrant, signupUser) are
 * exercised by the per-function integration tests with fetch mocks.
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import {
  SUPPORTED_PROVIDERS,
  buildAuthorizeUrl,
  fetchProviderEnabled,
  generatePkceMaterial,
  isSupportedProvider,
  requestPasswordRecovery,
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
// requestPasswordRecovery
// ---------------------------------------------------------------------------

Deno.test(
  'requestPasswordRecovery — returns status 200 with no error code on success',
  async () => {
    await withRecoveryEnv(async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = () => Promise.resolve(new Response(null, { status: 200 }));
        const result = await requestPasswordRecovery(
          'user@example.com',
          'https://app.example.com/reset-password',
        );
        assertEquals(result.status, 200);
        assertEquals(result.errorCode, undefined);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  },
);

Deno.test('requestPasswordRecovery — surfaces the GoTrue error code on a rate limit', async () => {
  await withRecoveryEnv(async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = () =>
        Promise.resolve(
          new Response(JSON.stringify({ error_code: 'over_email_send_rate_limit' }), {
            status: 429,
          }),
        );
      const result = await requestPasswordRecovery(
        'user@example.com',
        'https://app.example.com/reset-password',
      );
      assertEquals(result.status, 429);
      assertEquals(result.errorCode, 'over_email_send_rate_limit');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

Deno.test('requestPasswordRecovery — surfaces the error code on an SMTP/5xx failure', async () => {
  await withRecoveryEnv(async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = () =>
        Promise.resolve(
          new Response(JSON.stringify({ error_code: 'unexpected_failure' }), { status: 500 }),
        );
      const result = await requestPasswordRecovery(
        'user@example.com',
        'https://app.example.com/reset-password',
      );
      assertEquals(result.status, 500);
      assertEquals(result.errorCode, 'unexpected_failure');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

Deno.test(
  'requestPasswordRecovery — returns status 0 when the request never completes',
  async () => {
    await withRecoveryEnv(async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = () => Promise.reject(new Error('network down'));
        const result = await requestPasswordRecovery(
          'user@example.com',
          'https://app.example.com/reset-password',
        );
        assertEquals(result.status, 0);
        assertEquals(result.errorCode, undefined);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  },
);

// ---------------------------------------------------------------------------
// fetchProviderEnabled (#3188)
// ---------------------------------------------------------------------------

Deno.test('fetchProviderEnabled — "enabled" when the external flag is true', async () => {
  await withRecoveryEnv(async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (input) => {
        assertStringIncludes(String(input), '/auth/v1/settings');
        return Promise.resolve(
          new Response(JSON.stringify({ external: { google: true, github: false } }), {
            status: 200,
          }),
        );
      };
      assertEquals(await fetchProviderEnabled('google'), 'enabled');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

Deno.test(
  'fetchProviderEnabled — "disabled" when the external flag is false or absent',
  async () => {
    await withRecoveryEnv(async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = () =>
          Promise.resolve(
            new Response(JSON.stringify({ external: { google: true, github: false } }), {
              status: 200,
            }),
          );
        assertEquals(await fetchProviderEnabled('github'), 'disabled'); // explicit false
        assertEquals(await fetchProviderEnabled('apple'), 'disabled'); // key absent
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  },
);

Deno.test('fetchProviderEnabled — "unknown" on a non-2xx settings response', async () => {
  await withRecoveryEnv(async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = () => Promise.resolve(new Response('nope', { status: 500 }));
      assertEquals(await fetchProviderEnabled('google'), 'unknown');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

Deno.test('fetchProviderEnabled — "unknown" when the settings fetch rejects', async () => {
  await withRecoveryEnv(async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = () => Promise.reject(new TypeError('network down'));
      assertEquals(await fetchProviderEnabled('google'), 'unknown');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

Deno.test('fetchProviderEnabled — "unknown" when the settings body is not JSON', async () => {
  await withRecoveryEnv(async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = () =>
        Promise.resolve(new Response('<html>not json</html>', { status: 200 }));
      assertEquals(await fetchProviderEnabled('google'), 'unknown');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function withRecoveryEnv(run: () => Promise<void>): Promise<void> {
  Deno.env.set('SUPABASE_URL', 'https://example.supabase.co');
  Deno.env.set('SUPABASE_ANON_KEY', 'anon-test-key-not-real');
  try {
    await run();
  } finally {
    Deno.env.delete('SUPABASE_URL');
    Deno.env.delete('SUPABASE_ANON_KEY');
  }
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
