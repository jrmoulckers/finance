// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'std/testing/asserts.ts';
import { RevenueCatClient, RevenueCatUnavailableError } from '../_shared/revenuecat/client.ts';
import {
  MemoryRevenueCatStore,
  TEST_HOUSEHOLD_ID,
  TEST_REVENUECAT_CONFIG,
  TEST_USER_ID,
  testRevenueCatEvent,
} from '../_shared/revenuecat/test-support.ts';
import { createRevenueCatConfirmationHandler } from './index.ts';

function request(body: Record<string, unknown>, authenticated = true): Request {
  return new Request('https://finance.example.test/revenuecat-confirm', {
    method: 'POST',
    headers: authenticated ? { Authorization: 'Bearer synthetic-jwt' } : {},
    body: JSON.stringify(body),
  });
}

function handler(
  store: MemoryRevenueCatStore,
  getCustomerEvents = () => Promise.resolve([testRevenueCatEvent()]),
) {
  return createRevenueCatConfirmationHandler({
    authenticate: (req) => {
      if (!req.headers.has('Authorization')) {
        throw new Response('unauthorized', { status: 401 });
      }
      return Promise.resolve({
        id: TEST_USER_ID,
        email: 'test@example.invalid',
      });
    },
    config: TEST_REVENUECAT_CONFIG,
    client: { getCustomerEvents },
    store,
    checkLimit: () => Promise.resolve(null),
  });
}

