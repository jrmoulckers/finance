// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'std/testing/asserts.ts';
import { ingestRevenueCatEvents } from './service.ts';
import {
  MemoryRevenueCatStore,
  TEST_REVENUECAT_CONFIG,
  testRevenueCatEvent,
} from './test-support.ts';

Deno.test('RevenueCat duplicate provider event IDs are successful no-ops', async () => {
  const store = new MemoryRevenueCatStore();
  const event = testRevenueCatEvent();
  const first = await ingestRevenueCatEvents([event], TEST_REVENUECAT_CONFIG, store);
  const duplicate = await ingestRevenueCatEvents([event], TEST_REVENUECAT_CONFIG, store);
  assertEquals(first.recognized, 1);
  assertEquals(duplicate.recognized, 1);
  assertEquals(duplicate.applied, 0);
  assertEquals(store.appended.length, 1);
});

Deno.test(
  'RevenueCat delivery order does not let stale evidence overwrite newer state',
  async () => {
    const store = new MemoryRevenueCatStore();
    const newer = testRevenueCatEvent({
      id: 'evt_newer',
      type: 'RENEWAL',
      event_timestamp_ms: Date.parse('2026-09-10T12:00:00Z'),
      purchased_at_ms: Date.parse('2026-09-10T12:00:00Z'),
      expiration_at_ms: Date.parse('2026-10-10T12:00:00Z'),
    });
    const older = testRevenueCatEvent({
      id: 'evt_older',
      event_timestamp_ms: Date.parse('2026-09-01T12:00:00Z'),
      purchased_at_ms: Date.parse('2026-09-01T12:00:00Z'),
      expiration_at_ms: Date.parse('2026-10-01T12:00:00Z'),
    });

    const result = await ingestRevenueCatEvents([newer, older], TEST_REVENUECAT_CONFIG, store);
    assertEquals(result.recognized, 2);
    assertEquals(result.applied, 1);
  },
);

Deno.test('RevenueCat refund and chargeback cannot be resurrected', async () => {
  for (const cancelReason of ['REFUND', 'CHARGEBACK']) {
    const store = new MemoryRevenueCatStore();
    const terminal = testRevenueCatEvent({
      id: `evt_${cancelReason.toLowerCase()}`,
      type: 'CANCELLATION',
      cancel_reason: cancelReason,
      event_timestamp_ms: Date.parse('2026-09-10T12:00:00Z'),
    });
    const laterActive = testRevenueCatEvent({
      id: `evt_active_after_${cancelReason.toLowerCase()}`,
      type: 'RENEWAL',
      event_timestamp_ms: Date.parse('2026-09-11T12:00:00Z'),
      purchased_at_ms: Date.parse('2026-09-11T12:00:00Z'),
      expiration_at_ms: Date.parse('2026-10-11T12:00:00Z'),
    });
    const result = await ingestRevenueCatEvents(
      [terminal, laterActive],
      TEST_REVENUECAT_CONFIG,
      store,
    );
    assertEquals(result.applied, 1);
  }
});
