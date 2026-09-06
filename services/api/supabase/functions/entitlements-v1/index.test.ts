// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  createEntitlementsHandler,
  EntitlementRequestError,
  EntitlementUnavailableError,
} from './index.ts';

const USER_ID = '20000000-0000-4000-8000-000000000001';
const HOUSEHOLD_ID = '30000000-0000-4000-8000-000000000002';
const BASE_URL = 'http://localhost/functions/v1/entitlements-v1';

const authenticate = () => Promise.resolve({ id: USER_ID, email: '' });
const allow = () => Promise.resolve();

interface Recorded {
  householdIds: Array<string | null>;
}

function handlerFor(
  projection: unknown | (() => never),
  recorded: Recorded = { householdIds: [] },
) {
  return createEntitlementsHandler({
    authenticate,
    enforceRateLimit: allow,
    source: {
      load: (_request, householdId) => {
        recorded.householdIds.push(householdId);
        return typeof projection === 'function'
          ? Promise.reject((projection as () => never)())
          : Promise.resolve(projection);
      },
    },
  });
}

function get(url = BASE_URL): Request {
  return new Request(url, { headers: { Authorization: 'Bearer test-credential' } });
}

function freeProjection(overrides: Record<string, unknown> = {}) {
  return {
    user_display_tier: 'free',
    household_display_tier: null,
    bank_connection_allowance: 0,
    is_premium_sponsor: false,
    is_family_bound: false,
    effective_at: '2033-05-18T03:33:20+00:00',
    expires_at: null,
    projection_version: 3,
    server_time: '2033-05-18T03:33:21+00:00',
    ...overrides,
  };
}

function collectKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    `${prefix}${key}`,
    ...collectKeys(child, `${prefix}${key}.`),
  ]);
}

Deno.test('entitlements-v1 — preflight is answered without a projection read', async () => {
  const recorded: Recorded = { householdIds: [] };
  const response = await handlerFor(
    freeProjection(),
    recorded,
  )(new Request(BASE_URL, { method: 'OPTIONS' }));
  assertEquals(response.status, 204);
  assertEquals(recorded.householdIds.length, 0);
});

Deno.test('entitlements-v1 — the endpoint is read-only', async () => {
  const recorded: Recorded = { householdIds: [] };
  const response = await handlerFor(
    freeProjection(),
    recorded,
  )(new Request(BASE_URL, { method: 'POST', body: '{"tier":"family"}' }));
  assertEquals(response.status, 405);
  assertEquals((await response.json()).code, 'method_not_allowed');
  assertEquals(recorded.householdIds.length, 0);
});

Deno.test('entitlements-v1 — an unauthenticated read is refused before any lookup', async () => {
  const recorded: Recorded = { householdIds: [] };
  const handler = createEntitlementsHandler({
    authenticate: () =>
      Promise.reject(
        new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
        }),
      ),
    enforceRateLimit: allow,
    source: {
      load: (_request, householdId) => {
        recorded.householdIds.push(householdId);
        return Promise.resolve(freeProjection());
      },
    },
  });
  const response = await handler(new Request(BASE_URL));
  assertEquals(response.status, 401);
  assertEquals(recorded.householdIds.length, 0);
});

Deno.test('entitlements-v1 — a modified client cannot select another subject', async () => {
  const recorded: Recorded = { householdIds: [] };
  const handler = handlerFor(freeProjection(), recorded);
  const rejected = [
    `${BASE_URL}?user_id=${USER_ID}`,
    `${BASE_URL}?owner_id=${USER_ID}`,
    `${BASE_URL}?household_id=${HOUSEHOLD_ID}&user_id=${USER_ID}`,
    `${BASE_URL}?household_id=${HOUSEHOLD_ID}&household_id=${USER_ID}`,
    `${BASE_URL}?tier=family`,
    `${BASE_URL}?household_id=not-a-uuid`,
    `${BASE_URL}?household_id=`,
  ];
  for (const url of rejected) {
    const response = await handler(get(url));
    assertEquals(response.status, 400, url);
    assertEquals((await response.json()).code, 'invalid_request', url);
  }
  // No rejected request ever reached the projection.
  assertEquals(recorded.householdIds.length, 0);
});

Deno.test('entitlements-v1 — only the validated household reaches the projection', async () => {
  const recorded: Recorded = { householdIds: [] };
  const handler = handlerFor(
    freeProjection({
      household_display_tier: 'free',
      expires_at: null,
    }),
    recorded,
  );
  assertEquals((await handler(get(`${BASE_URL}?household_id=${HOUSEHOLD_ID}`))).status, 200);
  assertEquals(recorded.householdIds, [HOUSEHOLD_ID]);
});

Deno.test('entitlements-v1 — an over-budget caller is throttled, not served', async () => {
  const recorded: Recorded = { householdIds: [] };
  const handler = createEntitlementsHandler({
    authenticate,
    enforceRateLimit: () =>
      Promise.reject(
        new EntitlementRequestError(429, 'rate_limited', 'Too many entitlement requests', 30),
      ),
    source: {
      load: (_request, householdId) => {
        recorded.householdIds.push(householdId);
        return Promise.resolve(freeProjection());
      },
    },
  });
  const response = await handler(get());
  assertEquals(response.status, 429);
  assertEquals(response.headers.get('Retry-After'), '30');
  assertEquals((await response.json()).code, 'rate_limited');
  assertEquals(recorded.householdIds.length, 0);
});

