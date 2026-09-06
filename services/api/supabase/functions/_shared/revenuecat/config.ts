// SPDX-License-Identifier: BUSL-1.1

export type BillingEnvironment = 'sandbox' | 'production';
export type RevenueCatStore = 'APP_STORE' | 'PLAY_STORE';
export type PaidTier = 'plus' | 'premium' | 'family';

export interface RevenueCatApp {
  accountId: string;
  projectId: string;
  store: RevenueCatStore;
}

export interface RevenueCatProduct {
  appId: string;
  revenueCatProductId: string;
  storeProductIdentifiers: readonly string[];
  logicalProduct: 'base_plan';
  tier: PaidTier;
}

export interface RevenueCatConfig {
  webhookAuthorization: string;
  webhookSignatureSecrets: readonly string[];
  reconciliationAuthorization: string;
  apiKey: string;
  apiBaseUrl: string;
  accountId: string;
  projectId: string;
  environment: BillingEnvironment;
  apps: Readonly<Record<string, RevenueCatApp>>;
  products: Readonly<Record<string, RevenueCatProduct>>;
}

export class RevenueCatConfigurationError extends Error {
  constructor() {
    super('RevenueCat configuration is invalid');
    this.name = 'RevenueCatConfigurationError';
  }
}

type EnvReader = (name: string) => string | undefined;

function required(readEnv: EnvReader, name: string): string {
  const value = readEnv(name)?.trim();
  if (!value) throw new RevenueCatConfigurationError();
  return value;
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new RevenueCatConfigurationError();
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RevenueCatConfigurationError) throw error;
    throw new RevenueCatConfigurationError();
  }
}

function parseApps(
  raw: string,
  expectedAccountId: string,
  expectedProjectId: string,
): Record<string, RevenueCatApp> {
  const entries = parseJsonObject(raw);
  const apps: Record<string, RevenueCatApp> = {};

  for (const [appId, value] of Object.entries(entries)) {
    if (!appId.trim() || !value || typeof value !== 'object' || Array.isArray(value)) {
      throw new RevenueCatConfigurationError();
    }
    const app = value as Record<string, unknown>;
    if (
      app.accountId !== expectedAccountId ||
      app.projectId !== expectedProjectId ||
      (app.store !== 'APP_STORE' && app.store !== 'PLAY_STORE') ||
      Object.keys(app).some((key) => !['accountId', 'projectId', 'store'].includes(key))
    ) {
      throw new RevenueCatConfigurationError();
    }
    apps[appId] = {
      accountId: expectedAccountId,
      projectId: expectedProjectId,
      store: app.store,
    };
  }

  if (Object.keys(apps).length === 0) throw new RevenueCatConfigurationError();
  return apps;
}

function parseProducts(
  raw: string,
  apps: Readonly<Record<string, RevenueCatApp>>,
): Record<string, RevenueCatProduct> {
  const entries = parseJsonObject(raw);
  const products: Record<string, RevenueCatProduct> = {};
  const revenueCatProductIds = new Set<string>();
  const storeProductIdentifiers = new Set<string>();

  for (const [catalogKey, value] of Object.entries(entries)) {
    if (!catalogKey.trim() || !value || typeof value !== 'object' || Array.isArray(value)) {
      throw new RevenueCatConfigurationError();
    }
    const product = value as Record<string, unknown>;
    const storeIds = product.storeProductIdentifiers;
    if (
      typeof product.appId !== 'string' ||
      !apps[product.appId] ||
      typeof product.revenueCatProductId !== 'string' ||
      !product.revenueCatProductId.trim() ||
      product.revenueCatProductId !== product.revenueCatProductId.trim() ||
      product.revenueCatProductId.length > 255 ||
      !Array.isArray(storeIds) ||
      storeIds.length === 0 ||
      storeIds.some(
        (storeId) =>
          typeof storeId !== 'string' ||
          !storeId.trim() ||
          storeId !== storeId.trim() ||
          storeId.length > 255,
      ) ||
      new Set(storeIds).size !== storeIds.length ||
      product.logicalProduct !== 'base_plan' ||
      !['plus', 'premium', 'family'].includes(String(product.tier)) ||
      Object.keys(product).some(
        (key) =>
          ![
            'appId',
            'revenueCatProductId',
            'storeProductIdentifiers',
            'logicalProduct',
            'tier',
          ].includes(key),
      )
    ) {
      throw new RevenueCatConfigurationError();
    }
    const revenueCatKey = product.revenueCatProductId.trim();
    const scopedStoreIds = (storeIds as string[]).map((storeId) => `${product.appId}:${storeId}`);
    if (
      revenueCatProductIds.has(revenueCatKey) ||
      scopedStoreIds.some((storeId) => storeProductIdentifiers.has(storeId))
    ) {
      throw new RevenueCatConfigurationError();
    }
    revenueCatProductIds.add(revenueCatKey);
    scopedStoreIds.forEach((storeId) => storeProductIdentifiers.add(storeId));
    products[catalogKey] = {
      appId: product.appId,
      revenueCatProductId: revenueCatKey,
      storeProductIdentifiers: storeIds as string[],
      logicalProduct: 'base_plan',
      tier: product.tier as PaidTier,
    };
  }

  if (Object.keys(products).length === 0) {
    throw new RevenueCatConfigurationError();
  }
  return products;
}

export function readRevenueCatConfig(
  readEnv: EnvReader = (name) => Deno.env.get(name),
): RevenueCatConfig {
  const accountId = required(readEnv, 'REVENUECAT_ACCOUNT_ID');
  const projectId = required(readEnv, 'REVENUECAT_PROJECT_ID');
  const environment = required(readEnv, 'REVENUECAT_ENVIRONMENT').toLowerCase();
  if (environment !== 'sandbox' && environment !== 'production') {
    throw new RevenueCatConfigurationError();
  }

  const signatureSecrets = required(readEnv, 'REVENUECAT_WEBHOOK_SIGNATURE_SECRETS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (signatureSecrets.length === 0) throw new RevenueCatConfigurationError();

  const apiBaseUrl = readEnv('REVENUECAT_API_BASE_URL')?.trim() || 'https://api.revenuecat.com/v2';
  let parsedApiBaseUrl: URL;
  try {
    parsedApiBaseUrl = new URL(apiBaseUrl);
  } catch {
    throw new RevenueCatConfigurationError();
  }
  if (parsedApiBaseUrl.protocol !== 'https:' && parsedApiBaseUrl.hostname !== 'localhost') {
    throw new RevenueCatConfigurationError();
  }
  const apps = parseApps(required(readEnv, 'REVENUECAT_APP_MAP_JSON'), accountId, projectId);

  return {
    webhookAuthorization: required(readEnv, 'REVENUECAT_WEBHOOK_AUTHORIZATION'),
    webhookSignatureSecrets: signatureSecrets,
    reconciliationAuthorization: required(readEnv, 'REVENUECAT_RECONCILIATION_AUTHORIZATION'),
    apiKey: required(readEnv, 'REVENUECAT_API_KEY'),
    apiBaseUrl: parsedApiBaseUrl.toString().replace(/\/$/, ''),
    accountId,
    projectId,
    environment,
    apps,
    products: parseProducts(required(readEnv, 'REVENUECAT_PRODUCT_MAP_JSON'), apps),
  };
}
