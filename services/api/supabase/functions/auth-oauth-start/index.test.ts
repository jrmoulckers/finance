// SPDX-License-Identifier: BUSL-1.1

/**
 * Handler tests for auth-oauth-start provider-enablement gating (#3188).
 *
 * A statically-supported provider (google/github/apple) that is NOT enabled in
 * GoTrue must fail fast with a 4xx/5xx JSON response instead of 302-ing the
 * browser to `/authorize`, where GoTrue would render a raw
 * "provider is not enabled" page. The SPA's pre-flight probe then keeps the
 * user in-app with a graceful message.
 */

import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import { handler } from './index.ts';

const ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'OAUTH_REDIRECT_BASE',
] as const;

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>;

Deno.test('auth-oauth-start — enabled provider generates a 302 to GoTrue authorize', async () => {
  const calls: string[] = [];
  await withOAuthStartRuntime(
    (input) => {
      calls.push(String(input));
      return settingsResponse({ google: true });
    },
    async () => {
      const res = await handler(startRequest('google'));

      assertEquals(res.status, 302);
      const location = res.headers.get('Location') ?? '';
      assertStringIncludes(location, '/auth/v1/authorize');
      assertStringIncludes(location, 'provider=google');
      assertStringIncludes(res.headers.get('Set-Cookie') ?? '', 'finance_pkce=');
      // The only upstream call is the settings probe (buildAuthorizeUrl is pure).
      assertEquals(calls.length, 1);
      assertStringIncludes(calls[0], '/auth/v1/settings');
    },
  );
});

Deno.test(
  'auth-oauth-start — disabled provider returns 400 and never redirects (#3188)',
  async () => {
    await withOAuthStartRuntime(
      () => settingsResponse({ google: false }),
      async () => {
        const res = await handler(startRequest('google'));

        assertEquals(res.status, 400);
        assertEquals(await res.json(), { error: 'Provider not enabled' });
        assertEquals(res.headers.get('Location'), null);
        assertEquals(res.headers.get('Set-Cookie'), null);
      },
    );
  },
);

Deno.test(
  'auth-oauth-start — a provider absent from the external map is disabled (#3188)',
  async () => {
    await withOAuthStartRuntime(
      () => settingsResponse({ github: true }),
      async () => {
        const res = await handler(startRequest('google'));

        assertEquals(res.status, 400);
        assertEquals(res.headers.get('Location'), null);
      },
    );
  },
);

Deno.test(
  'auth-oauth-start — unreadable settings returns 503, never a raw page (#3188)',
  async () => {
    await withOAuthStartRuntime(
      () => new Response('upstream down', { status: 502 }),
      async () => {
        const res = await handler(startRequest('google'));

        assertEquals(res.status, 503);
        assertEquals(res.headers.get('Retry-After'), '60');
        assertEquals(await res.json(), { error: 'Service temporarily unavailable' });
        assertEquals(res.headers.get('Location'), null);
      },
    );
  },
);

Deno.test('auth-oauth-start — a settings fetch rejection returns 503 (#3188)', async () => {
  await withOAuthStartRuntime(
    () => {
      throw new TypeError('fetch failed');
    },
    async () => {
      const res = await handler(startRequest('google'));

      assertEquals(res.status, 503);
      assertEquals(res.headers.get('Location'), null);
    },
  );
});

Deno.test(
  'auth-oauth-start — unsupported provider returns 400 without probing settings',
  async () => {
    let settingsCalls = 0;
    await withOAuthStartRuntime(
      () => {
        settingsCalls++;
        return settingsResponse({ google: true });
      },
      async () => {
        const res = await handler(startRequest('facebook'));

        assertEquals(res.status, 400);
        assertEquals(await res.json(), { error: 'Unsupported provider' });
        assertEquals(settingsCalls, 0);
      },
    );
  },
);

function startRequest(provider: string): Request {
  return new Request(
    `https://finance.example.test/api/auth/oauth-start?provider=${provider}&redirect_to=/dashboard`,
    { method: 'GET', headers: { 'x-forwarded-proto': 'https' } },
  );
}

function settingsResponse(external: Record<string, boolean>): Response {
  return new Response(JSON.stringify({ external }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function withOAuthStartRuntime(
  fetchImpl: TestFetch,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalEnv = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  for (const key of ENV_KEYS) originalEnv.set(key, Deno.env.get(key));

  Deno.env.set('SUPABASE_URL', 'https://project-ref.supabase.co');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  Deno.env.set('SUPABASE_ANON_KEY', 'anon-key');
  Deno.env.set('OAUTH_REDIRECT_BASE', 'https://finance.example.test');
  globalThis.fetch = fetchImpl as typeof fetch;

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}
