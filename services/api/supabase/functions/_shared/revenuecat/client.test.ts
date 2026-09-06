// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertRejects } from 'std/testing/asserts.ts';
import { RevenueCatClient, RevenueCatUnavailableError } from './client.ts';
import { TEST_REVENUECAT_CONFIG, TEST_USER_ID } from './test-support.ts';

const PERIOD_START = Date.parse('2026-09-01T00:00:00Z');
const PERIOD_END = Date.parse('2026-10-01T00:00:00Z');

function subscription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    auto_renewal_status: 'will_renew',
    country: 'US',
    current_period_ends_at: PERIOD_END,
    current_period_starts_at: PERIOD_START,
    customer_id: TEST_USER_ID,
    entitlement_ids: ['entl_synthetic'],
    environment: 'sandbox',
    gives_access: true,
    id: 'sub_synthetic',
    management_url: 'https://apps.apple.com/account/subscriptions',
    pending_changes: null,
    product_id: 'plus_monthly',
    status: 'active',
    store: 'app_store',
    store_subscription_identifier: 'store-subscription-synthetic',
    ...overrides,
  };
}

Deno.test(
  'RevenueCat consumes production-shaped v2 subscription pages and resolves reviewed apps',
  async () => {
    const requestedUrls: string[] = [];
    const authorizations: string[] = [];
    const client = new RevenueCatClient(TEST_REVENUECAT_CONFIG, (input, init) => {
      const url = new URL(String(input));
      requestedUrls.push(url.href);
      authorizations.push(new Headers(init?.headers).get('Authorization') ?? '');
      if (!url.searchParams.has('starting_after')) {
        return Promise.resolve(
          Response.json({
            items: [subscription()],
            next_page: `${url.origin}${url.pathname}?starting_after=sub_synthetic`,
            object: 'list',
            url: url.pathname,
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          items: [
            subscription({
              auto_renewal_status: 'will_not_renew',
              current_period_ends_at: PERIOD_END + 1,
              current_period_starts_at: PERIOD_START + 1,
              id: 'sub_terminal_synthetic',
              product_id: 'plus_google',
              status: 'expired',
              store: 'play_store',
              store_subscription_identifier: 'store-terminal-synthetic',
            }),
          ],
          next_page: null,
          object: 'list',
          url: url.pathname,
        }),
      );
    });

    const first = await client.getCustomerEvents(TEST_USER_ID);
    const second = await client.getCustomerEvents(TEST_USER_ID);

    assertEquals(requestedUrls.length, 4);
    assertEquals(
      requestedUrls[0].includes(
        `/projects/${TEST_REVENUECAT_CONFIG.projectId}/customers/${TEST_USER_ID}/subscriptions`,
      ),
      true,
    );
    assertEquals(
      authorizations.every(
        (authorization) => authorization === `Bearer ${TEST_REVENUECAT_CONFIG.apiKey}`,
      ),
      true,
    );
    assertEquals(
      first.map((event) => event.app_id),
      ['app_apple', 'app_google'],
    );
    assertEquals(
      first.map((event) => event.store),
      ['APP_STORE', 'PLAY_STORE'],
    );
    assertEquals(
      first.map((event) => event.type),
      ['RENEWAL', 'EXPIRATION'],
    );
    assertEquals(first[0].event_timestamp_ms, PERIOD_START);
    assertEquals(first[1].event_timestamp_ms, PERIOD_END + 1);
    assertEquals(
      first.map((event) => event.id),
      second.map((event) => event.id),
    );
  },
);

Deno.test(
  'RevenueCat rejects provider pagination outside the scoped customer endpoint',
  async () => {
    const client = new RevenueCatClient(TEST_REVENUECAT_CONFIG, () =>
      Promise.resolve(
        Response.json({
          items: [],
          next_page: 'https://untrusted.example.test/subscriptions',
          object: 'list',
          url: '/subscriptions',
        }),
      ),
    );
    await assertRejects(() => client.getCustomerEvents(TEST_USER_ID), RevenueCatUnavailableError);
  },
);

Deno.test('RevenueCat reconciliation outage is explicit and retryable', async () => {
  const client = new RevenueCatClient(TEST_REVENUECAT_CONFIG, () =>
    Promise.resolve(new Response('synthetic outage', { status: 503 })),
  );
  await assertRejects(
    () => client.getCustomerEvents('synthetic-customer'),
    RevenueCatUnavailableError,
  );
});
