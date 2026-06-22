// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  classifyLiquidity,
  combinePortfolioLiquidity,
  computeLiquidityBreakdown,
  DEFI_KIND_LABELS,
  DEFI_LOCK_STATE_LABELS,
  extractRewardIncome,
  isLiquidLockState,
  positionTotalValueCents,
  rewardValueOfPosition,
  summarizeByChain,
  summarizeByProtocol,
  summarizeDefiPortfolio,
  toPositionView,
} from './defi-positions';
import type { DefiPositionEntry } from './defi-positions-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Liquid Aave USDC lending position on Ethereum with claimable rewards. */
const aaveLending: DefiPositionEntry = {
  id: 'pos-aave',
  protocol: 'Aave',
  chain: 'ethereum',
  kind: 'LENDING',
  label: 'USDC supply',
  principalValueCents: 500_000, // $5,000
  lockState: 'LIQUID',
  apyPercent: 3.5,
  rewards: [{ token: 'AAVE', quantity: 0.5, valueCents: 4_000 }], // $40
  valuationAsOf: '2025-06-01',
};

/** Locked Lido stETH staking position on Ethereum with accrued rewards. */
const lidoStaking: DefiPositionEntry = {
  id: 'pos-lido',
  protocol: 'Lido',
  chain: 'ethereum',
  kind: 'STAKING',
  label: 'stETH staking',
  principalValueCents: 1_000_000, // $10,000
  lockState: 'LOCKED',
  apyPercent: 4.2,
  rewards: [{ token: 'stETH', quantity: 0.1, valueCents: 30_000 }], // $300
  valuationAsOf: '2025-06-01',
};

/** Unbonding Curve LP/farm on Arbitrum, no rewards yet. */
const curveFarm: DefiPositionEntry = {
  id: 'pos-curve',
  protocol: 'Curve',
  chain: 'arbitrum',
  kind: 'FARM',
  label: 'tricrypto farm',
  principalValueCents: 250_000, // $2,500
  lockState: 'UNBONDING',
  apyPercent: 12,
  rewards: [],
  valuationAsOf: '2025-06-01',
};

const ALL = [aaveLending, lidoStaking, curveFarm];

// ---------------------------------------------------------------------------
// Per-position helpers
// ---------------------------------------------------------------------------

describe('per-position helpers', () => {
  it('classifies only LIQUID positions as liquid', () => {
    expect(isLiquidLockState('LIQUID')).toBe(true);
    expect(isLiquidLockState('LOCKED')).toBe(false);
    expect(isLiquidLockState('UNBONDING')).toBe(false);
    expect(isLiquidLockState('WITHDRAWAL_PENDING')).toBe(false);

    expect(classifyLiquidity(aaveLending)).toBe('LIQUID');
    expect(classifyLiquidity(lidoStaking)).toBe('LOCKED');
    expect(classifyLiquidity(curveFarm)).toBe('LOCKED');
  });

  it('sums reward value and total value in integer cents', () => {
    expect(rewardValueOfPosition(aaveLending)).toBe(4_000);
    expect(rewardValueOfPosition(curveFarm)).toBe(0);
    // principal 500000 + rewards 4000
    expect(positionTotalValueCents(aaveLending)).toBe(504_000);
    expect(positionTotalValueCents(lidoStaking)).toBe(1_030_000);
  });

  it('treats missing rewards and non-finite values as zero', () => {
    const noRewards: DefiPositionEntry = {
      id: 'x',
      protocol: 'P',
      chain: 'ethereum',
      kind: 'VAULT',
      label: 'v',
      principalValueCents: Number.NaN,
      lockState: 'LIQUID',
    };
    expect(rewardValueOfPosition(noRewards)).toBe(0);
    expect(positionTotalValueCents(noRewards)).toBe(0);
  });

  it('builds an enriched view with labels and totals', () => {
    const view = toPositionView(lidoStaking);
    expect(view.kindLabel).toBe(DEFI_KIND_LABELS.STAKING);
    expect(view.lockStateLabel).toBe(DEFI_LOCK_STATE_LABELS.LOCKED);
    expect(view.liquidityClass).toBe('LOCKED');
    expect(view.rewardValueCents).toBe(30_000);
    expect(view.totalValueCents).toBe(1_030_000);
    expect(view.apyPercent).toBe(4.2);
  });
});

// ---------------------------------------------------------------------------
// Liquidity breakdown
// ---------------------------------------------------------------------------

