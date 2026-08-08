// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BaseAggregatorProvider,
  BankingProviderError,
  type AggregatorProviderConfig,
  type EdgeTransport,
  type SyncedBankDataSource,
} from '../base-aggregator-provider';
import type { ProviderFeatures } from '../types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const FEATURES: ProviderFeatures = {
  realTimeBalance: true,
  transactionWebhooks: true,
  investmentAccounts: true,
  creditCards: true,
  loans: true,
  bnpl: false,
  crypto: false,
  internationalBanks: true,
};

/** A recorded fetch call for assertions. */
interface RecordedCall {
  url: string;
  init?: RequestInit;
}

/**
 * Build a mock {@link EdgeTransport} whose `fetch` returns a queued sequence of
 * responses (or throws a queued error). Records every call for assertions.
 */
function makeTransport(responses: Array<Response | Error>): {
  transport: EdgeTransport;
  calls: RecordedCall[];
  getAuthToken: ReturnType<typeof vi.fn>;
} {
  const calls: RecordedCall[] = [];
  const queue = [...responses];
  const getAuthToken = vi.fn(async () => 'test-token-not-real');

  const transport: EdgeTransport = {
    baseUrl: 'https://edge.example.test/functions/v1/',
    getAuthToken,
    fetch: vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const next = queue.shift();
      if (next === undefined) throw new Error('unexpected extra fetch call');
      if (next instanceof Error) throw next;
      return next;
    }),
  };

  return { transport, calls, getAuthToken };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeProvider(
  responses: Array<Response | Error> = [],
  overrides: Partial<AggregatorProviderConfig> = {},
): {
  provider: BaseAggregatorProvider;
  calls: RecordedCall[];
  getAuthToken: ReturnType<typeof vi.fn>;
} {
  const { transport, calls, getAuthToken } = makeTransport(responses);
  const provider = new BaseAggregatorProvider({
    id: 'plaid',
    name: 'Plaid',
    supportedCountries: ['US', 'CA', 'GB'],
    features: FEATURES,
    transport,
    resolveHouseholdId: async () => 'household-123',
    ...overrides,
  });
  return { provider, calls, getAuthToken };
}

/** Convenience to construct a provider with a scripted response queue. */
function withResponses(
  responses: Array<Response | Error>,
  overrides: Partial<AggregatorProviderConfig> = {},
) {
  return makeProvider(responses, overrides);
}

// ---------------------------------------------------------------------------
// Identity & config
// ---------------------------------------------------------------------------

describe('BaseAggregatorProvider — identity', () => {
  it('exposes config-driven identity and features', () => {
    const { provider } = makeProvider();
    expect(provider.id).toBe('plaid');
    expect(provider.name).toBe('Plaid');
    expect(provider.supportedCountries).toEqual(['US', 'CA', 'GB']);
    expect(provider.features.creditCards).toBe(true);
    expect(provider.features.bnpl).toBe(false);
  });

  it('supports thin subclassing', () => {
    class MxProvider extends BaseAggregatorProvider {
      constructor(transport: EdgeTransport) {
        super({
          id: 'mx',
          name: 'MX',
          supportedCountries: ['US'],
          features: FEATURES,
          transport,
        });
      }
    }
    const { transport } = makeTransport([]);
    const mx = new MxProvider(transport);
    expect(mx).toBeInstanceOf(BaseAggregatorProvider);
    expect(mx.id).toBe('mx');
  });
});

// ---------------------------------------------------------------------------
// initializeConnection
// ---------------------------------------------------------------------------

