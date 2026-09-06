// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { createStripePortalHandler } from './index.ts';

Deno.test('Stripe portal returns only a short-lived redirect URL', async () => {
  const handler = createStripePortalHandler({
    authenticate: () =>
      Promise.resolve({
        id: '20000000-0000-4000-8000-000000000001',
        email: '',
      }),
    service: {
      create: () =>
        Promise.resolve({
          portalUrl: 'https://portal.example.test/placeholder',
        }),
    },
  });
  const response = await handler(
    new Request('http://localhost/functions/v1/stripe-portal', {
      method: 'POST',
      headers: { Authorization: '******' },
    }),
  );
  assertEquals(await response.json(), {
    portal_url: 'https://portal.example.test/placeholder',
  });
});
