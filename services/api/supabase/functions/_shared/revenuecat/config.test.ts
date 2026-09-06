// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertThrows } from 'std/testing/asserts.ts';
import { readRevenueCatConfig, RevenueCatConfigurationError } from './config.ts';

function validEnvironment(): Record<string, string> {
  return {
    REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer synthetic',
    REVENUECAT_WEBHOOK_SIGNATURE_SECRETS: 'current-synthetic,previous-synthetic',
    REVENUECAT_RECONCILIATION_AUTHORIZATION: 'Bearer reconcile-synthetic',
    REVENUECAT_API_KEY: 'synthetic-api-key',
    REVENUECAT_PROJECT_ID: 'proj_synthetic',
    REVENUECAT_ACCOUNT_ID: 'acct_synthetic',
    REVENUECAT_ENVIRONMENT: 'sandbox',
    REVENUECAT_APP_MAP_JSON: JSON.stringify({
      app_apple: {
        accountId: 'acct_synthetic',
        projectId: 'proj_synthetic',
        store: 'APP_STORE',
      },
    }),
    REVENUECAT_PRODUCT_MAP_JSON: JSON.stringify({
      plus_monthly: { logicalProduct: 'base_plan', tier: 'plus' },
    }),
  };
}

Deno.test('RevenueCat configuration validates reviewed project/account/app and products', () => {
  const values = validEnvironment();
  const config = readRevenueCatConfig((name) => values[name]);
  assertEquals(config.projectId, 'proj_synthetic');
  assertEquals(config.apps.app_apple.store, 'APP_STORE');
  assertEquals(config.products.plus_monthly.tier, 'plus');
  assertEquals(config.webhookSignatureSecrets.length, 2);
});

Deno.test('RevenueCat configuration rejects a wrong project or account mapping', () => {
  for (const field of ['projectId', 'accountId']) {
    const values = validEnvironment();
    const apps = JSON.parse(values.REVENUECAT_APP_MAP_JSON);
    apps.app_apple[field] = 'wrong_scope';
    values.REVENUECAT_APP_MAP_JSON = JSON.stringify(apps);
    assertThrows(() => readRevenueCatConfig((name) => values[name]), RevenueCatConfigurationError);
  }
});

Deno.test('RevenueCat configuration rejects malformed or authority-bearing product maps', () => {
  for (const map of [
    '{malformed',
    JSON.stringify({
      sku: { logicalProduct: 'base_plan', tier: 'enterprise' },
    }),
    JSON.stringify({
      sku: { logicalProduct: 'base_plan', tier: 'premium', quantity: 99 },
    }),
  ]) {
    const values = validEnvironment();
    values.REVENUECAT_PRODUCT_MAP_JSON = map;
    assertThrows(() => readRevenueCatConfig((name) => values[name]), RevenueCatConfigurationError);
  }
});
