// SPDX-License-Identifier: BUSL-1.1

/**
 * Gateway integration coverage for `entitlements-v1` (#4403).
 *
 * The unit tests exercise the handler directly, which cannot prove what a
 * *deployed* request receives: with `verify_jwt = true` the Supabase gateway
 * rejects a missing, malformed, or expired JWT before the function runs, and
 * the caller gets the gateway's shape instead of the documented contract.
 * These tests drive the real local gateway to prove the endpoint owns its own
 * authentication envelope.
 *
 * They are skipped unless `ENTITLEMENTS_GATEWAY_URL` is set, so a normal
 * `deno test` run needs no infrastructure:
 *
 * ```bash
 * # from services/api, with the local stack running:
 * npx supabase start
 * ENTITLEMENTS_GATEWAY_URL=http://127.0.0.1:54321/functions/v1/entitlements-v1 \
 *   deno test --allow-env --allow-net supabase/functions/entitlements-v1/gateway.integration.test.ts
 * ```
 *
 * @module
 */

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const gatewayUrl = Deno.env.get('ENTITLEMENTS_GATEWAY_URL');
const skip = gatewayUrl === undefined || gatewayUrl.length === 0;

/**
 * A structurally valid but untrusted JWT. It is signed with a key the project
 * does not hold, so it must be rejected exactly like a malformed one.
 */
const FORGED_JWT = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJzdWIiOiIyMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImV4cCI6MjUzNDAyMzAwNzk5fQ',
  'not-a-valid-signature',
].join('.');

async function assertUnauthenticated(label: string, init: RequestInit) {
  const response = await fetch(gatewayUrl as string, {
    ...init,
    headers: { Origin: 'https://finance.example', ...(init.headers ?? {}) },
  });
  const body = await response.text();
  assertEquals(response.status, 401, `${label}: status`);
  assertEquals(
    JSON.parse(body),
    { error: 'Authentication required', code: 'unauthenticated' },
    `${label}: envelope`,
  );
  assertEquals(response.headers.get('Content-Type'), 'application/json', `${label}: content type`);
  assertEquals(response.headers.get('Cache-Control'), 'no-store', `${label}: cache control`);
  // The gateway may append its own tokens (for example `Accept-Encoding`), so
  // require that `Origin` is varied on rather than that it is the only token.
  assertEquals(
    (response.headers.get('Vary') ?? '')
      .split(',')
      .map((token) => token.trim())
      .includes('Origin'),
    true,
    `${label}: vary on Origin`,
  );
  assertEquals(
    response.headers.has('Access-Control-Allow-Origin'),
    true,
    `${label}: CORS header present`,
  );
}

Deno.test({
  name: 'gateway — a missing credential receives the documented unauthenticated envelope',
  ignore: skip,
  fn: () => assertUnauthenticated('missing', {}),
});

Deno.test({
  name: 'gateway — a malformed credential receives the documented unauthenticated envelope',
  ignore: skip,
  fn: () => assertUnauthenticated('malformed', { headers: { Authorization: 'Bearer not-a-jwt' } }),
});

Deno.test({
  name: 'gateway — an untrusted credential receives the documented unauthenticated envelope',
  ignore: skip,
  fn: () => assertUnauthenticated('forged', { headers: { Authorization: `Bearer ${FORGED_JWT}` } }),
});

Deno.test({
  name: 'gateway — a non-bearer scheme receives the documented unauthenticated envelope',
  ignore: skip,
  fn: () => assertUnauthenticated('basic', { headers: { Authorization: 'Basic dXNlcjpwYXNz' } }),
});

Deno.test({
  name: 'gateway — authorization is not weakened: no anonymous read ever succeeds',
  ignore: skip,
  fn: async () => {
    // The same probes with a household scope must still be refused, so
    // disabling gateway JWT verification cannot expose household state.
    const url = `${gatewayUrl}?household_id=30000000-0000-4000-8000-000000000002`;
    for (const headers of [{}, { Authorization: `Bearer ${FORGED_JWT}` }]) {
      const response = await fetch(url, { headers });
      const body = await response.json();
      assertEquals(response.status, 401);
      assertEquals(body.code, 'unauthenticated');
      // Nothing about the requested household is echoed back.
      assertEquals(JSON.stringify(body).includes('30000000'), false);
    }
  },
});

Deno.test({
  name: 'gateway — a write attempt is refused as read-only, not accepted',
  ignore: skip,
  fn: async () => {
    const response = await fetch(gatewayUrl as string, {
      method: 'POST',
      headers: { Origin: 'https://finance.example' },
      body: JSON.stringify({ tier: 'family' }),
    });
    const body = await response.json();
    assertEquals(response.status, 405);
    assertEquals(body.code, 'method_not_allowed');
    assertEquals(response.headers.get('Cache-Control'), 'no-store');
  },
});
