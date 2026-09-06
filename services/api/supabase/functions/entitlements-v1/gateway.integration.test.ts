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
 * Local-only signing key for minting an expired token, supplied by the
 * harness from `supabase status`. It is never read from a committed file and
 * only ever addresses a disposable local stack.
 */
const localJwtSecret = Deno.env.get('ENTITLEMENTS_TEST_JWT_SECRET');
const skipMinted = skip || localJwtSecret === undefined || localJwtSecret.length === 0;

/**
 * Local-only service credential, supplied by the harness from the running
 * auth container. It is used solely to create and delete a disposable local
 * principal so an expired token can be minted for a *real* subject.
 */
const localServiceKey = Deno.env.get('ENTITLEMENTS_TEST_SERVICE_ROLE_KEY');
const skipProvisioned = skipMinted || localServiceKey === undefined || localServiceKey.length === 0;

/** The stack's API root, derived from the gateway URL the harness supplied. */
const apiRoot = skip ? '' : (gatewayUrl as string).split('/functions/v1/')[0];

/**
 * A structurally valid but untrusted JWT. It is signed with a key the project
 * does not hold, so it must be rejected exactly like a malformed one.
 */
const FORGED_JWT = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJzdWIiOiIyMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImV4cCI6MjUzNDAyMzAwNzk5fQ',
  'not-a-valid-signature',
].join('.');

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function encodeSegment(value: Record<string, unknown>): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

/**
 * Mint an HS256 token against the local stack's own signing key.
 *
 * A forged signature proves only that an unverifiable token is refused. An
 * *expired but correctly signed* token exercises the other branch: the
 * signature verifies and the claim is rejected on its own merits.
 */
async function mintLocalToken(
  expiresAtSeconds: number,
  subject = '20000000-0000-4000-8000-000000000001',
): Promise<string> {
  const issuedAt = expiresAtSeconds - 3600;
  const header = encodeSegment({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeSegment({
    sub: subject,
    role: 'authenticated',
    aud: 'authenticated',
    iss: 'supabase',
    iat: issuedAt,
    exp: expiresAtSeconds,
  });
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(localJwtSecret as string),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

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
  name: 'gateway — a correctly signed but expired credential is refused the same way',
  ignore: skipMinted,
  fn: async () => {
    const expired = await mintLocalToken(Math.floor(Date.now() / 1000) - 3600);
    await assertUnauthenticated('expired', { headers: { Authorization: `Bearer ${expired}` } });
  },
});

Deno.test({
  name: 'gateway — an expired credential cannot read a household scope either',
  ignore: skipMinted,
  fn: async () => {
    const expired = await mintLocalToken(Math.floor(Date.now() / 1000) - 60);
    const response = await fetch(
      `${gatewayUrl}?household_id=30000000-0000-4000-8000-000000000002`,
      { headers: { Authorization: `Bearer ${expired}` } },
    );
    const body = await response.json();
    assertEquals(response.status, 401);
    assertEquals(body.code, 'unauthenticated');
    assertEquals(JSON.stringify(body).includes('30000000'), false);
  },
});

Deno.test({
  name: 'gateway — expiry alone is what refuses a correctly signed credential',
  ignore: skipProvisioned,
  fn: async () => {
    // The other cases prove an unverifiable credential is refused. This one
    // isolates *expiry*: the same real subject, the same signing key, and the
    // same claims — only `exp` differs. Without the contrast an expired token
    // could be refused for an unrelated reason and the test would still pass.
    const adminHeaders = {
      apikey: localServiceKey as string,
      Authorization: `Bearer ${localServiceKey}`,
      'Content-Type': 'application/json',
    };
    const created = await fetch(`${apiRoot}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        email: `entitlements-gateway-${crypto.randomUUID()}@example.invalid`,
        email_confirm: true,
      }),
    });
    assertEquals(created.status, 200, 'could not provision a disposable local principal');
    const subject = (await created.json()).id as string;

    try {
      const now = Math.floor(Date.now() / 1000);

      // A live credential for that subject is *not* refused as unauthenticated.
      const live = await fetch(gatewayUrl as string, {
        headers: { Authorization: `Bearer ${await mintLocalToken(now + 3600, subject)}` },
      });
      const liveBody = await live.json();
      assertEquals(live.status === 401, false, 'a live credential must pass authentication');
      assertEquals(liveBody.code === 'unauthenticated', false);

      // The same credential, expired, is refused with the documented envelope.
      await assertUnauthenticated('expired-real-subject', {
        headers: { Authorization: `Bearer ${await mintLocalToken(now - 3600, subject)}` },
      });
    } finally {
      await fetch(`${apiRoot}/auth/v1/admin/users/${subject}`, {
        method: 'DELETE',
        headers: adminHeaders,
      });
    }
  },
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
