// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from 'vitest';
import {
  CostBasisMethod,
  selectLotsFIFO,
  selectLotsLIFO,
  selectLotsSpecific,
  calculateCapitalGains,
  generateAnnualSummary,
  type TaxLot,
  type Sale,
} from './capital-gains';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const LOTS: TaxLot[] = [
  {
    lotId: 'lot-1',
    symbol: 'AAPL',
    acquiredDate: '2022-03-01',
    quantity: 10,
    costPerShare: 150_00,
  },
  {
    lotId: 'lot-2',
    symbol: 'AAPL',
    acquiredDate: '2023-06-15',
    quantity: 10,
    costPerShare: 180_00,
  },
  {
    lotId: 'lot-3',
    symbol: 'AAPL',
    acquiredDate: '2024-02-01',
    quantity: 10,
    costPerShare: 200_00,
  },
];

const SALE: Sale = {
  symbol: 'AAPL',
  saleDate: '2024-09-01',
  quantity: 15,
  pricePerShare: 220_00,
};

describe('capital-gains', () => {
  // -----------------------------------------------------------------------
  // selectLotsFIFO
  // -----------------------------------------------------------------------
  describe('selectLotsFIFO', () => {
    it('consumes oldest lots first', () => {
      const allocs = selectLotsFIFO(LOTS, SALE);

      expect(allocs).toHaveLength(2);
      expect(allocs[0].lotId).toBe('lot-1');
      expect(allocs[0].quantityUsed).toBe(10);
      expect(allocs[1].lotId).toBe('lot-2');
      expect(allocs[1].quantityUsed).toBe(5);
    });

    it('lot-1 (2022) is long-term', () => {
      const allocs = selectLotsFIFO(LOTS, SALE);
      expect(allocs[0].isShortTerm).toBe(false);
    });

    it('lot-2 (Jun 2023) sold Sep 2024 is long-term', () => {
      const allocs = selectLotsFIFO(LOTS, SALE);
      expect(allocs[1].isShortTerm).toBe(false);
    });

    it('calculates correct cost basis per allocation', () => {
      const allocs = selectLotsFIFO(LOTS, SALE);
      // lot-1: 10 shares * $150 = $1,500
      expect(allocs[0].costBasis).toBe(1_500_00);
      // lot-2: 5 shares * $180 = $900
      expect(allocs[1].costBasis).toBe(900_00);
    });

    it('throws when insufficient shares', () => {
      const bigSale: Sale = { ...SALE, quantity: 50 };
      expect(() => selectLotsFIFO(LOTS, bigSale)).toThrow('Insufficient shares');
    });
  });

  // -----------------------------------------------------------------------
  // selectLotsLIFO
  // -----------------------------------------------------------------------
  describe('selectLotsLIFO', () => {
    it('consumes newest lots first', () => {
      const allocs = selectLotsLIFO(LOTS, SALE);

      expect(allocs).toHaveLength(2);
      expect(allocs[0].lotId).toBe('lot-3');
      expect(allocs[0].quantityUsed).toBe(10);
      expect(allocs[1].lotId).toBe('lot-2');
      expect(allocs[1].quantityUsed).toBe(5);
    });

    it('lot-3 (Feb 2024) sold Sep 2024 is short-term', () => {
      const allocs = selectLotsLIFO(LOTS, SALE);
      expect(allocs[0].isShortTerm).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // selectLotsSpecific
  // -----------------------------------------------------------------------
  describe('selectLotsSpecific', () => {
    it('selects specified lots', () => {
      const sale: Sale = {
        ...SALE,
        quantity: 10,
        specificLotIds: ['lot-2'],
      };
      const allocs = selectLotsSpecific(LOTS, sale);

      expect(allocs).toHaveLength(1);
      expect(allocs[0].lotId).toBe('lot-2');
      expect(allocs[0].quantityUsed).toBe(10);
    });

    it('throws when specificLotIds is empty', () => {
      const sale: Sale = { ...SALE, specificLotIds: [] };
      expect(() => selectLotsSpecific(LOTS, sale)).toThrow('specificLotIds is required');
    });

    it('throws when lot not found', () => {
      const sale: Sale = {
        ...SALE,
        quantity: 5,
        specificLotIds: ['lot-nonexistent'],
      };
      expect(() => selectLotsSpecific(LOTS, sale)).toThrow('not found');
    });
  });

  // -----------------------------------------------------------------------
  // calculateCapitalGains
  // -----------------------------------------------------------------------
  describe('calculateCapitalGains', () => {
    it('test vector: FIFO sale of 15 shares at $220', () => {
      const result = calculateCapitalGains(LOTS, SALE, CostBasisMethod.FIFO);

      // Proceeds: 15 * $220 = $3,300
      expect(result.proceeds).toBe(3_300_00);
      // Cost basis: 10 * $150 + 5 * $180 = $1,500 + $900 = $2,400
      expect(result.costBasis).toBe(2_400_00);
      // Gain: $3,300 - $2,400 = $900
      expect(result.gainLoss).toBe(900_00);
    });

    it('LIFO produces different cost basis', () => {
      const fifo = calculateCapitalGains(LOTS, SALE, CostBasisMethod.FIFO);
      const lifo = calculateCapitalGains(LOTS, SALE, CostBasisMethod.LIFO);

      // LIFO uses newer, more expensive lots → higher cost basis → lower gain
      expect(lifo.costBasis).toBeGreaterThan(fifo.costBasis);
      expect(lifo.gainLoss).toBeLessThan(fifo.gainLoss);
    });

    it('LIFO short-term vs long-term split', () => {
      const result = calculateCapitalGains(LOTS, SALE, CostBasisMethod.LIFO);

      // lot-3 (Feb 2024, short-term): 10 shares
      // lot-2 (Jun 2023, long-term): 5 shares
      expect(result.shortTermGainLoss).not.toBe(0);
      expect(result.longTermGainLoss).not.toBe(0);
    });

    it('specific lot method', () => {
      const sale: Sale = {
        ...SALE,
        quantity: 10,
        specificLotIds: ['lot-1'],
      };
      const result = calculateCapitalGains(LOTS, sale, CostBasisMethod.SPECIFIC_LOT);

      expect(result.costBasis).toBe(1_500_00); // 10 * $150
      expect(result.proceeds).toBe(2_200_00); // 10 * $220
      expect(result.gainLoss).toBe(700_00);
    });

    it('handles loss scenario', () => {
      const sale: Sale = {
        symbol: 'AAPL',
        saleDate: '2024-09-01',
        quantity: 10,
        pricePerShare: 140_00, // Below cost of lot-1 ($150)
      };
      const result = calculateCapitalGains(LOTS, sale, CostBasisMethod.FIFO);

      expect(result.gainLoss).toBe(-100_00); // 10 * ($140 - $150)
    });
  });

  // -----------------------------------------------------------------------
  // generateAnnualSummary
  // -----------------------------------------------------------------------
  describe('generateAnnualSummary', () => {
    it('generates summary with netting', () => {
      const results = [
        calculateCapitalGains(
          LOTS,
          { symbol: 'AAPL', saleDate: '2024-03-01', quantity: 5, pricePerShare: 220_00 },
          CostBasisMethod.FIFO,
        ),
        calculateCapitalGains(
          LOTS,
          {
            symbol: 'AAPL',
            saleDate: '2024-06-01',
            quantity: 5,
            pricePerShare: 120_00,
            specificLotIds: ['lot-3'],
          },
          CostBasisMethod.SPECIFIC_LOT,
        ),
      ];

      const summary = generateAnnualSummary(results, 2024);

      expect(summary.year).toBe(2024);
      expect(summary.transactionCount).toBe(2);
      expect(summary.netTotal).toBe(summary.netShortTerm + summary.netLongTerm);
    });

    it('handles empty results', () => {
      const summary = generateAnnualSummary([], 2024);

      expect(summary.shortTermGains).toBe(0);
      expect(summary.shortTermLosses).toBe(0);
      expect(summary.longTermGains).toBe(0);
      expect(summary.longTermLosses).toBe(0);
      expect(summary.netTotal).toBe(0);
      expect(summary.transactionCount).toBe(0);
    });
  });
});
