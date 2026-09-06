// SPDX-License-Identifier: BUSL-1.1

import { configuredStripeEnvironment } from './catalog.ts';
import { type StripeEnvironment } from './types.ts';

export interface StripeRuntimeConfig {
  secretKey: string;
  webhookSecrets: string[];
  accountId: string;
  environment: StripeEnvironment;
  checkoutSuccessUrl: string;
  checkoutCancelUrl: string;
  portalReturnUrl: string;
}

export function loadStripeRuntimeConfig(
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): StripeRuntimeConfig {
  const environment = configuredStripeEnvironment(getEnv('STRIPE_ENVIRONMENT'));
  const config = {
    secretKey: required(getEnv, 'STRIPE_SECRET_KEY'),
    webhookSecrets: required(getEnv, 'STRIPE_WEBHOOK_SECRETS')
      .split(',')
      .map((secret) => secret.trim())
      .filter(Boolean),
    accountId: required(getEnv, 'STRIPE_ACCOUNT_ID'),
    environment,
    checkoutSuccessUrl: trustedUrl(required(getEnv, 'STRIPE_CHECKOUT_SUCCESS_URL')),
    checkoutCancelUrl: trustedUrl(required(getEnv, 'STRIPE_CHECKOUT_CANCEL_URL')),
    portalReturnUrl: trustedUrl(required(getEnv, 'STRIPE_PORTAL_RETURN_URL')),
  };
  if (config.webhookSecrets.length === 0) {
    throw new Error('Stripe webhook secret is required');
  }
  if (
    (environment === 'production' && !config.secretKey.startsWith('sk_live_')) ||
    (environment === 'sandbox' && !config.secretKey.startsWith('sk_test_'))
  ) {
    throw new Error('Stripe key mode does not match the configured environment');
  }
  return config;
}

function required(getEnv: (name: string) => string | undefined, name: string): string {
  const value = getEnv(name)?.trim();
  if (!value) throw new Error('Stripe service is not configured');
  return value;
}

function trustedUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
    throw new Error('Stripe redirect URL must use HTTPS');
  }
  return parsed.toString();
}
