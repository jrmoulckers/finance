// SPDX-License-Identifier: BUSL-1.1

import { assertEquals } from 'std/testing/asserts.ts';
import {
  createRevenueCatTestSignature,
  parseRevenueCatSignature,
  verifyRevenueCatWebhook,
} from './signature.ts';

const encoder = new TextEncoder();
const rawBody = encoder.encode('{"event":{"id":"evt_synthetic"}}');
const nowMs = Date.parse('2026-09-06T12:00:00Z');
const timestamp = Math.floor(nowMs / 1000);

async function headers(
  secrets: readonly string[],
  signedAt: number = timestamp,
  authorization = 'Bearer synthetic-webhook',
): Promise<Headers> {
  const signatures = await Promise.all(
    secrets.map((secret) => createRevenueCatTestSignature(secret, signedAt, rawBody)),
  );
  return new Headers({
    Authorization: authorization,
    'X-RevenueCat-Webhook-Signature': [
      `t=${signedAt}`,
      ...signatures.map((signature) => `v1=${signature}`),
    ].join(','),
  });
}

Deno.test(
  'RevenueCat signature parser requires one timestamp and every v1 is retained',
  async () => {
    const signed = await headers(['rotation-old', 'rotation-new']);
    const parsed = parseRevenueCatSignature(signed.get('X-RevenueCat-Webhook-Signature'));
    assertEquals(parsed?.timestamp, timestamp);
    assertEquals(parsed?.signatures.length, 2);
    assertEquals(parseRevenueCatSignature(`t=${timestamp}`), null);
    assertEquals(
      parseRevenueCatSignature(`t=${timestamp},t=${timestamp},v1=${'a'.repeat(64)}`),
      null,
    );
    assertEquals(parseRevenueCatSignature(`t=${timestamp},v1=not-hex`), null);
  },
);

Deno.test(
  'RevenueCat verification requires configured Authorization and a valid rotated secret',
  async () => {
    const signed = await headers(['previous-secret']);
    assertEquals(
      await verifyRevenueCatWebhook(
        signed,
        rawBody,
        'Bearer synthetic-webhook',
        ['current-secret', 'previous-secret'],
        nowMs,
      ),
      true,
    );
    signed.set('Authorization', 'Bearer forged');
    assertEquals(
      await verifyRevenueCatWebhook(
        signed,
        rawBody,
        'Bearer synthetic-webhook',
        ['previous-secret'],
        nowMs,
      ),
      false,
    );
  },
);

Deno.test('RevenueCat verification rejects missing, forged, and stale signatures', async () => {
  assertEquals(
    await verifyRevenueCatWebhook(
      new Headers({ Authorization: 'Bearer synthetic-webhook' }),
      rawBody,
      'Bearer synthetic-webhook',
      ['current-secret'],
      nowMs,
    ),
    false,
  );

  const forged = await headers(['wrong-secret']);
  assertEquals(
    await verifyRevenueCatWebhook(
      forged,
      rawBody,
      'Bearer synthetic-webhook',
      ['current-secret'],
      nowMs,
    ),
    false,
  );

  const stale = await headers(['current-secret'], timestamp - 301);
  assertEquals(
    await verifyRevenueCatWebhook(
      stale,
      rawBody,
      'Bearer synthetic-webhook',
      ['current-secret'],
      nowMs,
    ),
    false,
  );
});

Deno.test('RevenueCat signature covers exact raw bytes', async () => {
  const signed = await headers(['current-secret']);
  const reformatted = encoder.encode('{ "event": { "id": "evt_synthetic" } }');
  assertEquals(
    await verifyRevenueCatWebhook(
      signed,
      reformatted,
      'Bearer synthetic-webhook',
      ['current-secret'],
      nowMs,
    ),
    false,
  );
});
