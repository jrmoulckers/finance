// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertRejects, assertStringIncludes } from 'std/testing/asserts.ts';
import { RevenueCatClient, RevenueCatUnavailableError } from './client.ts';
import type { RevenueCatConfig } from './config.ts';

const config = {
  apiBaseUrl: 'https://api.revenuecat.test/v2',
  apiKey: 'synthetic-api-key',
  projectId: 'proj_synthetic',
} as RevenueCatConfig;

Deno.test(
  'RevenueCat reconciliation fetch is project-scoped and creates stable evidence',
  async () => {
    let requestedUrl = '';
    let authorization = '';
    const client = new RevenueCatClient(config, (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get('Authorization') ?? '';
      return Promise.resolve(
        Response.json({
          items: [
            {
              id: 'sub_synthetic',
              app_id: 'app_apple',
              customer_id: '44010000-0000-4000-8000-000000000001',
              product_id: 'plus_monthly',
              status: 'active',
              current_period_starts_at: '2026-09-01T00:00:00Z',
              current_period_ends_at: '2026-10-01T00:00:00Z',
              environment: 'SANDBOX',
              store: 'APP_STORE',
              updated_at: '2026-09-06T12:00:00Z',
            },
          ],
        }),
      );
    });

    const first = await client.getCustomerEvents('44010000-0000-4000-8000-000000000001');
    const second = await client.getCustomerEvents('44010000-0000-4000-8000-000000000001');
    assertStringIncludes(requestedUrl, '/projects/proj_synthetic/customers/');
    assertEquals(authorization, 'Bearer synthetic-api-key');
    assertEquals(first[0].id, second[0].id);
    assertEquals(first[0].type, 'RENEWAL');
  },
);

Deno.test('RevenueCat reconciliation outage is explicit and retryable', async () => {
  const client = new RevenueCatClient(config, () =>
    Promise.resolve(new Response('synthetic outage', { status: 503 })),
  );
  await assertRejects(
    () => client.getCustomerEvents('synthetic-customer'),
    RevenueCatUnavailableError,
  );
});
