// SPDX-License-Identifier: BUSL-1.1

import {
  type StripeCatalogChoice,
  type StripeCatalogEntry,
  type StripeEnvironment,
} from './types.ts';

interface CatalogDefinition extends Omit<StripeCatalogEntry, 'priceId'> {
  envName: string;
}

const CATALOG: Record<StripeCatalogChoice, CatalogDefinition> = {
  plus_monthly: {
    choice: 'plus_monthly',
    envName: 'STRIPE_PRICE_PLUS_MONTHLY',
    logicalProduct: 'base_plan',
    tier: 'plus',
    quantity: 1,
    requiresHousehold: false,
  },
  plus_yearly: {
    choice: 'plus_yearly',
    envName: 'STRIPE_PRICE_PLUS_YEARLY',
    logicalProduct: 'base_plan',
    tier: 'plus',
    quantity: 1,
    requiresHousehold: false,
  },
  premium_monthly: {
    choice: 'premium_monthly',
    envName: 'STRIPE_PRICE_PREMIUM_MONTHLY',
    logicalProduct: 'base_plan',
    tier: 'premium',
    quantity: 1,
    requiresHousehold: false,
  },
  premium_yearly: {
    choice: 'premium_yearly',
    envName: 'STRIPE_PRICE_PREMIUM_YEARLY',
    logicalProduct: 'base_plan',
    tier: 'premium',
    quantity: 1,
    requiresHousehold: false,
  },
  family_monthly: {
    choice: 'family_monthly',
    envName: 'STRIPE_PRICE_FAMILY_MONTHLY',
    logicalProduct: 'base_plan',
    tier: 'family',
    quantity: 1,
    requiresHousehold: true,
  },
  family_yearly: {
    choice: 'family_yearly',
    envName: 'STRIPE_PRICE_FAMILY_YEARLY',
    logicalProduct: 'base_plan',
    tier: 'family',
    quantity: 1,
    requiresHousehold: true,
  },
  premium_bank_addon_monthly: {
    choice: 'premium_bank_addon_monthly',
    envName: 'STRIPE_PRICE_PREMIUM_BANK_ADDON_MONTHLY',
    logicalProduct: 'premium_bank_addon',
    tier: null,
    quantity: 1,
    requiresHousehold: true,
  },
};

export const STRIPE_CATALOG_CHOICES = Object.freeze(Object.keys(CATALOG) as StripeCatalogChoice[]);

export function isStripeCatalogChoice(value: unknown): value is StripeCatalogChoice {
  return typeof value === 'string' && value in CATALOG;
}

export function resolveCatalogChoice(
  choice: StripeCatalogChoice,
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): StripeCatalogEntry {
  const definition = CATALOG[choice];
  const priceId = getEnv(definition.envName)?.trim();
  if (!priceId) {
    throw new Error('Stripe catalog is not configured');
  }
  return { ...definition, priceId };
}

export function resolveCatalogPrice(
  priceId: string,
  getEnv: (name: string) => string | undefined = (name) => Deno.env.get(name),
): StripeCatalogEntry | null {
  for (const choice of STRIPE_CATALOG_CHOICES) {
    const entry = resolveCatalogChoice(choice, getEnv);
    if (entry.priceId === priceId) return entry;
  }
  return null;
}

export function stripeEnvironmentFromMode(livemode: boolean): StripeEnvironment {
  return livemode ? 'production' : 'sandbox';
}

export function configuredStripeEnvironment(value: string | undefined): StripeEnvironment {
  if (value === 'sandbox' || value === 'production') return value;
  throw new Error('Stripe environment is not configured');
}