Deno.test('entitlements-v1 — a cross-household read fails closed without echoing it', async () => {
  const handler = handlerFor(() => {
    throw new EntitlementRequestError(403, 'forbidden', 'Household is not available');
  });
  const response = await handler(get(`${BASE_URL}?household_id=${HOUSEHOLD_ID}`));
  const body = await response.text();
  assertEquals(response.status, 403);
  assertEquals(JSON.parse(body).code, 'forbidden');
  assertEquals(body.includes(HOUSEHOLD_ID), false);
  assertEquals(body.includes(USER_ID), false);
});

Deno.test('entitlements-v1 — an unavailable projection fails closed and is retryable', async () => {
  const handler = handlerFor(() => {
    throw new EntitlementUnavailableError('Entitlement projection lookup failed');
  });
  const response = await handler(get());
  assertEquals(response.status, 503);
  assertEquals(response.headers.get('Retry-After'), '30');
  assertEquals((await response.json()).code, 'projection_unavailable');
});

Deno.test('entitlements-v1 — an unexpected lookup failure still fails closed', async () => {
  const handler = handlerFor(() => {
    throw new TypeError('network reset');
  });
  const response = await handler(get());
  assertEquals(response.status, 503);
  const body = await response.text();
  assertEquals(JSON.parse(body).code, 'projection_unavailable');
  // Internal failure detail never reaches the client.
  assertEquals(body.includes('network reset'), false);
});

Deno.test('entitlements-v1 — malformed and missing projections never authorize', async () => {
  const malformed: unknown[] = [
    undefined,
    null,
    [],
    'free',
    freeProjection({ user_display_tier: 'enterprise' }),
    freeProjection({ bank_connection_allowance: -2 }),
    freeProjection({ projection_version: 0 }),
    freeProjection({ effective_at: '2033-05-18' }),
    // A household projection returned for an unscoped read.
    freeProjection({ household_display_tier: 'family', bank_connection_allowance: 4 }),
  ];
  for (const projection of malformed) {
    const response = await handlerFor(projection)(get());
    assertEquals(response.status, 503, JSON.stringify(projection));
    assertEquals((await response.json()).code, 'projection_unavailable');
  }
});

Deno.test(
  'entitlements-v1 — a household read that returns no household state fails closed',
  async () => {
    const response = await handlerFor(freeProjection())(
      get(`${BASE_URL}?household_id=${HOUSEHOLD_ID}`),
    );
    assertEquals(response.status, 503);
    assertEquals((await response.json()).code, 'projection_unavailable');
  },
);

Deno.test('entitlements-v1 — the served envelope is exactly the minimized contract', async () => {
  const response = await handlerFor(
    freeProjection({
      user_display_tier: 'premium',
      household_display_tier: 'premium',
      bank_connection_allowance: 4,
      is_premium_sponsor: true,
      expires_at: '2033-06-18T03:33:20+00:00',
    }),
  )(get(`${BASE_URL}?household_id=${HOUSEHOLD_ID}`));

  assertEquals(response.status, 200);
  assertEquals(response.headers.get('Cache-Control'), 'no-store');

  const body = await response.text();
  const envelope = JSON.parse(body);
  assertEquals(envelope.contract_version, 1);
  assertEquals(envelope.catalog_version, 1);
  assertEquals(envelope.entitlement.tier, 'premium');
  assertEquals(envelope.entitlement.access_state, 'granted');
  assertEquals(envelope.entitlement.bank_connections.addon_allowance, 2);
  assertEquals(envelope.entitlement.downgrade.pending, true);

  assertEquals(collectKeys(envelope).sort(), [
    'catalog_version',
    'contract_version',
    'entitlement',
    'entitlement.access_state',
    'entitlement.bank_connections',
    'entitlement.bank_connections.addon_allowance',
    'entitlement.bank_connections.allowance',
    'entitlement.bank_connections.base_allowance',
    'entitlement.downgrade',
    'entitlement.downgrade.bank_connection_allowance',
    'entitlement.downgrade.effective_at',
    'entitlement.downgrade.pending',
    'entitlement.household_tier',
    'entitlement.is_family_bound',
    'entitlement.is_premium_sponsor',
    'entitlement.lifecycle',
    'entitlement.scope',
    'entitlement.tier',
    'entitlement.user_tier',
    'entitlement.validity',
    'entitlement.validity.effective_at',
    'entitlement.validity.expires_at',
    'entitlement.validity.projection_version',
    'entitlement.validity.server_time',
  ]);

  for (const forbidden of [
    'customer',
    'subscription',
    'transaction',
    'receipt',
    'payment',
    'price',
    'product',
    'invoice',
    'stripe',
    'revenuecat',
    'apple',
    'google',
    'provider',
    'grant_id',
    'source_base_grant',
    'ledger',
    'secret',
    'token',
    'email',
    'household_id',
    'owner_id',
    'user_id',
  ]) {
    assertEquals(body.toLowerCase().includes(forbidden), false, forbidden);
  }
  // The caller's own identifiers are absent from the served body.
  assertEquals(body.includes(USER_ID), false);
  assertEquals(body.includes(HOUSEHOLD_ID), false);
  assertStringIncludes(body, '"projection_version":3');
});
