// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  loadStripeBaseConfig,
  loadStripeCheckoutConfig,
  loadStripeWebhookConfig,
} from './config.ts';

const base: Record<string, string> = {
  STRIPE_SECRET_KEY: 'sk_test_placeholder',
  STRIPE_ACCOUNT_ID: 'acct_placeholder',
  STRIPE_ENVIRONMENT: 'sandbox',
};

Deno.test('Stripe endpoint configuration loads only the secrets it needs', () => {
  const baseConfig = loadStripeBaseConfig((name) => base[name]);
  assertEquals(baseConfig.environment, 'sandbox');

  const webhook = loadStripeWebhookConfig(
    (name) =>
      ({
        ...base,
        STRIPE_WEBHOOK_SECRETS: 'whsec_old_placeholder,whsec_new_placeholder',
      })[name],
  );
  assertEquals(webhook.webhookSecrets.length, 2);
});

Deno.test('Stripe configuration enforces key mode and trusted redirect URLs', () => {
  assertThrows(() =>
    loadStripeBaseConfig(
      (name) =>
        ({
          ...base,
          STRIPE_SECRET_KEY: 'sk_live_placeholder',
        })[name],
    ),
  );
  assertThrows(() =>
    loadStripeCheckoutConfig(
      (name) =>
        ({
          ...base,
          STRIPE_CHECKOUT_SUCCESS_URL: 'http://untrusted.example.test/success',
          STRIPE_CHECKOUT_CANCEL_URL: 'https://app.example.test/cancel',
        })[name],
    ),
  );
});
