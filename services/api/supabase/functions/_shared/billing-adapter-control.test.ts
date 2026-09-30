// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { billingAdapterDisabledResponse } from './billing-adapter-control.ts';

Deno.test('billing adapter control fails closed when state is absent or malformed', async () => {
  for (const value of [undefined, '', 'disabled', 'ENABLED']) {
    const response = billingAdapterDisabledResponse('revenuecat', () => value);
    assertEquals(response?.status, 503);
    assertEquals(response?.headers.get('Cache-Control'), 'no-store');
    assertEquals(await response?.json(), { error: 'billing_adapter_disabled' });
  }
});

Deno.test('billing adapters are controlled independently', () => {
  const states: Record<string, string> = {
    REVENUECAT_ADAPTER_STATE: 'disabled',
    STRIPE_ADAPTER_STATE: 'enabled',
  };
  const readEnv = (name: string) => states[name];

  assertEquals(billingAdapterDisabledResponse('revenuecat', readEnv)?.status, 503);
  assertEquals(billingAdapterDisabledResponse('stripe', readEnv), null);
});

Deno.test('billing adapter control permits only an explicit enabled value', () => {
  assertEquals(
    billingAdapterDisabledResponse('revenuecat', () => 'enabled'),
    null,
  );
  assertEquals(
    billingAdapterDisabledResponse('stripe', () => 'enabled'),
    null,
  );
});
