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

Deno.test(
  'Stripe scheduled reconciliation requires independent machine authentication',
  async () => {
    const handler = createStripeReconcileHandler({
      schedulerAuthorization: 'Bearer synthetic-scheduler-secret',
      authenticate: () => {
        throw new Error('user authentication must not run');
      },
      service: {
        reconcile: () => Promise.resolve(0),
        reconcileBatch: () => Promise.resolve({ reconciled: 4, nextCursor: 'v1:100' }),
      },
    });
    const unauthorized = await handler(scheduledRequest('Bearer wrong'));
    assertEquals(unauthorized.status, 401);

    const response = await handler(scheduledRequest('Bearer synthetic-scheduler-secret'));
    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      state: 'pending',
      reconciled: 4,
      nextCursor: 'v1:100',
    });
  },
);

function request(): Request {
  return new Request('http://localhost/functions/v1/stripe-reconcile', {
    method: 'POST',
    headers: { Authorization: '******' },
  });
}

function scheduledRequest(authorization: string): Request {
  return new Request('http://localhost/functions/v1/stripe-reconcile', {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'X-Finance-Maintenance-Task': 'stripe-reconciliation',
    },
  });
}
