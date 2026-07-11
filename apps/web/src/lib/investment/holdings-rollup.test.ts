// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  UNASSIGNED_ACCOUNT_ID,
  computePositionCostBasisCents,
  computePositionMarketValueCents,
  rollUpHoldingsBySymbol,
  type HoldingPosition,
} from './holdings-rollup';

function position(overrides: Partial<HoldingPosition> = {}): HoldingPosition {
  return {
    id: 'inv-1',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    shares: 10,
    currentPricePerShareCents: 20000,
    costBasisPerShareCents: 15000,
    currencyCode: 'USD',
    accountId: 'acct-1',
    ...overrides,
  };
}

describe('holdings-rollup', () => {
  it('computes per-position market value and cost basis in cents', () => {
    const pos = position({ shares: 3, currentPricePerShareCents: 12345, costBasisPerShareCents: 10000 });
    expect(computePositionMarketValueCents(pos)).toBe(37035);
    expect(computePositionCostBasisCents(pos)).toBe(30000);
  });

  it('rolls up the same symbol across multiple accounts', () => {
    const rolled = rollUpHoldingsBySymbol([
      position({ id: 'a', accountId: 'acct-1', shares: 10 }),
      position({ id: 'b', accountId: 'acct-2', shares: 5 }),
    ]);

    expect(rolled).toHaveLength(1);
    const line = rolled[0];
    expect(line.symbol).toBe('AAPL');
    expect(line.totalShares).toBe(15);
    // 15 shares * $200 = $3000; cost 15 * $150 = $2250; gain $750.
    expect(line.marketValueCents).toBe(300000);
    expect(line.costBasisCents).toBe(225000);
    expect(line.gainLossCents).toBe(75000);
    expect(line.gainLossPercent).toBeCloseTo(33.33, 2);
    expect(line.accountCount).toBe(2);
    expect(line.positionCount).toBe(2);
  });

  it('groups case-insensitively on symbol', () => {
    const rolled = rollUpHoldingsBySymbol([
      position({ id: 'a', symbol: 'aapl', accountId: 'acct-1' }),
      position({ id: 'b', symbol: 'AAPL', accountId: 'acct-2' }),
    ]);
    expect(rolled).toHaveLength(1);
    expect(rolled[0].symbol).toBe('AAPL');
    expect(rolled[0].accountCount).toBe(2);
  });

  it('does not merge positions in different currencies', () => {
    const rolled = rollUpHoldingsBySymbol([
      position({ id: 'a', symbol: 'SHEL', currencyCode: 'USD' }),
      position({ id: 'b', symbol: 'SHEL', currencyCode: 'GBP' }),
    ]);
    expect(rolled).toHaveLength(2);
  });

  it('counts unassigned positions as a single distinct account', () => {
    const rolled = rollUpHoldingsBySymbol([
      position({ id: 'a', accountId: null }),
      position({ id: 'b', accountId: null }),
    ]);
    expect(rolled).toHaveLength(1);
    expect(rolled[0].accountCount).toBe(1);
    expect(rolled[0].accountIds).toContain(UNASSIGNED_ACCOUNT_ID);
  });

  it('sorts consolidated lines by market value descending', () => {
    const rolled = rollUpHoldingsBySymbol([
      position({ id: 'a', symbol: 'SMALL', shares: 1, currentPricePerShareCents: 100 }),
      position({ id: 'b', symbol: 'BIG', shares: 100, currentPricePerShareCents: 10000 }),
    ]);
    expect(rolled.map((line) => line.symbol)).toEqual(['BIG', 'SMALL']);
  });

  it('picks the display name from the largest contributing position', () => {
    const rolled = rollUpHoldingsBySymbol([
      position({ id: 'a', shares: 2, name: 'Apple (small lot)' }),
      position({ id: 'b', shares: 20, name: 'Apple Inc.' }),
    ]);
    expect(rolled[0].name).toBe('Apple Inc.');
  });

  it('returns an empty array for no positions', () => {
    expect(rollUpHoldingsBySymbol([])).toEqual([]);
  });
});
