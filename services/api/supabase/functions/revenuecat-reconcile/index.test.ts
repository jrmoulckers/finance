// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'std/testing/asserts.ts';
import { RevenueCatUnavailableError } from '../_shared/revenuecat/client.ts';
import {
  MemoryRevenueCatStore,
  TEST_REVENUECAT_CONFIG,
  testRevenueCatEvent,
} from '../_shared/revenuecat/test-support.ts';
import { createRevenueCatReconciliationHandler } from './index.ts';
import type { RevenueCatIdentity } from '../_shared/revenuecat/store.ts';

function request(
  authorization = TEST_REVENUECAT_CONFIG.reconciliationAuthorization,
  cursor?: string,
): Request {
  const url = new URL('https://finance.example.test/revenuecat-reconcile');
  if (cursor) url.searchParams.set('cursor', cursor);
  return new Request(url, {
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
    assertEquals(await response.json(), {
      status: 'confirmed',
      reconciled: 1,
      next_cursor: null,
    });
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

Deno.test(
  'RevenueCat reconciliation resumes bounded batches beyond 500 identities including terminal state',
  async () => {
    const store = new MemoryRevenueCatStore();
    store.identities.splice(0);
    for (let index = 0; index < 501; index++) {
      const suffix = String(index).padStart(12, '0');
      store.identities.push({
        id: `44010000-0000-4000-8000-${suffix}`,
        billingAccountId: `44010000-0000-4001-8000-${suffix}`,
        customerId: `44010000-0000-4002-8000-${suffix}`,
        environment: 'sandbox',
      } satisfies RevenueCatIdentity);
    }

    const requestedCustomers: string[] = [];
    const terminalCustomer = store.identities.at(-1)!.customerId;
    const handler = createRevenueCatReconciliationHandler({
      config: TEST_REVENUECAT_CONFIG,
      client: {
        getCustomerEvents: (customerId) => {
          requestedCustomers.push(customerId);
          const terminal = customerId === terminalCustomer;
          return Promise.resolve([
            testRevenueCatEvent({
              id: `evt_${customerId}`,
              type: terminal ? 'EXPIRATION' : 'RENEWAL',
              app_user_id: customerId,
              original_app_user_id: customerId,
              original_transaction_id: `sub_${customerId}`,
            }),
          ]);
        },
      },
      store,
      checkLimit: () => Promise.resolve(null),
    });

    let cursor: string | undefined;
    let totalReconciled = 0;
    const statuses: string[] = [];
    do {
      const response = await handler(
        request(TEST_REVENUECAT_CONFIG.reconciliationAuthorization, cursor),
      );
      assertEquals(response.status, 200);
      const body = await response.json();
      statuses.push(body.status);
      totalReconciled += body.reconciled;
      cursor = body.next_cursor ?? undefined;
    } while (cursor);

    assertEquals(statuses, ['partial', 'partial', 'partial', 'partial', 'partial', 'confirmed']);
    assertEquals(totalReconciled, 501);
    assertEquals(store.identityPageRequests, 6);
    assertEquals(requestedCustomers.length, 501);
    assertEquals(requestedCustomers[100], store.identities[100].customerId);
    assertEquals(requestedCustomers.at(-1), terminalCustomer);
    assertEquals(
      store.appended.some((event) => event.lifecycle === 'expired'),
      true,
    );
  },
);

Deno.test('RevenueCat reconciliation rejects malformed continuation cursors', async () => {
  const handler = createRevenueCatReconciliationHandler({
    config: TEST_REVENUECAT_CONFIG,
    client: { getCustomerEvents: () => Promise.resolve([]) },
    store: new MemoryRevenueCatStore(),
    checkLimit: () => Promise.resolve(null),
  });
  const response = await handler(
    request(TEST_REVENUECAT_CONFIG.reconciliationAuthorization, 'not-a-cursor'),
  );
  assertEquals(response.status, 400);
  assertEquals(await response.json(), {
    status: 'error',
    error: 'invalid_request',
  });
});
