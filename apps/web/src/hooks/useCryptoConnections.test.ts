// SPDX-License-Identifier: BUSL-1.1

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { IntakeValidationResult } from '../lib/crypto/manual-intake';

import { useCryptoConnections, type UseCryptoConnectionsOptions } from './useCryptoConnections';

const FIXED_NOW = '2025-06-01T00:00:00.000Z';

const baseOptions: UseCryptoConnectionsOptions = {
  storageNamespace: 'test.crypto',
  now: () => FIXED_NOW,
};

function setup(options: UseCryptoConnectionsOptions = baseOptions) {
  return renderHook(() => useCryptoConnections(options));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('useCryptoConnections', () => {
  it('hydrates to an empty, non-loading state', () => {
    const { result } = setup();
    expect(result.current.loading).toBe(false);
    expect(result.current.sources).toHaveLength(0);
    expect(result.current.dashboard.rows).toHaveLength(0);
  });

  it('connects a valid watch-only wallet and reports manual health', () => {
    const { result } = setup();
    let validation: IntakeValidationResult | undefined;
    act(() => {
      validation = result.current.addWallet({
        chain: 'ethereum',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        label: 'Ledger',
      });
    });
    expect(validation?.status).toBe('valid');
    expect(result.current.sources).toHaveLength(1);
    expect(result.current.sources[0].health).toBe('manual');
    expect(result.current.sources[0].hasReadOnlyKey).toBe(false);
    // Watch-only with a fresh sync time => overall health is "manual".
    expect(result.current.overallHealth).toBe('manual');
  });

  it('rejects an address that does not match the chain format', () => {
    const { result } = setup();
    let validation: IntakeValidationResult | undefined;
    act(() => {
      validation = result.current.addWallet({
        chain: 'ethereum',
        address: 'not-a-real-address',
        label: 'Bad',
      });
    });
    expect(validation?.status).toBe('invalid');
    expect(result.current.sources).toHaveLength(0);
  });

  it('flags a duplicate wallet via the engine fingerprint and does not add it', () => {
    const { result } = setup();
    const wallet = {
      chain: 'ethereum',
      address: '0x1234567890abcdef1234567890abcdef12345678',
      label: 'Primary',
    };
    act(() => {
      result.current.addWallet(wallet);
    });
    let second: IntakeValidationResult | undefined;
    act(() => {
      second = result.current.addWallet(wallet);
    });
    expect(second?.status).toBe('duplicate-risk');
    expect(result.current.sources).toHaveLength(1);
  });

  it('connects an exchange and never stores the read-only key value', () => {
    const { result } = setup();
    act(() => {
      result.current.addExchange({
        exchange: 'coinbase',
        label: 'Coinbase main',
        readOnlyApiKey: 'super-secret-value-1234567890',
      });
    });
    const source = result.current.sources[0];
    expect(source.exchange).toBe('coinbase');
    expect(source.hasReadOnlyKey).toBe(true);
    // The literal key must not be retained anywhere on the persisted record.
    expect(JSON.stringify(source)).not.toContain('super-secret-value');
    const persisted = window.localStorage.getItem('test.crypto.connections.v1') ?? '';
    expect(persisted).not.toContain('super-secret-value');
  });

  it('merges balances across sources without double-counting', () => {
    const { result } = setup();
    let walletId = '';
    let exchangeId = '';
    act(() => {
      result.current.addWallet({
        chain: 'ethereum',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        label: 'Wallet',
      });
    });
    act(() => {
      result.current.addExchange({ exchange: 'kraken', label: 'Kraken' });
    });
    walletId = result.current.sources[0].id;
    exchangeId = result.current.sources[1].id;

    act(() => {
      result.current.addHolding({
        sourceId: walletId,
        asset: 'ETH',
        quantity: 2,
        unitPriceCents: 200000,
      });
    });
    act(() => {
      result.current.addHolding({
        sourceId: exchangeId,
        asset: 'eth',
        quantity: 1,
        unitPriceCents: 200000,
      });
    });

    // Two sources, one merged ETH row.
    expect(result.current.dashboard.rows).toHaveLength(1);
    const row = result.current.dashboard.rows[0];
    expect(row.asset).toBe('ETH');
    expect(row.quantity).toBe(3);
    // 3 ETH * $2,000 = $6,000 in integer cents.
    expect(row.valueCents).toBe(600000);
    expect(result.current.dashboard.totalValueCents).toBe(600000);
    // Per-source breakdown shows each contributes once.
    expect(row.sourceBreakdown[walletId]).toBe(2);
    expect(row.sourceBreakdown[exchangeId]).toBe(1);
  });

  it('removing a source also removes its holdings', () => {
    const { result } = setup();
    act(() => {
      result.current.addExchange({ exchange: 'coinbase', label: 'CB' });
    });
    const id = result.current.sources[0].id;
    act(() => {
      result.current.addHolding({
        sourceId: id,
        asset: 'BTC',
        quantity: 0.5,
        unitPriceCents: 5000000,
      });
    });
    expect(result.current.dashboard.rows).toHaveLength(1);
    act(() => {
      result.current.removeSource(id);
    });
    expect(result.current.sources).toHaveLength(0);
    expect(result.current.dashboard.rows).toHaveLength(0);
  });

  it('computes DeFi totals separately from spot, splitting locked value', () => {
    const { result } = setup();
    act(() => {
      result.current.addDeFiPosition({
        id: 'lido-1',
        type: 'staking',
        chain: 'ethereum',
        protocol: 'Lido',
        label: 'stETH staking',
        principalValueCents: 1_000_000,
        currency: 'USD',
        lockStatus: 'locked',
        rewardTokens: [{ token: 'stETH', quantity: 0.1, valueCents: 30_000 }],
        valuationAsOf: FIXED_NOW,
      });
    });
    const totals = result.current.defiTotals;
    expect(totals.totalValueCents).toBe(1_030_000);
    expect(totals.rewardsValueCents).toBe(30_000);
    // Locked + rewards are excluded from "available".
    expect(totals.lockedValueCents).toBe(1_030_000);
    expect(totals.availableValueCents).toBe(0);
  });

  it('classifies a same-chain transfer between wallets as a non-taxable self-transfer', () => {
    const { result } = setup();
    act(() => {
      result.current.addWallet({
        chain: 'ethereum',
        address: '0x1111111111111111111111111111111111111111',
        label: 'Hot',
      });
    });
    act(() => {
      result.current.addWallet({
        chain: 'ethereum',
        address: '0x2222222222222222222222222222222222222222',
        label: 'Cold',
      });
    });
    const [from, to] = result.current.sources;
    const resolutions = result.current.reconcileTransfer({
      asset: 'ETH',
      quantity: 1.5,
      fromSourceId: from.id,
      toSourceId: to.id,
    });
    const selfTransfer = resolutions.find((item) => item.classification === 'self-transfer');
    expect(selfTransfer).toBeDefined();
    expect(selfTransfer?.taxable).toBe(false);
  });

  it('refresh re-captures the sync timestamp', () => {
    let current = '2025-06-01T00:00:00.000Z';
    const { result } = setup({ storageNamespace: 'test.crypto.refresh', now: () => current });
    act(() => {
      result.current.addWallet({
        chain: 'bitcoin',
        address: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        label: 'BTC',
      });
    });
    const before = result.current.sources[0].lastSyncAt;
    current = '2025-06-02T00:00:00.000Z';
    act(() => {
      result.current.refresh();
    });
    expect(result.current.sources[0].lastSyncAt).toBe('2025-06-02T00:00:00.000Z');
    expect(result.current.sources[0].lastSyncAt).not.toBe(before);
    expect(result.current.lastSyncAt).toBe('2025-06-02T00:00:00.000Z');
  });

  it('persists connections across hook remounts', () => {
    const options = { storageNamespace: 'test.crypto.persist', now: () => FIXED_NOW };
    const first = setup(options);
    act(() => {
      first.result.current.addExchange({ exchange: 'coinbase', label: 'CB' });
    });
    first.unmount();

    const second = setup(options);
    expect(second.result.current.sources).toHaveLength(1);
    expect(second.result.current.sources[0].label).toBe('CB');
  });
});
