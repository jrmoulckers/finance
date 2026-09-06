// SPDX-License-Identifier: BUSL-1.1

import {
  assertEquals,
  assertRejects,
  assertThrows,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { createStripeWebhookHandler, verifyEventMode, verifyStripeAccount } from './index.ts';

Deno.test('Stripe webhook passes the exact raw body to signature processing', async () => {
  const rawBody = '{\n  "id": "evt_placeholder", "note": "café"\n}';
  let received = '';
  const handler = createStripeWebhookHandler({
    process: (input) => {
      received = input.rawBody;
      return Promise.resolve('ignored');
    },
  });
  const response = await handler(
    new Request('http://localhost/functions/v1/stripe-webhook', {
      method: 'POST',
      headers: { 'Stripe-Signature': 't=1,v1=placeholder' },
      body: rawBody,
    }),
  );
  assertEquals(received, rawBody);
  assertEquals(response.status, 200);
});

Deno.test('Stripe webhook responses exclude provider identifiers and payloads', async () => {
  const handler = createStripeWebhookHandler({
    process: () => Promise.resolve('applied'),
  });
  const response = await handler(
    new Request('http://localhost/functions/v1/stripe-webhook', {
      method: 'POST',
      body: '{"id":"evt_private_placeholder","customer":"cus_private_placeholder"}',
    }),
  );
  const body = await response.text();
  assertEquals(body, '{"received":true,"applied":true}');
  assertEquals(body.includes('evt_private'), false);
  assertEquals(body.includes('cus_private'), false);
});

Deno.test('Stripe webhook rejects wrong account and wrong environment', async () => {
  await assertRejects(
    () =>
      verifyStripeAccount(
        {
          retrieveAccount: () => Promise.resolve({ id: 'acct_wrong_placeholder' }),
        },
        'acct_expected_placeholder',
      ),
    Error,
  );
  assertThrows(
    () =>
      verifyEventMode(
        {
          id: 'evt_placeholder',
          type: 'customer.subscription.updated',
          created: 2_000_000_000,
          livemode: true,
          data: { object: { id: 'sub_placeholder' } },
        },
        'sandbox',
      ),
    Error,
  );
});

Deno.test('Stripe webhook returns retryable failure without leaking errors', async () => {
  const original = new Error('provider response contained cus_private_placeholder');
  const handler = createStripeWebhookHandler({
    process: () => Promise.reject(original),
  });
  const response = await handler(
    new Request('http://localhost/functions/v1/stripe-webhook', {
      method: 'POST',
      body: '{}',
    }),
  );
  const body = await response.text();
  assertEquals(response.status, 400);
  assertEquals(body.includes('cus_private'), false);
});
