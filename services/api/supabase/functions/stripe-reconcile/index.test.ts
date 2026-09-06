// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { createStripeReconcileHandler } from './index.ts';

const authenticate = () =>
  Promise.resolve({ id: '20000000-0000-4000-8000-000000000001', email: '' });

Deno.test('Stripe reconciliation reports pending after appending current evidence', async () => {
  const handler = createStripeReconcileHandler({
    authenticate,
    service: { reconcile: () => Promise.resolve(2) },
  });
  const response = await handler(request());
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { state: 'pending', reconciled: 2 });
});

Deno.test('Stripe reconciliation fails explicitly and retryably on outage', async () => {
  const handler = createStripeReconcileHandler({
    authenticate,
    service: { reconcile: () => Promise.reject(new Error('offline')) },
  });
  const response = await handler(request());
  assertEquals(response.status, 503);
  assertEquals(response.headers.get('Retry-After'), '30');
  assertEquals(await response.json(), {
    error: 'Billing reconciliation temporarily unavailable',
  });
});

function request(): Request {
  return new Request('http://localhost/functions/v1/stripe-reconcile', {
    method: 'POST',
    headers: { Authorization: '******' },
  });
}
