// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { ManualCryptoConnectionProvider } from '../../crypto/connector-abstraction';
import { CryptoBankProvider } from '../crypto-provider';

function buildSource(): ManualCryptoConnectionProvider {
  return new ManualCryptoConnectionProvider({
    accounts: [
      {
        id: 'acct-wallet',
        providerId: 'ethereum',
        kind: 'wallet',
        label: 'Cold Wallet',
        chain: 'ethereum',
        address: '0x00000000000000000000000000000000deadbeef',
        health: 'manual',
      },
      {
        id: 'acct-exchange',
        providerId: 'coinbase',
        kind: 'exchange',
        label: 'Coinbase',
        exchange: 'coinbase',
        health: 'manual',
      },
    ],
    balances: [
      {
        accountId: 'acct-wallet',
        asset: 'ETH',
        quantity: 2,
        valueCents: 500_000,
        currency: 'USD',
        asOf: '2024-06-01T00:00:00Z',
      },
      {
        accountId: 'acct-exchange',
        asset: 'BTC',
        quantity: 0.5,
        valueCents: 3_000_000,
        currency: 'USD',
        asOf: '2024-06-02T00:00:00Z',
      },
    ],
    transactions: [
      {
        id: 'tx-1',
        accountId: 'acct-wallet',
        occurredAt: '2024-06-01T12:00:00Z',
        asset: 'ETH',
        quantity: 1,
      },
      {
        id: 'tx-2',
        accountId: 'acct-exchange',
        occurredAt: '2024-01-01T12:00:00Z',
        asset: 'BTC',
        quantity: 0.25,
      },
    ],
  });
}

describe('CryptoBankProvider', () => {
  it('advertises crypto capability and is borderless', () => {
    const provider = new CryptoBankProvider(buildSource());
    expect(provider.id).toBe('crypto');
    expect(provider.features.crypto).toBe(true);
    expect(provider.supportedCountries).toHaveLength(0);
  });

  it('completes a watch-only connection and reports it active', async () => {
    const provider = new CryptoBankProvider(buildSource());
    const session = await provider.initializeConnection({});
    const connection = await provider.completeConnection(session.sessionId);
    expect(connection.providerId).toBe('crypto');
    expect(connection.status).toBe('active');
    const status = await provider.getConnectionStatus(connection.id);
    expect(status.status).toBe('active');
  });

  it('maps wallets and exchanges to crypto bank accounts', async () => {
    const provider = new CryptoBankProvider(buildSource());
    const connection = await provider.completeConnection(
      (await provider.initializeConnection({})).sessionId,
    );
    const accounts = await provider.getAccounts(connection.id);
    expect(accounts).toHaveLength(2);
    expect(accounts.every((a) => a.type === 'crypto')).toBe(true);
    const wallet = accounts.find((a) => a.id === 'acct-wallet');
    expect(wallet?.institution).toBe('ethereum');
    expect(wallet?.mask).toBe('beef');
    const exchange = accounts.find((a) => a.id === 'acct-exchange');
    expect(exchange?.institution).toBe('coinbase');
  });

  it('sums fiat balances in integer cents', async () => {
    const provider = new CryptoBankProvider(buildSource());
    const connection = await provider.completeConnection(
      (await provider.initializeConnection({})).sessionId,
    );
    const balances = await provider.getBalances(connection.id);
    const wallet = balances.find((b) => b.accountId === 'acct-wallet');
    expect(wallet?.currentCents).toBe(500_000);
    expect(wallet?.asOf).toBe('2024-06-01T00:00:00Z');
  });

  it('filters transactions by date range and carries asset/quantity', async () => {
    const provider = new CryptoBankProvider(buildSource());
    const connection = await provider.completeConnection(
      (await provider.initializeConnection({})).sessionId,
    );
    const txs = await provider.getTransactions(connection.id, {
      from: '2024-05-01',
      to: '2024-07-01',
    });
    expect(txs).toHaveLength(1);
    expect(txs[0].providerTransactionId).toBe('tx-1');
    expect(txs[0].description).toBe('1 ETH');
    expect(txs[0].amountCents).toBe(0);
  });

  it('defaults to an empty manual source when none supplied', async () => {
    const provider = new CryptoBankProvider();
    const connection = await provider.completeConnection(
      (await provider.initializeConnection({})).sessionId,
    );
    expect(await provider.getAccounts(connection.id)).toHaveLength(0);
    const health = await provider.getProviderHealth();
    expect(health.isHealthy).toBe(true);
  });
});
