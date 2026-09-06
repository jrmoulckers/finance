// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertRejects } from 'std/testing/asserts.ts';
import { RevenueCatClient, RevenueCatUnavailableError } from './client.ts';
import { normalizeRevenueCatEvent } from './normalization.ts';
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
          object: 'list',
          url: url.pathname,
        }),
      );
    });

    const first = await client.getCustomerEvents(TEST_USER_ID);
    const second = await client.getCustomerEvents(TEST_USER_ID);

    assertEquals(requestedUrls.length, 4);
    assertEquals(
      requestedUrls.every(
        (requestedUrl) => new URL(requestedUrl).searchParams.get('environment') === 'sandbox',
      ),
      true,
    );
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

Deno.test('RevenueCat treats null next_page as a valid terminal page', async () => {
  const client = new RevenueCatClient(TEST_REVENUECAT_CONFIG, () =>
    Promise.resolve(
      Response.json({
        items: [subscription()],
        next_page: null,
        object: 'list',
        url: '/subscriptions',
      }),
    ),
  );
  assertEquals((await client.getCustomerEvents(TEST_USER_ID)).length, 1);
});

Deno.test(
  'RevenueCat ignores mixed-environment history after requesting configured scope',
  async () => {
    const productionConfig = {
      ...TEST_REVENUECAT_CONFIG,
      environment: 'production' as const,
    };
    let requestedEnvironment = '';
    const client = new RevenueCatClient(productionConfig, (input) => {
      requestedEnvironment = new URL(String(input)).searchParams.get('environment') ?? '';
      return Promise.resolve(
        Response.json({
          items: [
            subscription({ environment: 'sandbox' }),
            subscription({
              environment: 'production',
              id: 'sub_production_synthetic',
            }),
          ],
          next_page: null,
          object: 'list',
          url: '/subscriptions',
        }),
      );
    });

    const events = await client.getCustomerEvents(TEST_USER_ID);
    assertEquals(requestedEnvironment, 'production');
    assertEquals(events.length, 1);
    assertEquals(events[0].environment, 'production');
  },
);

Deno.test('RevenueCat v2 paused access is paid-through only when explicitly granted', async () => {
  for (const [givesAccess, expectedLifecycle] of [
    [true, 'paused_paid_through'],
    [false, 'expired'],
  ] as const) {
    const client = new RevenueCatClient(TEST_REVENUECAT_CONFIG, () =>
      Promise.resolve(
        Response.json({
          items: [subscription({ status: 'paused', gives_access: givesAccess })],
          next_page: null,
          object: 'list',
          url: '/subscriptions',
        }),
      ),
    );
    const events = await client.getCustomerEvents(TEST_USER_ID);
    const normalized = normalizeRevenueCatEvent(events[0], TEST_REVENUECAT_CONFIG, null);
    assertEquals(normalized.evidence?.lifecycle, expectedLifecycle);
    assertEquals(
      normalized.evidence?.currentPeriodEnd,
      givesAccess ? new Date(PERIOD_END).toISOString() : null,
    );
    assertEquals(
      normalized.evidence?.terminalAt,
      givesAccess ? null : new Date(PERIOD_START).toISOString(),
    );
  }
});

Deno.test('RevenueCat v2 grace uses period end while billing retry denies access', async () => {
  for (const [status, givesAccess, expectedLifecycle] of [
    ['in_grace_period', true, 'past_due_grace'],
    ['in_grace_period', false, 'expired'],
    ['in_billing_retry', true, 'expired'],
    ['in_billing_retry', false, 'expired'],
  ] as const) {
    const client = new RevenueCatClient(TEST_REVENUECAT_CONFIG, () =>
      Promise.resolve(
        Response.json({
          items: [subscription({ status, gives_access: givesAccess })],
          next_page: null,
          object: 'list',
          url: '/subscriptions',
        }),
      ),
    );
    const events = await client.getCustomerEvents(TEST_USER_ID);
    const normalized = normalizeRevenueCatEvent(events[0], TEST_REVENUECAT_CONFIG, null);
    assertEquals(normalized.evidence?.lifecycle, expectedLifecycle);
    if (status === 'in_grace_period' && givesAccess) {
      assertEquals(normalized.evidence?.graceEnd, new Date(PERIOD_END).toISOString());
      assertEquals(normalized.evidence?.terminalAt, null);
    } else {
      assertEquals(normalized.evidence?.graceEnd, null);
      assertEquals(normalized.evidence?.terminalAt, new Date(PERIOD_START).toISOString());
    }
  }
});

Deno.test(
  'RevenueCat v2 access-bearing states fail closed without explicit access or bound',
  async () => {
    for (const item of [
      subscription({ status: 'paused', gives_access: undefined }),
      subscription({ status: 'in_grace_period', gives_access: undefined }),
      subscription({ status: 'in_billing_retry', gives_access: undefined }),
      subscription({
        status: 'in_grace_period',
        gives_access: true,
        current_period_ends_at: undefined,
      }),
    ]) {
      const client = new RevenueCatClient(TEST_REVENUECAT_CONFIG, () =>
        Promise.resolve(
          Response.json({
            items: [item],
            next_page: null,
            object: 'list',
            url: '/subscriptions',
          }),
        ),
      );
      await assertRejects(() => client.getCustomerEvents(TEST_USER_ID), RevenueCatUnavailableError);
    }
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
