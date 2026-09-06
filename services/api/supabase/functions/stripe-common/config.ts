// SPDX-License-Identifier: BUSL-1.1

import { configuredStripeEnvironment } from './catalog.ts';
import { type StripeEnvironment } from './types.ts';

export interface StripeBaseConfig {
  secretKey: string;
  accountId: string;
  environment: StripeEnvironment;
}

export interface StripeWebhookConfig extends StripeBaseConfig {
  webhookSecrets: string[];
}

export interface StripeCheckoutConfig extends StripeBaseConfig {
  checkoutSuccessUrl: string;
  checkoutCancelUrl: string;
}

export interface StripePortalConfig extends StripeBaseConfig {
  portalReturnUrl: string;
}

export function loadStripeBaseConfig(
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): StripeBaseConfig {
  const environment = configuredStripeEnvironment(getEnv('STRIPE_ENVIRONMENT'));
  const config = {
    secretKey: required(getEnv, 'STRIPE_SECRET_KEY'),
    accountId: required(getEnv, 'STRIPE_ACCOUNT_ID'),
    environment,
  };
  if (
    (environment === 'production' && !config.secretKey.startsWith('sk_live_')) ||
    (environment === 'sandbox' && !config.secretKey.startsWith('sk_test_'))
  ) {
    throw new Error('Stripe key mode does not match the configured environment');
  }
  return config;
}

export function loadStripeWebhookConfig(
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): StripeWebhookConfig {
  const webhookSecrets = required(getEnv, 'STRIPE_WEBHOOK_SECRETS')
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean);
  if (webhookSecrets.length === 0) {
    throw new Error('Stripe webhook secret is required');
  }
  return { ...loadStripeBaseConfig(getEnv), webhookSecrets };
}

export function loadStripeCheckoutConfig(
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): StripeCheckoutConfig {
  return {
    ...loadStripeBaseConfig(getEnv),
    checkoutSuccessUrl: trustedUrl(required(getEnv, 'STRIPE_CHECKOUT_SUCCESS_URL')),
    checkoutCancelUrl: trustedUrl(required(getEnv, 'STRIPE_CHECKOUT_CANCEL_URL')),
  };
}

export function loadStripePortalConfig(
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): StripePortalConfig {
  return {
    ...loadStripeBaseConfig(getEnv),
    portalReturnUrl: trustedUrl(required(getEnv, 'STRIPE_PORTAL_RETURN_URL')),
  };
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