describe('BaseAggregatorProvider — initializeConnection', () => {
  it('maps a link-token response to a ConnectionSession', async () => {
    const expiration = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { provider, calls, getAuthToken } = withResponses([
      json({ link_token: 'link-plaid-abc', expiration }),
    ]);

    const session = await provider.initializeConnection({ metadata: { household_id: 'h-9' } });

    expect(session.sessionId).toBe('link-plaid-abc');
    expect(session.expiresInSeconds).toBeGreaterThan(0);
    expect(session.metadata?.linkToken).toBe('link-plaid-abc');

    // Correct endpoint, method, auth header and provider/household body.
    expect(getAuthToken).toHaveBeenCalledOnce();
    expect(calls[0].url).toBe(
      'https://edge.example.test/functions/v1/bank-connection?action=create_link_token',
    );
    expect(calls[0].init?.method).toBe('POST');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token-not-real');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      provider: 'plaid',
      household_id: 'h-9',
    });
  });

  it('resolves household id from the configured resolver when absent in metadata', async () => {
    const { provider, calls } = withResponses([
      json({ link_token: 'lt', expiration: new Date().toISOString() }),
    ]);
    await provider.initializeConnection({});
    expect(JSON.parse(String(calls[0].init?.body)).household_id).toBe('household-123');
  });

  it('throws a categorized error when the household id cannot be resolved', async () => {
    const { provider } = withResponses([], { resolveHouseholdId: undefined });
    await expect(provider.initializeConnection({})).rejects.toBeInstanceOf(BankingProviderError);
  });

  it('categorizes a 401 as AUTHENTICATION_EXPIRED', async () => {
    const { provider } = withResponses([json({ error: 'bad token' }, 401)]);
    try {
      await provider.initializeConnection({ metadata: { household_id: 'h' } });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BankingProviderError);
      expect((err as BankingProviderError).code).toBe('AUTHENTICATION_EXPIRED');
      expect((err as BankingProviderError).retryable).toBe(false);
    }
  });

  it('categorizes a 429 as retryable RATE_LIMITED', async () => {
    const { provider } = withResponses([json({ error: 'slow down' }, 429)]);
    try {
      await provider.initializeConnection({ metadata: { household_id: 'h' } });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BankingProviderError);
      expect((err as BankingProviderError).code).toBe('RATE_LIMITED');
      expect((err as BankingProviderError).retryable).toBe(true);
    }
  });

  it('categorizes a 500 as retryable PROVIDER_DOWN', async () => {
    const { provider } = withResponses([json({ error: 'boom' }, 500)]);
    try {
      await provider.initializeConnection({ metadata: { household_id: 'h' } });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as BankingProviderError).code).toBe('PROVIDER_DOWN');
      expect((err as BankingProviderError).retryable).toBe(true);
    }
  });

  it('categorizes a thrown transport/network error', async () => {
    const { provider } = withResponses([new Error('network timeout')]);
    try {
      await provider.initializeConnection({ metadata: { household_id: 'h' } });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BankingProviderError);
      expect((err as BankingProviderError).code).toBe('PROVIDER_DOWN');
    }
  });

  it('throws UNKNOWN when the link response is malformed', async () => {
    const { provider } = withResponses([json({ nope: true })]);
    try {
      await provider.initializeConnection({ metadata: { household_id: 'h' } });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as BankingProviderError).code).toBe('UNKNOWN');
    }
  });
});

// ---------------------------------------------------------------------------
// completeConnection
// ---------------------------------------------------------------------------

