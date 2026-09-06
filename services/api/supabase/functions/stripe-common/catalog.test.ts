// SPDX-License-Identifier: BUSL-1.1

import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isStripeCatalogChoice, resolveCatalogChoice, resolveCatalogPrice } from './catalog.ts';

const prices: Record<string, string> = {
  STRIPE_PRICE_PLUS_MONTHLY: 'price_plus_monthly_placeholder',
  STRIPE_PRICE_PLUS_YEARLY: 'price_plus_yearly_placeholder',
  STRIPE_PRICE_PREMIUM_MONTHLY: 'price_premium_monthly_placeholder',
  STRIPE_PRICE_PREMIUM_YEARLY: 'price_premium_yearly_placeholder',
  STRIPE_PRICE_FAMILY_MONTHLY: 'price_family_monthly_placeholder',
  STRIPE_PRICE_FAMILY_YEARLY: 'price_family_yearly_placeholder',
  STRIPE_PRICE_PREMIUM_BANK_ADDON_MONTHLY: 'price_addon_placeholder',
};
const getEnv = (name: string) => prices[name];

Deno.test('Stripe catalog maps logical choices to server configuration', () => {
  const family = resolveCatalogChoice('family_yearly', getEnv);
  assertEquals(family.priceId, 'price_family_yearly_placeholder');
  assertEquals(family.tier, 'family');
  assertEquals(family.requiresHousehold, true);
  assertEquals(resolveCatalogPrice('price_premium_monthly_placeholder', getEnv)?.tier, 'premium');
});

Deno.test('Stripe catalog rejects caller-selected price or tier values', () => {
  assertEquals(isStripeCatalogChoice('price_plus_monthly_placeholder'), false);
  assertEquals(isStripeCatalogChoice('premium'), false);
  assertEquals(isStripeCatalogChoice({ tier: 'premium' }), false);
  assertThrows(() => resolveCatalogChoice('plus_monthly', () => undefined));
});
