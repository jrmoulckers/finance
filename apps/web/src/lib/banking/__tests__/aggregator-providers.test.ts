// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it, vi } from 'vitest';

import {
  createAggregatorProviders,
  FinicityProvider,
  MxProvider,
  PlaidProvider,
  TrueLayerProvider,
} from '../aggregator-providers';
import type { EdgeTransport } from '../base-aggregator-provider';

/** Build a fake transport capturing the composed request URL + headers. */
function fakeTransport(response: unknown): {
  transport: EdgeTransport;
  fetch: ReturnType<typeof vi.fn>;
} {
  const fetch = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
  const transport: EdgeTransport = {
    baseUrl: 'https://proj.supabase.co/functions/v1',
    fetch: fetch as unknown as EdgeTransport['fetch'],
    getAuthToken: async () => 'jwt-token',
  };
  return { transport, fetch };
}

describe('concrete aggregator providers', () => {
  const { transport } = fakeTransport({});

  it('PlaidProvider mirrors the seeded directory identity', () => {
    const plaid = new PlaidProvider(transport);
    expect(plaid.id).toBe('plaid');
    expect(plaid.name).toBe('Plaid');
    expect(plaid.supportedCountries).toEqual(['US', 'CA', 'GB', 'IE', 'FR', 'ES', 'NL']);
    expect(plaid.features.internationalBanks).toBe(true);
    expect(plaid.features.investmentAccounts).toBe(true);
  });

  it('MxProvider is a US/CA aggregator', () => {
    const mx = new MxProvider(transport);
    expect(mx.id).toBe('mx');
    expect(mx.supportedCountries).toEqual(['US', 'CA']);
    expect(mx.features.internationalBanks).toBe(false);
  });

  it('TrueLayerProvider is European open-banking (no investments/loans)', () => {
    const tl = new TrueLayerProvider(transport);
    expect(tl.id).toBe('truelayer');
    expect(tl.supportedCountries).toContain('GB');
    expect(tl.features.investmentAccounts).toBe(false);
    expect(tl.features.loans).toBe(false);
    expect(tl.features.internationalBanks).toBe(true);
  });

  it('FinicityProvider is a US/CA aggregator', () => {
    const fin = new FinicityProvider(transport);
    expect(fin.id).toBe('finicity');
    expect(fin.supportedCountries).toEqual(['US', 'CA']);
  });
});

describe('createAggregatorProviders', () => {
  it('returns all four providers in directory-priority order', () => {
    const { transport } = fakeTransport({});
    const providers = createAggregatorProviders(transport);
    expect(providers.map((p) => p.id)).toEqual(['plaid', 'mx', 'truelayer', 'finicity']);
  });

  it('drives edge requests through the injected transport with auth headers', async () => {
    const { transport, fetch } = fakeTransport({
      link_token: 'link-sandbox-123',
      expiration: new Date(Date.now() + 60_000).toISOString(),
    });
    const plaid = new PlaidProvider(transport);

    const session = await plaid.initializeConnection({
      countryCode: 'US',
      metadata: { household_id: 'hh-1' },
    });

    expect(session.sessionId).toBe('link-sandbox-123');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://proj.supabase.co/functions/v1/bank-connection?action=create_link_token',
    );
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-token');
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toMatchObject({ provider: 'plaid' });
  });
});