describe('BaseAggregatorProvider — completeConnection', () => {
  const goodMeta = {
    household_id: 'h-1',
    public_token: 'public-abc',
    institution_id: 'ins_1',
    institution_name: 'Test Bank',
  };

  it('exchanges the token and maps to a BankConnection', async () => {
    const created = '2026-01-01T00:00:00.000Z';
    const { provider, calls } = withResponses([
      json(
        {
          id: 'conn-1',
          provider: 'plaid',
          institution_name: 'Test Bank',
          status: 'active',
          created_at: created,
        },
        201,
      ),
    ]);

    const conn = await provider.completeConnection('session-x', goodMeta);

    expect(conn).toMatchObject({
      id: 'conn-1',
      providerId: 'plaid',
      providerConnectionId: 'conn-1',
      institutionName: 'Test Bank',
      status: 'active',
      createdAt: created,
    });

    expect(calls[0].url).toBe(
      'https://edge.example.test/functions/v1/bank-connection?action=exchange_token',
    );
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      provider: 'plaid',
      household_id: 'h-1',
      public_token: 'public-abc',
      institution_id: 'ins_1',
      institution_name: 'Test Bank',
    });
  });

  it('throws UNKNOWN when institution metadata is missing', async () => {
    const { provider } = withResponses([]);
    try {
      await provider.completeConnection('s', { household_id: 'h', public_token: 'p' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BankingProviderError);
      expect((err as BankingProviderError).code).toBe('UNKNOWN');
    }
  });

  it('categorizes a 403 exchange failure as INVALID_CREDENTIALS', async () => {
    const { provider } = withResponses([json({ error: 'forbidden' }, 403)]);
    try {
      await provider.completeConnection('s', goodMeta);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as BankingProviderError).code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('throws UNKNOWN when the exchange response has no id', async () => {
    const { provider } = withResponses([json({ status: 'active' }, 201)]);
    try {
      await provider.completeConnection('s', goodMeta);
      throw new Error('expected throw');
    } catch (err) {
      expect((err as BankingProviderError).code).toBe('UNKNOWN');
    }
  });
});

// ---------------------------------------------------------------------------
// refreshConnection
// ---------------------------------------------------------------------------

describe('BaseAggregatorProvider — refreshConnection', () => {
  it('maps a healthy check_health response to success', async () => {
    const { provider, calls } = withResponses([
      json({ health_status: 'healthy', new_transactions: 7 }),
    ]);
    const result = await provider.refreshConnection('conn-1');
    expect(result).toEqual({ connectionId: 'conn-1', success: true, newTransactions: 7 });
    expect(calls[0].url).toBe(
      'https://edge.example.test/functions/v1/aggregator-health?action=check_health',
    );
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      connection_id: 'conn-1',
      provider: 'plaid',
    });
  });

  it('reports failure when the health status is an error state', async () => {
    const { provider } = withResponses([json({ health_status: 'unknown_error' })]);
    const result = await provider.refreshConnection('conn-1');
    expect(result.success).toBe(false);
  });

  it('omits a malformed new transaction count', async () => {
    const { provider } = withResponses([
      json({ health_status: 'healthy', new_transactions: 'not-a-number' }),
    ]);
    const result = await provider.refreshConnection('conn-1');
    expect(result.newTransactions).toBeUndefined();
  });

  it('throws a categorized error on a non-2xx response', async () => {
    const { provider } = withResponses([json({ error: 'nope' }, 500)]);
    try {
      await provider.refreshConnection('conn-1');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as BankingProviderError).code).toBe('PROVIDER_DOWN');
    }
  });
});

// ---------------------------------------------------------------------------
// removeConnection
// ---------------------------------------------------------------------------

describe('BaseAggregatorProvider — removeConnection', () => {
  it('issues a DELETE with the connection id and tolerates an empty 204 body', async () => {
    const { provider, calls } = withResponses([new Response(null, { status: 204 })]);
    await expect(provider.removeConnection('conn-9')).resolves.toBeUndefined();
    expect(calls[0].url).toBe('https://edge.example.test/functions/v1/bank-connection?id=conn-9');
    expect(calls[0].init?.method).toBe('DELETE');
  });

  it('categorizes a 404 removal failure', async () => {
    const { provider } = withResponses([json({ error: 'not found' }, 404)]);
    try {
      await provider.removeConnection('conn-9');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BankingProviderError);
      expect((err as BankingProviderError).code).toBe('UNKNOWN');
    }
  });
});

// ---------------------------------------------------------------------------
// getConnectionStatus
// ---------------------------------------------------------------------------

describe('BaseAggregatorProvider — getConnectionStatus', () => {
  it('maps a matching health record to ConnectionStatus', async () => {
    const { provider, calls } = withResponses([
      json({
        connections: [
          {
            id: 'conn-1',
            connection_status: 'active',
            health_status: 'healthy',
            last_synced_at: '2026-01-02T00:00:00.000Z',
          },
        ],
      }),
    ]);

    const status = await provider.getConnectionStatus('conn-1');
    expect(status.status).toBe('active');
    expect(status.lastSuccessfulSync).toBe('2026-01-02T00:00:00.000Z');
    expect(calls[0].url).toBe(
      'https://edge.example.test/functions/v1/aggregator-health?action=health&household_id=household-123',
    );
    expect(calls[0].init?.method).toBe('GET');
  });

  it('maps an auth-expired health record to an error status with a code', async () => {
    const { provider } = withResponses([
      json({ connections: [{ id: 'conn-1', health_status: 'auth_expired' }] }),
    ]);
    const status = await provider.getConnectionStatus('conn-1');
    expect(status.status).toBe('error');
    expect(status.errorCode).toBe('AUTHENTICATION_EXPIRED');
  });

  it('throws UNKNOWN when the connection is not in the health list', async () => {
    const { provider } = withResponses([json({ connections: [] })]);
    try {
      await provider.getConnectionStatus('conn-missing');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as BankingProviderError).code).toBe('UNKNOWN');
    }
  });

  it('categorizes a 403 health failure', async () => {
    const { provider } = withResponses([json({ error: 'denied' }, 403)]);
    try {
      await provider.getConnectionStatus('conn-1');
      throw new Error('expected throw');
    } catch (err) {
      expect((err as BankingProviderError).code).toBe('INVALID_CREDENTIALS');
    }
  });
});