describe('computeLiquidityBreakdown', () => {
  it('computes liquid, locked, reward, and total exposure with percentages', () => {
    const b = computeLiquidityBreakdown(ALL);
    // liquid = aave 504000
    expect(b.liquidValueCents).toBe(504_000);
    // locked = lido 1030000 + curve 250000
    expect(b.lockedValueCents).toBe(1_280_000);
    // rewards = 4000 + 30000 + 0
    expect(b.pendingRewardValueCents).toBe(34_000);
    expect(b.totalExposureCents).toBe(1_784_000);
    // 504000 / 1784000 = 28.2511...% -> 28.25
    expect(b.liquidPercent).toBe(28.25);
    // 1280000 / 1784000 = 71.7488...% -> 71.75
    expect(b.lockedPercent).toBe(71.75);
  });

  it('returns all zeros for an empty portfolio', () => {
    const b = computeLiquidityBreakdown([]);
    expect(b).toEqual({
      liquidValueCents: 0,
      lockedValueCents: 0,
      pendingRewardValueCents: 0,
      totalExposureCents: 0,
      liquidPercent: 0,
      lockedPercent: 0,
    });
  });

  it('reports 100% locked when every position is locked', () => {
    const b = computeLiquidityBreakdown([lidoStaking, curveFarm]);
    expect(b.liquidValueCents).toBe(0);
    expect(b.liquidPercent).toBe(0);
    expect(b.lockedPercent).toBe(100);
  });

  it('reports 100% liquid when every position is liquid', () => {
    const b = computeLiquidityBreakdown([aaveLending]);
    expect(b.lockedValueCents).toBe(0);
    expect(b.liquidPercent).toBe(100);
    expect(b.lockedPercent).toBe(0);
  });

  it('reports zero pending rewards when there are none', () => {
    const b = computeLiquidityBreakdown([curveFarm]);
    expect(b.pendingRewardValueCents).toBe(0);
  });

  it('uses banker’s rounding (round half to even) for percentages', () => {
    // liquid 1 cent of 160 total -> 1/160*10000 = 62.5 -> rounds to 62 (even) -> 0.62
    const liquid: DefiPositionEntry = {
      id: 'l',
      protocol: 'P',
      chain: 'ethereum',
      kind: 'LENDING',
      label: 'l',
      principalValueCents: 1,
      lockState: 'LIQUID',
    };
    const locked: DefiPositionEntry = {
      id: 'k',
      protocol: 'P',
      chain: 'ethereum',
      kind: 'STAKING',
      label: 'k',
      principalValueCents: 159,
      lockState: 'LOCKED',
    };
    const b = computeLiquidityBreakdown([liquid, locked]);
    expect(b.totalExposureCents).toBe(160);
    expect(b.liquidPercent).toBe(0.62); // 62.5 -> 62 (even)
    expect(b.lockedPercent).toBe(99.38); // 9937.5 -> 9938 (even)
  });
});

// ---------------------------------------------------------------------------
// Group summaries
// ---------------------------------------------------------------------------

describe('summarizeByProtocol', () => {
  it('groups positions by protocol ordered by total value descending', () => {
    const rows = summarizeByProtocol(ALL);
    expect(rows.map((r) => r.protocol)).toEqual(['Lido', 'Aave', 'Curve']);

    const lido = rows.find((r) => r.protocol === 'Lido');
    expect(lido?.totalValueCents).toBe(1_030_000);
    expect(lido?.lockedValueCents).toBe(1_030_000);
    expect(lido?.liquidValueCents).toBe(0);
    expect(lido?.pendingRewardValueCents).toBe(30_000);
    expect(lido?.positionCount).toBe(1);
    expect(lido?.chains).toEqual(['ethereum']);
  });

  it('collects the distinct chains a protocol spans, sorted', () => {
    const sushiArb: DefiPositionEntry = {
      ...curveFarm,
      id: 'sushi-1',
      protocol: 'Sushi',
      chain: 'optimism',
    };
    const sushiEth: DefiPositionEntry = {
      ...curveFarm,
      id: 'sushi-2',
      protocol: 'Sushi',
      chain: 'ethereum',
    };
    const rows = summarizeByProtocol([sushiArb, sushiEth]);
    const sushi = rows.find((r) => r.protocol === 'Sushi');
    expect(sushi?.chains).toEqual(['ethereum', 'optimism']);
    expect(sushi?.positionCount).toBe(2);
  });

  it('returns an empty array for no positions', () => {
    expect(summarizeByProtocol([])).toEqual([]);
  });
});

describe('summarizeByChain', () => {
  it('groups positions by chain ordered by total value descending', () => {
    const rows = summarizeByChain(ALL);
    expect(rows.map((r) => r.chain)).toEqual(['ethereum', 'arbitrum']);

    const ethereum = rows.find((r) => r.chain === 'ethereum');
    // aave 504000 + lido 1030000
    expect(ethereum?.totalValueCents).toBe(1_534_000);
    expect(ethereum?.liquidValueCents).toBe(504_000);
    expect(ethereum?.lockedValueCents).toBe(1_030_000);
    expect(ethereum?.positionCount).toBe(2);

    const arbitrum = rows.find((r) => r.chain === 'arbitrum');
    expect(arbitrum?.totalValueCents).toBe(250_000);
    expect(arbitrum?.lockedValueCents).toBe(250_000);
  });
});

