// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertStringIncludes } from 'std/testing/asserts.ts';
import { createRevenueCatTestSignature } from '../_shared/revenuecat/signature.ts';
import {
  MemoryRevenueCatStore,
  TEST_REVENUECAT_CONFIG,
  testRevenueCatEvent,
} from '../_shared/revenuecat/test-support.ts';
import { createRevenueCatWebhookHandler } from './index.ts';

const nowMs = Date.parse('2026-09-06T12:00:00Z');

async function request(
  event = testRevenueCatEvent(),
  secret = 'synthetic-current',
): Promise<Request> {
  const raw = new TextEncoder().encode(JSON.stringify({ event }));
  const timestamp = Math.floor(nowMs / 1000);
  const signature = await createRevenueCatTestSignature(secret, timestamp, raw);
  return new Request('https://finance.example.test/revenuecat-webhook', {
    method: 'POST',
    headers: {
      Authorization: TEST_REVENUECAT_CONFIG.webhookAuthorization,
      'X-RevenueCat-Webhook-Signature': `t=${timestamp},v1=${signature}`,
    },
    body: raw,
  });
}

Deno.test('RevenueCat webhook verifies and appends known Apple evidence', async () => {
  const store = new MemoryRevenueCatStore();
  const handler = createRevenueCatWebhookHandler({
    config: TEST_REVENUECAT_CONFIG,
    store,
    checkLimit: () => Promise.resolve(null),
    nowMs: () => nowMs,
  });
  const response = await handler(await request());
  assertEquals(response.status, 200);
  assertEquals(store.appended.length, 1);
});

Deno.test('RevenueCat webhook rejects forged signatures without parsing or appending', async () => {
  const store = new MemoryRevenueCatStore();
  const handler = createRevenueCatWebhookHandler({
    config: TEST_REVENUECAT_CONFIG,
    store,
    checkLimit: () => Promise.resolve(null),
    nowMs: () => nowMs,
  });
  const response = await handler(await request(testRevenueCatEvent(), 'forged-secret'));
  assertEquals(response.status, 401);
  assertEquals(store.appended.length, 0);
});

Deno.test('RevenueCat webhook accepts unknown events but grants nothing', async () => {
  const store = new MemoryRevenueCatStore();
  const handler = createRevenueCatWebhookHandler({
    config: TEST_REVENUECAT_CONFIG,
    store,
    checkLimit: () => Promise.resolve(null),
    nowMs: () => nowMs,
  });
  const response = await handler(
    await request(testRevenueCatEvent({ type: 'TEMPORARY_ENTITLEMENT_GRANT' })),
  );
  assertEquals(response.status, 200);
  assertEquals(store.appended.length, 0);
});

Deno.test('RevenueCat webhook responses never expose provider evidence', async () => {
  const handler = createRevenueCatWebhookHandler({
    config: TEST_REVENUECAT_CONFIG,
    store: new MemoryRevenueCatStore(),
    checkLimit: () => Promise.resolve(null),
    nowMs: () => nowMs,
  });
  const response = await handler(await request());
  const body = await response.text();
  assertEquals(body, '{"received":true}');
  for (const forbidden of [
    'evt_synthetic',
    'txn_synthetic',
    'plus_monthly',
    'synthetic-current',
    TEST_REVENUECAT_CONFIG.webhookAuthorization,
  ]) {
    assertEquals(body.includes(forbidden), false);
  }
  assertStringIncludes(response.headers.get('Content-Type') ?? '', 'application/json');
});
