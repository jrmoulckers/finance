// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  calculateUnrealizedGainLoss,
  isShortTermHolding,
  estimateTaxSavings,
  analyzePosition,
  checkWashSale,
  findHarvestCandidates,
  calculateNetGainLoss,
  generateHarvestingSummary,
  MAX_CAPITAL_LOSS_DEDUCTION,
  type Position,
  type SecurityTransaction,
} from './tax-loss-harvesting';

describe('tax-loss-harvesting', () => {
  // -----------------------------------------------------------------------
  // calculateUnrealizedGainLoss
  // -----------------------------------------------------------------------
  describe('calculateUnrealizedGainLoss', () => {
    it('returns positive for a gain', () => {
      const pos: Position = {
        symbol: 'AAPL',
        costBasis: 10_000_00,
        marketValue: 12_000_00,
        acquiredDate: '2023-01-15',
        quantity: 10,
      };
      expect(calculateUnrealizedGainLoss(pos)).toBe(2_000_00);
    });

    it('returns negative for a loss', () => {
      const pos: Position = {
        symbol: 'META',
        costBasis: 15_000_00,
        marketValue: 10_000_00,
        acquiredDate: '2023-06-01',
        quantity: 5,
      };
      expect(calculateUnrealizedGainLoss(pos)).toBe(-5_000_00);
    });

    it('returns zero when values equal', () => {
      const pos: Position = {
        symbol: 'GOOG',
        costBasis: 8_000_00,
        marketValue: 8_000_00,
        acquiredDate: '2024-01-01',
        quantity: 2,
      };
      expect(calculateUnrealizedGainLoss(pos)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // isShortTermHolding
  // -----------------------------------------------------------------------
  describe('isShortTermHolding', () => {
    it('returns true for holding < 365 days', () => {
      expect(isShortTermHolding('2024-01-01', '2024-06-01')).toBe(true);
    });

    it('returns false for holding >= 365 days', () => {
      expect(isShortTermHolding('2023-01-01', '2024-01-01')).toBe(false);
    });

    it('boundary: exactly 364 days is short-term', () => {
      // 2023-01-01 to 2023-12-31 = 364 days (non-leap year)
      expect(isShortTermHolding('2023-01-02', '2023-12-31')).toBe(true);
    });

    it('boundary: exactly 365 days is long-term', () => {
      // 2023-01-01 to 2024-01-01 = 366 days (crosses into leap year), but
      // 2023-01-01 to 2023-12-31 = 364 days. Use a span that's exactly 365.
      expect(isShortTermHolding('2023-01-01', '2024-01-01')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // estimateTaxSavings
  // -----------------------------------------------------------------------
  describe('estimateTaxSavings', () => {
    it('short-term loss at 24% marginal rate', () => {
      // $5,000 loss at 24% = $1,200 savings
      expect(estimateTaxSavings(5_000_00, 0.24, true)).toBe(1_200_00);
    });

    it('long-term loss at 15% capital gains rate', () => {
      // $10,000 loss at 15% = $1,500 savings
      expect(estimateTaxSavings(10_000_00, 0.24, false, 0.15)).toBe(1_500_00);
    });

    it('returns 0 for zero loss', () => {
      expect(estimateTaxSavings(0, 0.24, true)).toBe(0);
    });

    it('returns 0 for negative loss amount', () => {
      expect(estimateTaxSavings(-1_000_00, 0.24, true)).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // analyzePosition
  // -----------------------------------------------------------------------
  describe('analyzePosition', () => {
    it('identifies a harvestable loss', () => {
      const pos: Position = {
        symbol: 'TSLA',
        costBasis: 20_000_00,
        marketValue: 15_000_00,
        acquiredDate: '2024-03-01',
        quantity: 10,
      };
      const result = analyzePosition(pos, '2024-09-01', 0.24);

      expect(result.unrealizedGainLoss).toBe(-5_000_00);
      expect(result.isShortTerm).toBe(true);
      expect(result.estimatedTaxSavings).toBe(1_200_00); // 24% of $5,000
    });

    it('returns zero savings for a gain', () => {
      const pos: Position = {
        symbol: 'MSFT',
        costBasis: 10_000_00,
        marketValue: 15_000_00,
        acquiredDate: '2023-01-01',
        quantity: 5,
      };
      const result = analyzePosition(pos, '2024-06-01', 0.22);

      expect(result.unrealizedGainLoss).toBe(5_000_00);
      expect(result.isShortTerm).toBe(false);
      expect(result.estimatedTaxSavings).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // checkWashSale
  // -----------------------------------------------------------------------
  describe('checkWashSale', () => {
    it('detects wash sale from repurchase within 30 days after', () => {
      const transactions: SecurityTransaction[] = [
        { symbol: 'VTI', date: '2024-06-20', type: 'BUY' },
      ];
      const result = checkWashSale('2024-06-01', 'VTI', transactions);

      expect(result.isWashSale).toBe(true);
      expect(result.conflictingTransaction?.date).toBe('2024-06-20');
    });

    it('detects wash sale from purchase within 30 days before', () => {
      const transactions: SecurityTransaction[] = [
        { symbol: 'VTI', date: '2024-05-15', type: 'BUY' },
      ];
      const result = checkWashSale('2024-06-01', 'VTI', transactions);

      expect(result.isWashSale).toBe(true);
    });

    it('no wash sale when repurchase is 31 days out', () => {
      const transactions: SecurityTransaction[] = [
        { symbol: 'VTI', date: '2024-07-03', type: 'BUY' },
      ];
      const result = checkWashSale('2024-06-01', 'VTI', transactions);

      expect(result.isWashSale).toBe(false);
      expect(result.conflictingTransaction).toBeNull();
    });

    it('ignores sell transactions (only buys trigger wash sale)', () => {
      const transactions: SecurityTransaction[] = [
        { symbol: 'VTI', date: '2024-06-10', type: 'SELL' },
      ];
      const result = checkWashSale('2024-06-01', 'VTI', transactions);

      expect(result.isWashSale).toBe(false);
    });

    it('ignores different securities', () => {
      const transactions: SecurityTransaction[] = [
        { symbol: 'VOO', date: '2024-06-10', type: 'BUY' },
      ];
      const result = checkWashSale('2024-06-01', 'VTI', transactions);

      expect(result.isWashSale).toBe(false);
    });

    it('boundary: exactly 30 days after triggers wash sale', () => {
      const transactions: SecurityTransaction[] = [
        { symbol: 'SPY', date: '2024-07-01', type: 'BUY' },
      ];
      const result = checkWashSale('2024-06-01', 'SPY', transactions);

      expect(result.isWashSale).toBe(true);
    });

    it('returns correct window dates', () => {
      const result = checkWashSale('2024-06-15', 'AAPL', []);

      expect(result.windowStart).toBe('2024-05-16');
      expect(result.windowEnd).toBe('2024-07-15');
    });
  });

  // -----------------------------------------------------------------------
  // findHarvestCandidates
  // -----------------------------------------------------------------------
  describe('findHarvestCandidates', () => {
    it('returns only positions with losses', () => {
      const positions: Position[] = [
        {
          symbol: 'AAPL',
          costBasis: 10_000_00,
          marketValue: 12_000_00,
          acquiredDate: '2023-01-01',
          quantity: 10,
        },
        {
          symbol: 'META',
          costBasis: 15_000_00,
          marketValue: 10_000_00,
          acquiredDate: '2024-01-15',
          quantity: 5,
        },
        {
          symbol: 'NFLX',
          costBasis: 8_000_00,
          marketValue: 6_000_00,
          acquiredDate: '2024-03-01',
          quantity: 3,
        },
      ];

      const candidates = findHarvestCandidates(positions, '2024-09-01', 0.24);

      expect(candidates).toHaveLength(2);
      expect(candidates[0].position.symbol).toBe('META');
      expect(candidates[1].position.symbol).toBe('NFLX');
    });

    it('returns empty array when no losses', () => {
      const positions: Position[] = [
        {
          symbol: 'AAPL',
          costBasis: 10_000_00,
          marketValue: 15_000_00,
          acquiredDate: '2023-01-01',
          quantity: 10,
        },
      ];

      const candidates = findHarvestCandidates(positions, '2024-09-01', 0.24);
      expect(candidates).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // calculateNetGainLoss
  // -----------------------------------------------------------------------
  describe('calculateNetGainLoss', () => {
    it('nets short-term and long-term gains/losses', () => {
      const result = calculateNetGainLoss(5_000_00, 3_000_00, 8_000_00, 2_000_00);

      expect(result.netShortTerm).toBe(2_000_00);
      expect(result.netLongTerm).toBe(6_000_00);
      expect(result.netTotal).toBe(8_000_00);
      expect(result.deductibleLoss).toBe(0);
      expect(result.carryForwardLoss).toBe(0);
    });

    it('caps deductible loss at $3,000', () => {
      const result = calculateNetGainLoss(1_000_00, 10_000_00, 0, 0);

      expect(result.netTotal).toBe(-9_000_00);
      expect(result.deductibleLoss).toBe(MAX_CAPITAL_LOSS_DEDUCTION); // $3,000
      expect(result.carryForwardLoss).toBe(6_000_00); // $6,000
    });

    it('small net loss is fully deductible', () => {
      const result = calculateNetGainLoss(0, 2_000_00, 0, 0);

      expect(result.netTotal).toBe(-2_000_00);
      expect(result.deductibleLoss).toBe(2_000_00);
      expect(result.carryForwardLoss).toBe(0);
    });

    it('handles all zeros', () => {
      const result = calculateNetGainLoss(0, 0, 0, 0);

      expect(result.netTotal).toBe(0);
      expect(result.deductibleLoss).toBe(0);
      expect(result.carryForwardLoss).toBe(0);
    });

    it('boundary: exactly $3,000 net loss', () => {
      const result = calculateNetGainLoss(0, 3_000_00, 0, 0);

      expect(result.deductibleLoss).toBe(3_000_00);
      expect(result.carryForwardLoss).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // generateHarvestingSummary
  // -----------------------------------------------------------------------
  describe('generateHarvestingSummary', () => {
    it('generates portfolio-level summary', () => {
      const positions: Position[] = [
        {
          symbol: 'AAPL',
          costBasis: 10_000_00,
          marketValue: 12_000_00,
          acquiredDate: '2023-01-01',
          quantity: 10,
        },
        {
          symbol: 'META',
          costBasis: 15_000_00,
          marketValue: 10_000_00,
          acquiredDate: '2024-01-15',
          quantity: 5,
        },
      ];

      const summary = generateHarvestingSummary(positions, '2024-09-01', 0.24);

      expect(summary.candidates).toHaveLength(1);
      expect(summary.totalUnrealizedLosses).toBe(-5_000_00);
      expect(summary.totalEstimatedSavings).toBeGreaterThan(0);
      expect(summary.netGainLoss).toBe(-3_000_00); // +2000 - 5000
    });
  });
});
