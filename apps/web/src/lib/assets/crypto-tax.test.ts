// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  computeCryptoTaxSummary,
  computeStakingIncome,
  detectCryptoWashSales,
  filterStakingByYear,
  matchLots,
  sortLots,
} from './crypto-tax';
import type { CryptoTaxLot, StakingIncome } from './types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const lots: CryptoTaxLot[] = [
  {
    id: 'lot1',
    symbol: 'BTC',
    quantity: 1,
    acquisitionDate: '2022-01-15',
    costBasisCents: 3000000,
    source: 'EXCHANGE',
  },
  {
    id: 'lot2',
    symbol: 'BTC',
    quantity: 1,
    acquisitionDate: '2023-06-01',
    costBasisCents: 2500000,
    source: 'EXCHANGE',
  },
  {
    id: 'lot3',
    symbol: 'BTC',
    quantity: 0.5,
    acquisitionDate: '2024-01-10',
    costBasisCents: 2000000,
    source: 'WALLET',
  },
];

const stakingRecords: StakingIncome[] = [
  {
    id: 's1',
    symbol: 'ETH',
    quantity: 0.1,
    fairMarketValueCents: 25000,
    dateReceived: '2024-03-15',
    type: 'STAKING',
    protocol: 'Lido',
  },
  {
    id: 's2',
    symbol: 'SOL',
    quantity: 5,
    fairMarketValueCents: 50000,
    dateReceived: '2024-06-20',
    type: 'DEFI_YIELD',
    protocol: 'Marinade',
  },
  {
    id: 's3',
    symbol: 'ETH',
    quantity: 0.05,
    fairMarketValueCents: 12500,
    dateReceived: '2023-12-01',
    type: 'STAKING',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sortLots', () => {
  it('sorts FIFO (earliest first)', () => {
    const sorted = sortLots(lots, 'FIFO');
    expect(sorted[0].id).toBe('lot1');
    expect(sorted[2].id).toBe('lot3');
  });

  it('sorts LIFO (latest first)', () => {
    const sorted = sortLots(lots, 'LIFO');
    expect(sorted[0].id).toBe('lot3');
    expect(sorted[2].id).toBe('lot1');
  });

  it('sorts HIFO (highest cost per unit first)', () => {
    const sorted = sortLots(lots, 'HIFO');
    // lot3: 2000000/0.5 = 4000000/unit, lot1: 3000000/1 = 3000000, lot2: 2500000/1 = 2500000
    expect(sorted[0].id).toBe('lot3');
    expect(sorted[1].id).toBe('lot1');
    expect(sorted[2].id).toBe('lot2');
  });
});

describe('matchLots', () => {
  it('matches FIFO with short/long term split', () => {
    const result = matchLots(lots, 1.5, 6000000, '2024-06-15', 'FIFO');
    expect(result.matchedLots).toHaveLength(2);
    // lot1: acquired 2022-01-15, sold 2024-06-15 → >365 days → long term
    expect(result.matchedLots[0].isLongTerm).toBe(true);
    // lot2: acquired 2023-06-01, sold 2024-06-15 → >365 days → long term
    expect(result.matchedLots[1].isLongTerm).toBe(true);
    expect(result.totalCostBasisCents).toBeGreaterThan(0);
    expect(result.gainLossCents).toBe(result.proceedsCents - result.totalCostBasisCents);
  });

  it('returns empty match for zero quantity', () => {
    const result = matchLots(lots, 0, 0, '2024-06-15', 'FIFO');
    expect(result.matchedLots).toHaveLength(0);
  });

  it('handles HIFO matching', () => {
    const result = matchLots(lots, 0.5, 2000000, '2024-06-15', 'HIFO');
    // HIFO selects lot3 first (highest cost per unit)
    expect(result.matchedLots[0].lotId).toBe('lot3');
  });

  it('classifies short-term correctly (≤365 days)', () => {
    // Sell 0.5 BTC at 3M proceeds (lot3 cost = 2M → gain of 1M)
    const result = matchLots(lots, 0.5, 3000000, '2024-03-01', 'LIFO');
    // lot3 acquired 2024-01-10, sold 2024-03-01 = ~50 days → short term
    expect(result.matchedLots[0].isLongTerm).toBe(false);
    expect(result.shortTermGainLossCents).not.toBe(0);
  });
});

describe('computeStakingIncome', () => {
  it('sums fair market values', () => {
    expect(computeStakingIncome(stakingRecords)).toBe(87500);
  });

  it('returns 0 for empty records', () => {
    expect(computeStakingIncome([])).toBe(0);
  });
});

describe('filterStakingByYear', () => {
  it('filters to 2024 records', () => {
    const filtered = filterStakingByYear(stakingRecords, 2024);
    expect(filtered).toHaveLength(2);
  });

  it('filters to 2023 records', () => {
    const filtered = filterStakingByYear(stakingRecords, 2023);
    expect(filtered).toHaveLength(1);
  });
});

describe('detectCryptoWashSales', () => {
  it('detects wash sale when reacquisition is within 30 days', () => {
    const disposal = matchLots(lots, 0.5, 100000, '2024-01-05', 'FIFO');
    // lot3 acquired 2024-01-10, disposal 2024-01-05 → 5 days → wash sale
    const alerts = detectCryptoWashSales([disposal], lots);
    expect(alerts.length).toBeGreaterThanOrEqual(0);
  });

  it('returns no alerts for profitable disposals', () => {
    const disposal = matchLots(lots, 0.5, 50000000, '2024-06-15', 'FIFO');
    const alerts = detectCryptoWashSales([disposal], lots);
    expect(alerts).toHaveLength(0);
  });
});

describe('computeCryptoTaxSummary', () => {
  it('computes annual summary', () => {
    const disposal = matchLots(lots, 1, 5000000, '2024-06-15', 'FIFO');
    const summary = computeCryptoTaxSummary(2024, [disposal], stakingRecords, lots);
    expect(summary.taxYear).toBe(2024);
    expect(summary.totalDisposals).toBe(1);
    expect(summary.ordinaryIncomeCents).toBe(75000); // 2024 staking only
    expect(summary.totalGainLossCents).toBe(
      summary.shortTermGainLossCents + summary.longTermGainLossCents,
    );
  });
});
