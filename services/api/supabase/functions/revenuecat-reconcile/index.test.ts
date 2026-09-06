// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'std/testing/asserts.ts';
import { RevenueCatUnavailableError } from '../_shared/revenuecat/client.ts';
import {
  MemoryRevenueCatStore,
  TEST_REVENUECAT_CONFIG,
  testRevenueCatEvent,
} from '../_shared/revenuecat/test-support.ts';
import { createRevenueCatReconciliationHandler } from './index.ts';

function request(authorization = TEST_REVENUECAT_CONFIG.reconciliationAuthorization): Request {
  return new Request('https://finance.example.test/revenuecat-reconcile', {
    method: 'POST',
    headers: { Authorization: authorization },
  });
}

Deno.test('RevenueCat reconciliation requires its dedicated credential', async () => {
  const store = new MemoryRevenueCatStore();
  const handler = createRevenueCatReconciliationHandler({
    config: TEST_REVENUECAT_CONFIG,
    client: { getCustomerEvents: () => Promise.resolve([]) },
    store,
    checkLimit: () => Promise.resolve(null),
  });
  assertEquals((await handler(request('Bearer wrong'))).status, 401);
  assertEquals(store.appended.length, 0);
});

Deno.test(
  'RevenueCat reconciliation feeds provider state through shared append/apply',
  async () => {
    const store = new MemoryRevenueCatStore();
    const handler = createRevenueCatReconciliationHandler({
      config: TEST_REVENUECAT_CONFIG,
      client: {
        getCustomerEvents: () => Promise.resolve([testRevenueCatEvent()]),
      },
      store,
      checkLimit: () => Promise.resolve(null),
    });
    const response = await handler(request());
    assertEquals(response.status, 200);
    assertEquals(await response.json(), { status: 'confirmed', reconciled: 1 });
    assertEquals(store.appended.length, 1);
  },
);

Deno.test('RevenueCat reconciliation surfaces provider outage without identifiers', async () => {
  const handler = createRevenueCatReconciliationHandler({
    config: TEST_REVENUECAT_CONFIG,
    client: {
      getCustomerEvents: () => {
        throw new RevenueCatUnavailableError();
      },
    },
    store: new MemoryRevenueCatStore(),
    checkLimit: () => Promise.resolve(null),
  });
  const response = await handler(request());
  const body = await response.text();
  assertEquals(response.status, 503);
  assertEquals(response.headers.get('Retry-After'), '60');
  assertEquals(body, '{"status":"error","error":"temporarily_unavailable"}');
  assertEquals(body.includes('synthetic'), false);
});
