// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { ManualCryptoConnectionProvider, summarizeConnectionHealth } from './connector-abstraction';

describe('crypto connector abstraction', () => {
  it('serves deterministic manual balances and transactions', async () => {
    const provider = new ManualCryptoConnectionProvider({
      accounts: [{ id: 'wallet', providerId: 'manual-crypto', kind: 'wallet', label: 'Cold wallet', chain: 'ethereum', address: '0xabc', health: 'manual' }],
      balances: [{ accountId: 'wallet', asset: 'ETH', quantity: 2, valueCents: 500000, currency: 'USD', asOf: '2026-01-01T00:00:00.000Z' }],
      transactions: [{ id: 'tx', accountId: 'wallet', occurredAt: '2026-01-01T00:00:00.000Z', asset: 'ETH', quantity: 2 }],
    });

    await expect(provider.listAccounts()).resolves.toHaveLength(1);
    await expect(provider.getBalances('wallet')).resolves.toEqual([expect.objectContaining({ asset: 'ETH' })]);
    await expect(provider.getTransactions('wallet')).resolves.toEqual([expect.objectContaining({ id: 'tx' })]);
  });

  it('summarizes health and stale sync timestamps', () => {
    expect(summarizeConnectionHealth([], 1000, '2026-01-01T00:00:00.000Z')).toBe('needs-attention');
    expect(summarizeConnectionHealth([{ id: 'a', providerId: 'p', kind: 'exchange', label: 'A', health: 'healthy', lastSyncAt: '2025-12-31T00:00:00.000Z' }], 1000, '2026-01-01T00:00:00.000Z')).toBe('stale');
  });
});
