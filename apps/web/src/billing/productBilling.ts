// SPDX-License-Identifier: BUSL-1.1

import { getAccessToken } from '../auth/token-storage';

export type ProductBillingCatalogChoice =
  | 'plus_monthly'
  | 'plus_yearly'
  | 'premium_monthly'
  | 'premium_yearly'
  | 'family_monthly'
  | 'family_yearly'
  | 'premium_bank_addon_monthly';

export interface ProductEntitlementProjection {
  userTier: 'free' | 'plus' | 'premium';
  householdTier: 'free' | 'premium' | 'family' | null;
  bankConnectionAllowance: number;
  isPremiumSponsor: boolean;
  isFamilyBound: boolean;
  effectiveAt: string;
  expiresAt: string | null;
  projectionVersion: number;
  serverTime: string;
}

export type ProductBillingState =
  | { status: 'idle'; projection: ProductEntitlementProjection | null }
  | { status: 'pending'; projection: ProductEntitlementProjection | null }
  | { status: 'confirmed'; projection: ProductEntitlementProjection }
  | { status: 'error'; projection: ProductEntitlementProjection | null; message: string };

interface ProductBillingTransport {
  baseUrl: string;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  getAuthToken: () => Promise<string>;
}

export interface ProductBillingClient {
  startCheckout(
    catalogChoice: ProductBillingCatalogChoice,
    householdIntent?: string,
  ): Promise<{ checkoutUrl: string; state: ProductBillingState }>;
  openPortal(): Promise<string>;
  reconcile(): Promise<ProductBillingState>;
  loadProjection(householdId?: string): Promise<ProductBillingState>;
}

export function createProductBillingClient(
  overrides: Partial<ProductBillingTransport> = {},
): ProductBillingClient {
  const transport: ProductBillingTransport = {
    baseUrl: overrides.baseUrl ?? resolveFunctionsBaseUrl(),
    fetch: overrides.fetch ?? ((input, init) => fetch(input, init)),
    getAuthToken:
      overrides.getAuthToken ??
      (async () => {
        const token = await getAccessToken();
        return token ?? '';
      }),
  };

  return {
    async startCheckout(catalogChoice, householdIntent) {
      const body = {
        catalog_choice: catalogChoice,
        ...(householdIntent ? { household_intent: householdIntent } : {}),
      };
      const response = await requestJson(transport, 'stripe-checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const checkoutUrl = stringField(response, 'checkout_url');
      if (!checkoutUrl) throw new Error('Checkout is temporarily unavailable.');
      return {
        checkoutUrl,
        state: { status: 'pending', projection: null },
      };
    },

    async openPortal() {
      const response = await requestJson(transport, 'stripe-portal', { method: 'POST' });
      const portalUrl = stringField(response, 'portal_url');
      if (!portalUrl) throw new Error('Billing management is temporarily unavailable.');
      return portalUrl;
    },

    async reconcile() {
      await requestJson(transport, 'stripe-reconcile', { method: 'POST' });
      return { status: 'pending', projection: null };
    },

    async loadProjection(householdId) {
      const query = householdId ? `?household_id=${encodeURIComponent(householdId)}` : '';
      const response = await requestJson(transport, `stripe-status${query}`, { method: 'GET' });
      const projection = mapProjection(response);
      return projection.userTier !== 'free' ||
        (projection.householdTier !== null && projection.householdTier !== 'free')
        ? { status: 'confirmed', projection }
        : { status: 'idle', projection };
    },
  };
}

export function stateFromCheckoutReturn(
  search: string,
  projection: ProductEntitlementProjection | null,
): ProductBillingState {
  const params = new URLSearchParams(search);
  if (params.get('billing') !== 'pending') {
    return projection ? projectionState(projection) : { status: 'idle', projection: null };
  }
  return projection && projectionState(projection).status === 'confirmed'
    ? { status: 'confirmed', projection }
    : { status: 'pending', projection };
}

function projectionState(projection: ProductEntitlementProjection): ProductBillingState {
  return projection.userTier !== 'free' ||
    (projection.householdTier !== null && projection.householdTier !== 'free')
    ? { status: 'confirmed', projection }
    : { status: 'idle', projection };
}

function resolveFunctionsBaseUrl(): string {
  const explicit = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  return supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/functions/v1` : '';
}

async function requestJson(
  transport: ProductBillingTransport,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  if (!transport.baseUrl) throw new Error('Billing is not configured.');
  const token = await transport.getAuthToken();
  if (!token) throw new Error('Sign in to manage billing.');
  let response: Response;
  try {
    response = await transport.fetch(`${transport.baseUrl}/${path}`, {
      ...init,
      headers: {
        Authorization: ['Bearer', token].join(' '),
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error('Billing service is temporarily unavailable.');
  }
  if (!response.ok) throw new Error('Billing request could not be completed.');
  try {
    return await response.json();
  } catch {
    throw new Error('Billing service returned an invalid response.');
  }
}

function mapProjection(value: unknown): ProductEntitlementProjection {
  const projection = asRecord(asRecord(value).projection);
  const userTier = projection.user_display_tier;
  const householdTier = projection.household_display_tier;
  if (userTier !== 'free' && userTier !== 'plus' && userTier !== 'premium') {
    throw new Error('Entitlement status is temporarily unavailable.');
  }
  if (
    householdTier !== null &&
    householdTier !== 'free' &&
    householdTier !== 'premium' &&
    householdTier !== 'family'
  ) {
    throw new Error('Entitlement status is temporarily unavailable.');
  }
  if (
    typeof projection.bank_connection_allowance !== 'number' ||
    typeof projection.is_premium_sponsor !== 'boolean' ||
    typeof projection.is_family_bound !== 'boolean' ||
    typeof projection.effective_at !== 'string' ||
    (projection.expires_at !== null && typeof projection.expires_at !== 'string') ||
    typeof projection.projection_version !== 'number' ||
    typeof projection.server_time !== 'string'
  ) {
    throw new Error('Entitlement status is temporarily unavailable.');
  }
  return {
    userTier,
    householdTier,
    bankConnectionAllowance: projection.bank_connection_allowance,
    isPremiumSponsor: projection.is_premium_sponsor,
    isFamilyBound: projection.is_family_bound,
    effectiveAt: projection.effective_at,
    expiresAt: projection.expires_at,
    projectionVersion: projection.projection_version,
    serverTime: projection.server_time,
  };
}

function stringField(value: unknown, key: string): string | null {
  const field = asRecord(value)[key];
  return typeof field === 'string' && field.length > 0 ? field : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