// ---------------------------------------------------------------------------
// Reward income extraction
// ---------------------------------------------------------------------------

describe('extractRewardIncome', () => {
  it('maps reward tokens to staking-income records with classification', () => {
    const income = extractRewardIncome(ALL);
    expect(income).toHaveLength(2);

    const aave = income.find((r) => r.id === 'pos-aave:AAVE');
    expect(aave).toMatchObject({
      symbol: 'AAVE',
      quantity: 0.5,
      fairMarketValueCents: 4_000,
      dateReceived: '2025-06-01',
      type: 'DEFI_YIELD', // lending -> DeFi yield
      protocol: 'Aave',
    });

    const lido = income.find((r) => r.id === 'pos-lido:stETH');
    expect(lido?.type).toBe('STAKING'); // staking -> staking income
    expect(lido?.fairMarketValueCents).toBe(30_000);
  });

  it('skips empty reward balances and returns nothing when there are no rewards', () => {
    expect(extractRewardIncome([curveFarm])).toEqual([]);

    const zero: DefiPositionEntry = {
      ...aaveLending,
      id: 'zero',
      rewards: [{ token: 'ZERO', quantity: 0, valueCents: 0 }],
    };
    expect(extractRewardIncome([zero])).toEqual([]);
  });

  it('falls back to the supplied asOf date when a position is undated', () => {
    const undated: DefiPositionEntry = {
      ...aaveLending,
      id: 'undated',
      valuationAsOf: undefined,
    };
    const income = extractRewardIncome([undated], '2025-12-31');
    expect(income[0]?.dateReceived).toBe('2025-12-31');
  });
});

// ---------------------------------------------------------------------------
// Portfolio rollups
// ---------------------------------------------------------------------------

describe('summarizeDefiPortfolio', () => {
  it('assembles positions, breakdown, group summaries, and reward income', () => {
    const summary = summarizeDefiPortfolio(ALL, { rewardAsOf: '2025-06-01' });
    expect(summary.positionCount).toBe(3);
    expect(summary.positions).toHaveLength(3);
    expect(summary.breakdown.totalExposureCents).toBe(1_784_000);
    expect(summary.byProtocol).toHaveLength(3);
    expect(summary.byChain).toHaveLength(2);
    expect(summary.rewardIncome).toHaveLength(2);
  });

  it('handles an empty portfolio', () => {
    const summary = summarizeDefiPortfolio([]);
    expect(summary.positionCount).toBe(0);
    expect(summary.positions).toEqual([]);
    expect(summary.byProtocol).toEqual([]);
    expect(summary.byChain).toEqual([]);
    expect(summary.rewardIncome).toEqual([]);
    expect(summary.breakdown.totalExposureCents).toBe(0);
  });
});

describe('combinePortfolioLiquidity', () => {
  it('blends spot holdings (liquid) with the DeFi locked value', () => {
    const breakdown = computeLiquidityBreakdown(ALL);
    const split = combinePortfolioLiquidity(2_000_000, breakdown); // $20,000 spot

    expect(split.spotLiquidValueCents).toBe(2_000_000);
    expect(split.defiLiquidValueCents).toBe(504_000);
    expect(split.defiLockedValueCents).toBe(1_280_000);
    // liquid = spot 2000000 + defi liquid 504000
    expect(split.liquidValueCents).toBe(2_504_000);
    expect(split.lockedValueCents).toBe(1_280_000);
    expect(split.totalValueCents).toBe(3_784_000);
    expect(split.pendingRewardValueCents).toBe(34_000);
    // 2504000 / 3784000 = 66.17...%
    expect(split.liquidPercent).toBe(66.17);
    expect(split.lockedPercent).toBe(33.83);
  });

  it('handles a spot-only portfolio with no DeFi positions', () => {
    const breakdown = computeLiquidityBreakdown([]);
    const split = combinePortfolioLiquidity(1_000_000, breakdown);
    expect(split.liquidValueCents).toBe(1_000_000);
    expect(split.lockedValueCents).toBe(0);
    expect(split.liquidPercent).toBe(100);
    expect(split.lockedPercent).toBe(0);
  });

  it('handles a zero-value portfolio without dividing by zero', () => {
    const split = combinePortfolioLiquidity(0, computeLiquidityBreakdown([]));
    expect(split.totalValueCents).toBe(0);
    expect(split.liquidPercent).toBe(0);
    expect(split.lockedPercent).toBe(0);
  });
});
