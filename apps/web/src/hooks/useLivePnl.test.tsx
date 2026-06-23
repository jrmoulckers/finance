// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for useLivePnl.
 *
 * Mocks the data hooks (useInvestments / useAccounts) per project conventions
 * and injects a ManualPriceSource so live updates are deterministic.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildBaseAccountBalances,
  buildLivePositions,
  buildQuoteRequests,
  buildSimulatedSeeds,
  useLivePnl,
} from './useLivePnl';
import { ManualPriceSource } from '../lib/investment';
import type { QuoteSnapshot } from '../lib/investment';
import type { Account, Investment } from '../kmp/bridge';

vi.mock('./useInvestments', () => ({ useInvestments: vi.fn() }));
vi.mock('./useAccounts', () => ({ useAccounts: vi.fn() }));

import { useInvestments } from './useInvestments';
import { useAccounts } from './useAccounts';

const meta = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

const USD = { code: 'USD', decimalPlaces: 2 };

function makeInvestment(
  partial: Partial<Investment> & Pick<Investment, 'symbol' | 'shares'>,
): Investment {
  return {
    id: `inv-${partial.symbol}`,
    householdId: 'hh-1',
    accountId: 'acct-a',
    name: partial.symbol ?? '',
    type: 'STOCK',
    costBasisPerShare: { amount: 90_00 },
    currentPricePerShare: { amount: 100_00 },
    currency: USD,
    lastPriceUpdate: null,
    ...meta,
    ...partial,
  } as Investment;
}

function makeAccount(partial: Partial<Account> & Pick<Account, 'id' | 'name' | 'type'>): Account {
  return {
    householdId: 'hh-1',
    purpose: undefined,
    currency: USD,
    currentBalance: { amount: 0 },
    isArchived: false,
    sortOrder: 0,
    icon: null,
    color: null,
    ...meta,
    ...partial,
  } as Account;
}

const investments: Investment[] = [
  makeInvestment({ symbol: 'VTI', shares: 10, type: 'ETF', accountId: 'acct-a' }),
  makeInvestment({
    symbol: 'BTC',
    shares: 0.5,
    type: 'CRYPTO',
    accountId: 'acct-b',
    currentPricePerShare: { amount: 40000_00 },
    costBasisPerShare: { amount: 30000_00 },
  }),
];

const accounts: Account[] = [
  makeAccount({ id: 'acct-a', name: 'Alpha Brokerage', type: 'INVESTMENT' }),
  makeAccount({ id: 'acct-b', name: 'Beta Crypto', type: 'INVESTMENT' }),
  makeAccount({
    id: 'cash-1',
    name: 'Checking',
    type: 'CHECKING',
    currentBalance: { amount: 5000_00 },
  }),
];

const mockUseInvestments = vi.mocked(useInvestments);
const mockUseAccounts = vi.mocked(useAccounts);

function setData(invs: Investment[], accts: Account[], loading = false): void {
  mockUseInvestments.mockReturnValue({ investments: invs, loading } as never);
  mockUseAccounts.mockReturnValue({ accounts: accts, loading } as never);
}

const NOW = '2026-01-02T15:00:00.000Z';

function quote(
  symbol: string,
  priceCents: number,
  assetKind: QuoteSnapshot['assetKind'] = 'equity',
): QuoteSnapshot {
  return {
    symbol,
    assetKind,
    priceCents,
    currency: 'USD',
    asOf: NOW,
    source: 'manual',
    marketSession: assetKind === 'crypto' ? '24x7' : 'open',
  };
}

describe('useLivePnl mapping helpers', () => {
  it('maps investments to positions with resolved brokerage labels', () => {
    const positions = buildLivePositions(investments, accounts);
    expect(positions[0]).toMatchObject({
      symbol: 'VTI',
      brokerage: 'Alpha Brokerage',
      assetClass: 'equity',
      quantity: 10,
      previousCloseCents: 100_00,
      costBasisCents: 900_00,
    });
    expect(positions[1].assetClass).toBe('crypto');
    expect(positions[1].brokerage).toBe('Beta Crypto');
  });

  it('builds de-duplicated quote requests', () => {
    const dupes = [...investments, makeInvestment({ symbol: 'vti', shares: 1, type: 'ETF' })];
    const requests = buildQuoteRequests(dupes);
    expect(requests).toHaveLength(2);
  });

  it('seeds the simulator from stored prices with higher crypto volatility', () => {
    const seeds = buildSimulatedSeeds(investments);
    const btc = seeds.find((s) => s.symbol === 'BTC');
    expect(btc?.basePriceCents).toBe(40000_00);
    expect(btc?.marketSession).toBe('24x7');
    expect(btc?.volatilityBps ?? 0).toBeGreaterThan(
      seeds.find((s) => s.symbol === 'VTI')?.volatilityBps ?? 0,
    );
  });

  it('excludes investment accounts from base net-worth balances', () => {
    const base = buildBaseAccountBalances(accounts, 'USD');
    expect(base).toHaveLength(1);
    expect(base[0]).toMatchObject({
      accountId: 'cash-1',
      assetClass: 'cash',
      balanceCents: 5000_00,
    });
  });
});

describe('useLivePnl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setData(investments, accounts);
  });

  it('recomputes the view as live prices arrive (live update)', () => {
    const source = new ManualPriceSource({ now: () => NOW });
    const { result } = renderHook(() =>
      useLivePnl({ source, now: () => NOW, baseCurrency: 'USD' }),
    );

    // Before any quote, prices fall back to previous close → day P&L is flat.
    expect(result.current.view).not.toBeNull();
    expect(result.current.view?.dayPnlCents).toBe(0);
    expect(result.current.isLive).toBe(true);

    // A live tick raises VTI by $10/share → +$100 day P&L.
    act(() => {
      source.emit([quote('VTI', 110_00), quote('BTC', 40000_00, 'crypto')]);
    });

    expect(result.current.view?.dayPnlCents).toBe(100_00);
    expect(result.current.view?.indicators.day.direction).toBe('gain');
    expect(result.current.lastUpdated).toBe(NOW);

    // A subsequent tick lowers VTI below previous close → loss.
    act(() => {
      source.emit([quote('VTI', 95_00), quote('BTC', 40000_00, 'crypto')]);
    });
    expect(result.current.view?.dayPnlCents).toBe(-50_00);
    expect(result.current.view?.indicators.day.direction).toBe('loss');
  });

  it('surfaces source errors', () => {
    const source = new ManualPriceSource({ now: () => NOW });
    const { result } = renderHook(() => useLivePnl({ source, now: () => NOW }));
    act(() => {
      source.emit([], NOW, 'feed unavailable');
    });
    expect(result.current.error).toBe('feed unavailable');
  });

  it('returns null view when there are no positions or base accounts', () => {
    setData([], []);
    const source = new ManualPriceSource({ now: () => NOW });
    const { result } = renderHook(() => useLivePnl({ source, now: () => NOW }));
    expect(result.current.view).toBeNull();
  });

  it('refresh delegates to the source', async () => {
    const source = new ManualPriceSource({ now: () => NOW });
    const spy = vi.spyOn(source, 'refreshNow');
    const { result } = renderHook(() => useLivePnl({ source, now: () => NOW }));
    await act(async () => {
      result.current.refresh();
    });
    expect(spy).toHaveBeenCalled();
  });
});
