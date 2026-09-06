// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { createStripeCheckoutHandler } from './index.ts';

const authenticate = () =>
  Promise.resolve({ id: '20000000-0000-4000-8000-000000000001', email: '' });

Deno.test('Stripe checkout accepts only a reviewed logical catalog choice', async () => {
  let calls = 0;
  const handler = createStripeCheckoutHandler({
    authenticate,
    service: {
      create: () => {
        calls++;
        return Promise.resolve({
          checkoutUrl: 'https://checkout.example.test/placeholder',
        });
      },
    },
  });

  for (const body of [
    { catalog_choice: 'premium_monthly', price_id: 'price_attacker' },
    { catalog_choice: 'premium_monthly', tier: 'family' },
    { catalog_choice: 'price_attacker' },
  ]) {
    const response = await handler(request(body));
    assertEquals(response.status, 400);
  }
  assertEquals(calls, 0);
});

Deno.test(
  'Stripe checkout binds the authenticated owner and returns pending without identifiers',
  async () => {
    let receivedOwner = '';
    const handler = createStripeCheckoutHandler({
      authenticate,
      service: {
        create: (input) => {
          receivedOwner = input.ownerId;
          return Promise.resolve({
            checkoutUrl: 'https://checkout.example.test/placeholder',
          });
        },
      },
    });
    const response = await handler(request({ catalog_choice: 'plus_monthly' }));
    const body = await response.json();

    assertEquals(response.status, 201);
    assertEquals(receivedOwner, '20000000-0000-4000-8000-000000000001');
    assertEquals(body, {
      state: 'pending',
      checkout_url: 'https://checkout.example.test/placeholder',
    });
    assertEquals(JSON.stringify(body).includes('customer'), false);
    assertEquals(JSON.stringify(body).includes('session'), false);
    assertEquals(JSON.stringify(body).includes('subscription'), false);
  },
);

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/functions/v1/stripe-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: '******' },
    body: JSON.stringify(body),
  });
}
