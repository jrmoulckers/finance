// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { createStripeStatusHandler } from './index.ts';

Deno.test('Stripe status exposes only the minimized Finance projection', async () => {
  const handler = createStripeStatusHandler({
    authenticate: () =>
      Promise.resolve({
        id: '20000000-0000-4000-8000-000000000001',
        email: '',
      }),
    service: {
      load: () =>
        Promise.resolve({
          user_display_tier: 'premium',
          household_display_tier: null,
          bank_connection_allowance: 0,
          is_premium_sponsor: false,
          is_family_bound: false,
          effective_at: '2033-05-18T03:33:20.000Z',
          expires_at: '2033-06-18T03:33:20.000Z',
          projection_version: 2,
          server_time: '2033-05-18T03:33:21.000Z',
        }),
    },
  });
  const response = await handler(
    new Request('http://localhost/functions/v1/stripe-status', {
      headers: { Authorization: '******' },
    }),
  );
  const body = await response.text();
  assertEquals(response.status, 200);
  assertEquals(body.includes('customer'), false);
  assertEquals(body.includes('subscription'), false);
  assertEquals(body.includes('payment'), false);
});
