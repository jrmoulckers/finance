// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';
import {
  createProductBillingClient,
  stateFromCheckoutReturn,
  type ProductEntitlementProjection,
} from './productBilling';

const freeProjection: ProductEntitlementProjection = {
  userTier: 'free',
  householdTier: null,
  bankConnectionAllowance: 0,
  isPremiumSponsor: false,
  isFamilyBound: false,
  effectiveAt: '2033-05-18T03:33:20.000Z',
  expiresAt: null,
  projectionVersion: 1,
  serverTime: '2033-05-18T03:33:21.000Z',
};

describe('product billing', () => {
  it('sends only the logical choice and eligible household intent', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        catalog_choice: 'family_monthly',
        household_intent: '10000000-0000-4000-8000-000000000001',
      });
      return Response.json({
        state: 'pending',
        checkout_url: 'https://checkout.example.test/placeholder',
      });
    });
    const client = createProductBillingClient({
      baseUrl: 'https://api.example.test/functions/v1',
      fetch: fetchMock,
      getAuthToken: async () => 'token-placeholder',
    });
    const result = await client.startCheckout(
      'family_monthly',
      '10000000-0000-4000-8000-000000000001',
    );
    expect(result.state.status).toBe('pending');
  });

  it('never grants from the success URL or a session identifier', () => {
    expect(
      stateFromCheckoutReturn('?billing=pending&session_id=cs_attacker', freeProjection).status,
    ).toBe('pending');
    expect(stateFromCheckoutReturn('?session_id=cs_attacker', null).status).toBe('idle');
  });

  it('moves pending to confirmed only when Finance projection confirms access', () => {
    const paidProjection: ProductEntitlementProjection = {
      ...freeProjection,
      userTier: 'premium',
      expiresAt: '2033-06-18T03:33:20.000Z',
      projectionVersion: 2,
    };
    expect(stateFromCheckoutReturn('?billing=pending', freeProjection).status).toBe('pending');
    expect(stateFromCheckoutReturn('?billing=pending', paidProjection).status).toBe('confirmed');
  });

  it('does not expose provider identifiers in projection state', async () => {
    const client = createProductBillingClient({
      baseUrl: 'https://api.example.test/functions/v1',
      getAuthToken: async () => 'token-placeholder',
      fetch: async () =>
        Response.json({
          projection: {
            user_display_tier: 'premium',
            household_display_tier: null,
            bank_connection_allowance: 0,
            is_premium_sponsor: false,
            is_family_bound: false,
            effective_at: freeProjection.effectiveAt,
            expires_at: '2033-06-18T03:33:20.000Z',
            projection_version: 2,
            server_time: freeProjection.serverTime,
          },
        }),
    });
    const state = await client.loadProjection();
    expect(JSON.stringify(state)).not.toMatch(/customer|session|subscription|payment/i);
  });
});
