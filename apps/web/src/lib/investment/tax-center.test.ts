// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  classifyGainTerm,
  computeTaxSummary,
  detectWashSaleGuardrails,
  matchSaleLots,
  type ClosedTaxLot,
  type TaxLot,
} from './tax-center';

function lot(overrides: Partial<TaxLot> & { id: string; acquiredDate: string }): TaxLot {
  return {
    symbol: 'AAPL',
    shares: 10,
    costPerShare: 10000,
    ...overrides,
  };
}

function closed(
  overrides: Partial<ClosedTaxLot> & { lotId: string; gainLoss: number },
): ClosedTaxLot {
  return {
    symbol: 'AAPL',
    acquiredDate: '2023-01-01',
    soldDate: '2024-06-01',
    shares: 10,
    proceeds: 0,
    costBasis: 0,
    term: 'SHORT_TERM',
    ...overrides,
  };
}

describe('matchSaleLots', () => {
  it('matches sales FIFO and computes realized gain per closed lot', () => {
    const result = matchSaleLots(
      [
        lot({ id: 'newer', acquiredDate: '2024-06-01', shares: 5, costPerShare: 12000 }),
        lot({ id: 'oldest', acquiredDate: '2023-01-01', shares: 10, costPerShare: 9000 }),
        lot({ id: 'middle', acquiredDate: '2023-07-01', shares: 8, costPerShare: 11000 }),
      ],
      { symbol: 'AAPL', shares: 12, salePricePerShare: 15000, soldDate: '2025-01-02' },
    );

    expect(result.unmatchedShares).toBe(0);
    expect(result.closedLots.map((closed) => [closed.lotId, closed.shares])).toEqual([
      ['oldest', 10],
      ['middle', 2],
    ]);
    expect(result.closedLots[0]).toMatchObject({
      proceeds: 150000,
      costBasis: 90000,
      gainLoss: 60000,
    });
    expect(result.closedLots[1]).toMatchObject({
      proceeds: 30000,
      costBasis: 22000,
      gainLoss: 8000,
    });
  });

  it('uses selected lots in order for specific-lot matching', () => {
    const result = matchSaleLots(
      [
        lot({ id: 'lot-a', acquiredDate: '2023-01-01', shares: 4, costPerShare: 8000 }),
        lot({ id: 'lot-b', acquiredDate: '2023-02-01', shares: 6, costPerShare: 12000 }),
        lot({ id: 'lot-c', acquiredDate: '2023-03-01', shares: 6, costPerShare: 10000 }),
      ],
      {
        symbol: 'AAPL',
        shares: 8,
        salePricePerShare: 15000,
        soldDate: '2024-08-01',
        matchingMethod: 'SPECIFIC_ID',
        specificLotIds: ['lot-c', 'lot-a'],
      },
    );

    expect(result.closedLots.map((closed) => [closed.lotId, closed.shares])).toEqual([
      ['lot-c', 6],
      ['lot-a', 2],
    ]);
  });
});

describe('classifyGainTerm', () => {
  it('classifies the exact one-year holding boundary as short-term', () => {
    expect(classifyGainTerm('2024-01-15', '2025-01-15')).toBe('SHORT_TERM');
  });

  it('classifies more than one year as long-term', () => {
    expect(classifyGainTerm('2024-01-15', '2025-01-16')).toBe('LONG_TERM');
  });
});

