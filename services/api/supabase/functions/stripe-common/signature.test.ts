// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  createStripeTestSignature,
  StripeSignatureError,
  verifyStripeSignature,
} from './signature.ts';

Deno.test('Stripe signature verifies the exact raw UTF-8 body', async () => {
  const timestamp = 2_000_000_000;
  const rawBody = '{\n  "id": "evt_placeholder", "value": "café"\n}';
  const signature = await createStripeTestSignature('whsec_placeholder', timestamp, rawBody);

  await verifyStripeSignature({
    rawBody,
    signatureHeader: `t=${timestamp},v1=${signature}`,
    webhookSecrets: ['whsec_placeholder'],
    nowSeconds: timestamp,
  });

  await assertRejects(
    () =>
      verifyStripeSignature({
        rawBody: JSON.stringify(JSON.parse(rawBody)),
        signatureHeader: `t=${timestamp},v1=${signature}`,
        webhookSecrets: ['whsec_placeholder'],
        nowSeconds: timestamp,
      }),
    StripeSignatureError,
  );
});

Deno.test('Stripe signature rejects missing, forged, and stale signatures', async () => {
  const common = {
    rawBody: '{"id":"evt_placeholder"}',
    webhookSecrets: ['whsec_placeholder'],
    nowSeconds: 2_000_000_000,
  };
  for (const signatureHeader of [
    null,
    't=2000000000,v1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    `t=1999999000,v1=${await createStripeTestSignature(
      'whsec_placeholder',
      1_999_999_000,
      common.rawBody,
    )}`,
  ]) {
    await assertRejects(
      () => verifyStripeSignature({ ...common, signatureHeader }),
      StripeSignatureError,
    );
  }
});

Deno.test('Stripe signature supports multiple v1 values and rotating secrets', async () => {
  const timestamp = 2_000_000_000;
  const rawBody = '{"id":"evt_placeholder"}';
  const valid = await createStripeTestSignature('whsec_new_placeholder', timestamp, rawBody);
  await verifyStripeSignature({
    rawBody,
    signatureHeader: `t=${timestamp},v1=${'0'.repeat(64)},v1=${valid}`,
    webhookSecrets: ['whsec_old_placeholder', 'whsec_new_placeholder'],
    nowSeconds: timestamp,
  });
  assertEquals(valid.length, 64);
});