// ---------------------------------------------------------------------------
// getProviderHealth
// ---------------------------------------------------------------------------

describe('BaseAggregatorProvider — getProviderHealth', () => {
  it('maps the matching provider directory entry to ProviderHealth', async () => {
    const { provider } = withResponses([
      json({
        providers: [
          {
            name: 'plaid',
            display_name: 'Plaid',
            status: 'healthy',
            health_score: 98,
            is_enabled: true,
            last_health_check: '2026-01-03T00:00:00.000Z',
          },
          { name: 'mx', status: 'down', is_enabled: true },
        ],
      }),
    ]);

    const health = await provider.getProviderHealth();
    expect(health.isHealthy).toBe(true);
    expect(health.message).toBe('Plaid');
    expect(health.checkedAt).toBe('2026-01-03T00:00:00.000Z');
  });

  it('reports unhealthy when the provider is disabled', async () => {
    const { provider } = withResponses([
      json({ providers: [{ name: 'plaid', status: 'healthy', is_enabled: false }] }),
    ]);
    const health = await provider.getProviderHealth();
    expect(health.isHealthy).toBe(false);
  });

  it('reports unhealthy when the provider is not listed', async () => {
    const { provider } = withResponses([json({ providers: [] })]);
    const health = await provider.getProviderHealth();
    expect(health.isHealthy).toBe(false);
    expect(health.message).toContain('not listed');
  });

  it('categorizes a 500 provider-health failure', async () => {
    const { provider } = withResponses([json({ error: 'boom' }, 500)]);
    try {
      await provider.getProviderHealth();
      throw new Error('expected throw');
    } catch (err) {
      expect((err as BankingProviderError).code).toBe('PROVIDER_DOWN');
    }
  });
});

// ---------------------------------------------------------------------------
// Data-read seam
// ---------------------------------------------------------------------------

describe('BaseAggregatorProvider — data reads', () => {
  const range = { from: '2026-01-01', to: '2026-01-31' };

  it('throws a categorized error for reads when no data-source is injected', async () => {
    const { provider } = makeProvider();

    for (const call of [
      () => provider.getAccounts('conn-1'),
      () => provider.getTransactions('conn-1', range),
      () => provider.getBalances('conn-1'),
    ]) {
      try {
        await call();
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(BankingProviderError);
        expect((err as BankingProviderError).code).toBe('UNKNOWN');
        expect((err as BankingProviderError).message).toMatch(/synced local repositories/i);
      }
    }
  });

  it('delegates reads to the injected synced data-source without any fetch', async () => {
    const dataSource: SyncedBankDataSource = {
      getAccounts: vi.fn(async () => [
        {
          id: 'a1',
          providerAccountId: 'pa1',
          name: 'Checking',
          type: 'checking' as const,
          currency: 'USD',
          institution: 'Test Bank',
        },
      ]),
      getTransactions: vi.fn(async () => []),
      getBalances: vi.fn(async () => [
        { accountId: 'a1', currentCents: 12345, currency: 'USD', asOf: '2026-01-01T00:00:00Z' },
      ]),
    };

    const { transport, calls } = makeTransport([]);
    const provider = new BaseAggregatorProvider({
      id: 'plaid',
      name: 'Plaid',
      supportedCountries: ['US'],
      features: FEATURES,
      transport,
      dataSource,
    });

    const accounts = await provider.getAccounts('conn-1');
    const txs = await provider.getTransactions('conn-1', range);
    const balances = await provider.getBalances('conn-1');

    expect(accounts).toHaveLength(1);
    expect(txs).toEqual([]);
    expect(balances[0].currentCents).toBe(12345);

    expect(dataSource.getTransactions).toHaveBeenCalledWith('conn-1', range);
    // No edge/network calls were made for reads.
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// BankingProviderError re-categorization compatibility
// ---------------------------------------------------------------------------

describe('BankingProviderError', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is a real Error whose message survives for upstream re-categorization', async () => {
    const { provider } = withResponses([json({ error: 'token has expired' }, 401)]);
    try {
      await provider.initializeConnection({ metadata: { household_id: 'h' } });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(BankingProviderError);
      expect((err as Error).message.toLowerCase()).toContain('authentication');
    }
  });
});
