// SPDX-License-Identifier: BUSL-1.1

/**
 * Regression tests for auth-refresh cookie clearing (#1966, #1971).
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';

import { handler } from '../index.ts';

const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'] as const;

type TestFetch = (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>;

Deno.test('auth-refresh — valid refresh returns 200 and rotates the cookie', async () => {
  const calls: Array<{ url: string; body: string }> = [];

  await withAuthRefreshRuntime(
    (input, init) => {
      calls.push({ url: String(input), body: String(init?.body ?? '') });
      return jsonResponse(200, {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
      });
    },
    async () => {
      const res = await handler(refreshRequest('old-refresh-token'));

      assertEquals(res.status, 200);
      assertEquals(await res.json(), {
        access_token: 'new-access-token',
        expires_in: 3600,
      });
      const setCookie = res.headers.get('Set-Cookie') ?? '';
      assertStringIncludes(setCookie, 'finance_refresh=new-refresh-token');
      assertStringIncludes(setCookie, 'Max-Age=5184000');
      assert(!setCookie.includes('Max-Age=0'), 'successful refresh must not clear the cookie');
      assertEquals(calls.length, 1);
      assertStringIncludes(calls[0].url, '/auth/v1/token?grant_type=refresh_token');
      assertEquals(JSON.parse(calls[0].body).refresh_token, 'old-refresh-token');
    },
  );
});

Deno.test('auth-refresh — invalid refresh token returns 401 and clears the cookie', async () => {
  await withAuthRefreshRuntime(
    () =>
      jsonResponse(
        401,
        {
          code: 'refresh_token_not_found',
          error: 'invalid_grant',
          msg: 'Invalid Refresh Token: Refresh Token Not Found',
        },
        'Unauthorized',
      ),
    async () => {
      const res = await handler(refreshRequest('revoked-refresh-token'));

      assertEquals(res.status, 401);
      assertEquals(await res.json(), { error: 'Session expired' });
      const setCookie = res.headers.get('Set-Cookie') ?? '';
      assertStringIncludes(setCookie, 'finance_refresh=');
      assertStringIncludes(setCookie, 'Max-Age=0');
    },
  );
});

Deno.test('auth-refresh — Supabase 5xx returns transient error and preserves cookie', async () => {
  await withAuthRefreshRuntime(
    () => jsonResponse(503, { code: 'unexpected_failure', msg: 'Auth service unavailable' }),
    async () => {
      const res = await handler(refreshRequest('still-valid-refresh-token'));

      assert([502, 503].includes(res.status), `expected transient status, got ${res.status}`);
      assertEquals(res.headers.get('Set-Cookie'), null);
      assertEquals(await res.json(), { error: 'Authentication service temporarily unavailable' });
    },
  );
});

Deno.test('auth-refresh — ambiguous Supabase 401 preserves cookie', async () => {
  await withAuthRefreshRuntime(
    () => jsonResponse(401, { error: 'invalid_grant', message: 'Unauthorized' }, 'Unauthorized'),
    async () => {
      const res = await handler(refreshRequest('maybe-valid-refresh-token'));

      assertEquals(res.status, 502);
      assertEquals(res.headers.get('Set-Cookie'), null);
      assertEquals(await res.json(), { error: 'Authentication service temporarily unavailable' });
    },
  );
});

Deno.test('auth-refresh — network fetch error preserves cookie', async () => {
  await withAuthRefreshRuntime(
    () => {
      throw new TypeError('fetch failed');
    },
    async () => {
      const res = await handler(refreshRequest('still-valid-refresh-token'));

      assertEquals(res.status, 503);
      assertEquals(res.headers.get('Set-Cookie'), null);
      assertEquals(res.headers.get('Retry-After'), '30');
      assertEquals(await res.json(), { error: 'Authentication service temporarily unavailable' });
    },
  );
});

function refreshRequest(refreshToken: string): Request {
  return new Request('https://finance.example.test/api/auth/refresh', {
    method: 'POST',
    headers: {
      Cookie: `finance_refresh=${refreshToken}`,
      'x-forwarded-proto': 'https',
    },
  });
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  statusText?: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function withAuthRefreshRuntime(
  fetchImpl: TestFetch,
  run: () => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalEnv = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  for (const key of ENV_KEYS) originalEnv.set(key, Deno.env.get(key));

  Deno.env.set('SUPABASE_URL', 'https://project-ref.supabase.co');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  Deno.env.set('SUPABASE_ANON_KEY', 'anon-key');
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