Deno.test('native confirmation binds provider lookup to authenticated auth.uid()', async () => {
  const store = new MemoryRevenueCatStore();
  let customer = '';
  const response = await handler(store, (customerId) => {
    customer = customerId;
    return Promise.resolve([testRevenueCatEvent()]);
  })(
    request({
      operation: 'confirm',
      app_id: 'app_apple',
      environment: 'sandbox',
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(customer, TEST_USER_ID);
  const body = await response.json();
  assertEquals(body.status, 'confirmed');
  assertEquals(Object.keys(body.entitlement).sort(), [
    'bankConnectionAllowance',
    'effectiveAt',
    'expiresAt',
    'householdTier',
    'isFamilyBound',
    'isPremiumSponsor',
    'projectionVersion',
    'serverTime',
    'userTier',
  ]);
});

Deno.test('confirmation remains pending when RevenueCat has no reviewed evidence', async () => {
  const response = await handler(new MemoryRevenueCatStore(), () => Promise.resolve([]))(
    request({
      operation: 'confirm',
      app_id: 'app_apple',
      environment: 'sandbox',
    }),
  );
  assertEquals((await response.json()).status, 'pending');
});

Deno.test(
  'native restore requires authentication and rejects client authority fields',
  async () => {
    const store = new MemoryRevenueCatStore();
    const restore = {
      operation: 'restore',
      app_id: 'app_apple',
      environment: 'sandbox',
    };
    assertEquals((await handler(store)(request(restore, false))).status, 401);
    assertEquals((await handler(store)(request({ ...restore, tier: 'premium' }))).status, 400);
    assertEquals((await handler(store)(request({ ...restore, quantity: 999 }))).status, 400);
    assertEquals((await handler(store)(request({ ...restore, receipt: 'synthetic' }))).status, 400);
    assertEquals((await handler(store)(request({ ...restore, unknown: true }))).status, 400);
  },
);

Deno.test('authenticated status reads only the minimized Finance projection', async () => {
  const store = new MemoryRevenueCatStore();
  await store.appendAndApply(store.identities[0], {
    provider: 'revenuecat',
    environment: 'sandbox',
    providerEventId: 'evt_status',
    providerSubscriptionId: 'txn_status',
    revenueCatSubscriptionId: null,
    storeTransactionIds: ['txn_status'],
    providerSubscriptionItemId: null,
    effectiveAt: '2026-09-06T12:00:00.000Z',
    providerOrder: Date.parse('2026-09-06T12:00:00.000Z'),
    eventType: 'activated',
    lifecycle: 'active',
    logicalProduct: 'base_plan',
    tier: 'plus',
    quantity: 1,
    currentPeriodEnd: '2026-10-06T12:00:00.000Z',
    graceEnd: null,
    terminalAt: null,
    boundHouseholdId: null,
    trustedReactivation: false,
  });
  const response = await handler(store)(
    new Request(
      `https://finance.example.test/revenuecat-confirm?household_id=${TEST_HOUSEHOLD_ID}`,
      { headers: { Authorization: 'Bearer synthetic-jwt' } },
    ),
  );
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(response.headers.get('Cache-Control'), 'no-store');
  assertEquals(body.status, 'confirmed');
  assertEquals('provider' in body.entitlement, false);
  assertEquals('subscriptionId' in body.entitlement, false);
});

Deno.test('denial-only confirmation applies revocation but remains pending', async () => {
  const store = new MemoryRevenueCatStore();
  await handler(store)(
    request({
      operation: 'confirm',
      app_id: 'app_apple',
      environment: 'sandbox',
    }),
  );

  const providerClient = new RevenueCatClient(TEST_REVENUECAT_CONFIG, (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/transactions')) {
      return Promise.resolve(
        Response.json({
          object: 'list',
          items: [
            {
              object: 'subscription_transaction',
              id: 'txn_synthetic',
              purchased_at: Date.parse('2026-09-06T12:00:00Z'),
              product_store_identifier: 'com.example.synthetic',
              expiration_date: Date.parse('2026-10-06T12:00:00Z'),
              effective_expiration_date: Date.parse('2026-10-06T12:00:00Z'),
            },
          ],
          next_page: null,
          url: url.pathname,
        }),
      );
    }
    return Promise.resolve(
      Response.json({
        object: 'list',
        items: [
          {
            id: 'sub_denial',
            customer_id: TEST_USER_ID,
            current_period_starts_at: Date.parse('2026-10-06T12:00:00Z'),
            current_period_ends_at: Date.parse('2026-11-06T12:00:00Z'),
            environment: 'sandbox',
            gives_access: false,
            product_id: 'plus_monthly',
            status: 'incomplete',
            store: 'app_store',
            store_subscription_identifier: 'txn_synthetic',
          },
        ],
        next_page: null,
        url: url.pathname,
      }),
    );
  });
  const response = await handler(store, (customerId) =>
    providerClient.getCustomerEvents(customerId),
  )(
    request({
      operation: 'confirm',
      app_id: 'app_apple',
      environment: 'sandbox',
    }),
  );

  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.status, 'pending');
  assertEquals(body.entitlement.userTier, 'free');
  assertEquals(store.currentEvidence()?.lifecycle, 'expired');
});

Deno.test('authenticated free status is pending', async () => {
  const response = await handler(new MemoryRevenueCatStore())(
    new Request('https://finance.example.test/revenuecat-confirm', {
      headers: { Authorization: '******' },
    }),
  );
  assertEquals(response.status, 200);
  assertEquals((await response.json()).status, 'pending');
});

Deno.test('Family confirmation requires eligible household intent', async () => {
  const store = new MemoryRevenueCatStore();
  store.householdMember = false;
  const response = await handler(store, () =>
    Promise.resolve([testRevenueCatEvent({ product_id: 'family_monthly' })]),
  )(
    request({
      operation: 'confirm',
      app_id: 'app_apple',
      environment: 'sandbox',
      household_id: TEST_HOUSEHOLD_ID,
    }),
  );
  assertEquals(response.status, 403);
  assertEquals(store.appended.length, 0);
});

Deno.test('confirmation reports provider outage with a bounded retryable error', async () => {
  const response = await handler(new MemoryRevenueCatStore(), () => {
    throw new RevenueCatUnavailableError();
  })(
    request({
      operation: 'confirm',
      app_id: 'app_apple',
      environment: 'sandbox',
    }),
  );
  assertEquals(response.status, 503);
  assertEquals(response.headers.get('Retry-After'), '60');
  assertEquals(await response.json(), {
    status: 'error',
    error: 'temporarily_unavailable',
  });
});

Deno.test('confirmation rejects provider subject mismatch', async () => {
  const response = await handler(new MemoryRevenueCatStore(), () =>
    Promise.resolve([
      testRevenueCatEvent({
        app_user_id: '44010000-0000-4000-8000-000000000099',
        original_app_user_id: '44010000-0000-4000-8000-000000000099',
      }),
    ]),
  )(
    request({
      operation: 'confirm',
      app_id: 'app_apple',
      environment: 'sandbox',
    }),
  );
  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    status: 'error',
    error: 'invalid_evidence',
  });
});