describe('detectWashSaleGuardrails', () => {
  it('flags replacement purchases exactly 30 days before and after a loss sale', () => {
    const sale = matchSaleLots(
      [lot({ id: 'sold', acquiredDate: '2023-01-01', shares: 10, costPerShare: 10000 })],
      { symbol: 'AAPL', shares: 10, salePricePerShare: 7000, soldDate: '2024-03-15' },
    );

    const alerts = detectWashSaleGuardrails(sale.closedLots, [
      lot({ id: 'sold', acquiredDate: '2023-01-01', shares: 10, costPerShare: 10000 }),
      lot({ id: 'before', acquiredDate: '2024-02-14', shares: 4, costPerShare: 8000 }),
      lot({ id: 'after', acquiredDate: '2024-04-14', shares: 3, costPerShare: 8500 }),
    ]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].replacementLots.map((replacement) => replacement.lotId)).toEqual([
      'before',
      'after',
    ]);
    expect(alerts[0].disallowedLoss).toBe(21000);
  });

  it('does not flag gains or purchases outside the 30-day window', () => {
    const gainSale = matchSaleLots(
      [lot({ id: 'gain', acquiredDate: '2023-01-01', shares: 10, costPerShare: 10000 })],
      { symbol: 'AAPL', shares: 10, salePricePerShare: 12000, soldDate: '2024-03-15' },
    );
    const lossSale = matchSaleLots(
      [lot({ id: 'loss', acquiredDate: '2023-01-01', shares: 10, costPerShare: 10000 })],
      { symbol: 'AAPL', shares: 10, salePricePerShare: 7000, soldDate: '2024-03-15' },
    );

    expect(
      detectWashSaleGuardrails(gainSale.closedLots, [
        lot({ id: 'replacement', acquiredDate: '2024-03-20', shares: 5 }),
      ]),
    ).toHaveLength(0);
    expect(
      detectWashSaleGuardrails(lossSale.closedLots, [
        lot({ id: 'outside-before', acquiredDate: '2024-02-13', shares: 5 }),
        lot({ id: 'outside-after', acquiredDate: '2024-04-15', shares: 5 }),
      ]),
    ).toHaveLength(0);
  });
});

describe('computeTaxSummary', () => {
  it('adds wash-sale disallowed losses back into taxable gain before estimating tax', () => {
    const sale = matchSaleLots(
      [lot({ id: 'sold', acquiredDate: '2023-01-01', shares: 10, costPerShare: 10000 })],
      { symbol: 'AAPL', shares: 10, salePricePerShare: 7000, soldDate: '2024-03-15' },
    );
    const alerts = detectWashSaleGuardrails(sale.closedLots, [
      lot({ id: 'replacement', acquiredDate: '2024-03-20', shares: 10 }),
    ]);

    const summary = computeTaxSummary(sale.closedLots, 35, 15, alerts);

    expect(summary.longTermGainLoss).toBe(-30000);
    expect(summary.washSaleDisallowedLoss).toBe(30000);
    expect(summary.taxableLongTermGainLoss).toBe(0);
    expect(summary.estimatedTax).toBe(0);
  });

  it('nets a long-term loss against a short-term gain before estimating tax', () => {
    // $10,000 ST gain, $4,000 LT loss → residual $6,000 ST gain taxed at 35%.
    const summary = computeTaxSummary(
      [
        closed({ lotId: 'st', term: 'SHORT_TERM', gainLoss: 1_000_000 }),
        closed({ lotId: 'lt', term: 'LONG_TERM', gainLoss: -400_000 }),
      ],
      35,
      15,
    );

    expect(summary.estimatedTax).toBe(210_000); // 6,000 * 35%, not 10,000 * 35%
    expect(summary.netDeductibleLoss).toBe(0);
    expect(summary.lossCarryforward).toBe(0);
  });

  it('taxes both categories independently when both are gains', () => {
    const summary = computeTaxSummary(
      [
        closed({ lotId: 'st', term: 'SHORT_TERM', gainLoss: 200_000 }),
        closed({ lotId: 'lt', term: 'LONG_TERM', gainLoss: 300_000 }),
      ],
      35,
      15,
    );

    expect(summary.estimatedTax).toBe(115_000); // 2,000*35% + 3,000*15%
    expect(summary.netDeductibleLoss).toBe(0);
    expect(summary.lossCarryforward).toBe(0);
  });

  it('caps a net capital loss deduction at the $3,000 annual limit and carries the rest forward', () => {
    // $2,000 ST loss + $5,000 LT loss = $7,000 net loss.
    const summary = computeTaxSummary(
      [
        closed({ lotId: 'st', term: 'SHORT_TERM', gainLoss: -200_000 }),
        closed({ lotId: 'lt', term: 'LONG_TERM', gainLoss: -500_000 }),
      ],
      35,
      15,
    );

    expect(summary.estimatedTax).toBe(0);
    expect(summary.netDeductibleLoss).toBe(300_000); // $3,000 cap
    expect(summary.lossCarryforward).toBe(400_000); // $4,000 remainder
  });

  it('deducts a small net capital loss fully with no carryforward', () => {
    const summary = computeTaxSummary([closed({ lotId: 'st', gainLoss: -100_000 })], 35, 15);

    expect(summary.estimatedTax).toBe(0);
    expect(summary.netDeductibleLoss).toBe(100_000); // full $1,000, under the cap
    expect(summary.lossCarryforward).toBe(0);
  });
});
