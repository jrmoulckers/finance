// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  buildBrokerageImportPlan,
  detectDuplicates,
  importBrokerageCsvs,
  normalizeAction,
  parseBrokerageCsv,
  reconcileTrades,
  suggestColumnMapping,
  type BrokerageParseResult,
} from './brokerage-import';

// ---------------------------------------------------------------------------
// Fixtures — representative broker CSV header variants
// ---------------------------------------------------------------------------

const FIDELITY_CSV = [
  'Run Date,Action,Symbol,Quantity,Price ($),Commission ($),Amount ($)',
  '01/03/2024,YOU BOUGHT,AAPL,10,150.00,4.95,-1504.95',
  '02/14/2024,YOU BOUGHT,AAPL,5,160.00,4.95,-804.95',
  '03/20/2024,DIVIDEND RECEIVED,AAPL,0,0,0,12.50',
].join('\n');

const SCHWAB_CSV = [
  'Date,Action,Symbol,Quantity,Price,Fees & Comm,Amount',
  '02/01/2024,Buy,MSFT,8,400.00,0.00,-3200.00',
  '03/15/2024,Sell,MSFT,3,420.00,1.00,1259.00',
].join('\n');

function parseFidelity(): BrokerageParseResult {
  return parseBrokerageCsv(FIDELITY_CSV, { broker: 'Fidelity' });
}

// ---------------------------------------------------------------------------
// normalizeAction
// ---------------------------------------------------------------------------

describe('normalizeAction', () => {
  it.each([
    ['YOU BOUGHT', 'BUY'],
    ['Buy', 'BUY'],
    ['purchase', 'BUY'],
    ['Sell', 'SELL'],
    ['YOU SOLD', 'SELL'],
    ['Sale', 'SELL'],
    ['Dividend Received', 'DIV'],
    ['Reinvest Dividend', 'DIV'],
    ['DRIP', 'DIV'],
  ])('maps "%s" to %s', (input, expected) => {
    expect(normalizeAction(input)).toBe(expected);
  });

  it('returns null for empty or unknown actions', () => {
    expect(normalizeAction('')).toBeNull();
    expect(normalizeAction('journal')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// suggestColumnMapping
// ---------------------------------------------------------------------------

describe('suggestColumnMapping', () => {
  it('auto-detects Fidelity-style headers', () => {
    const mapping = suggestColumnMapping([
      'Run Date',
      'Action',
      'Symbol',
      'Quantity',
      'Price ($)',
      'Commission ($)',
      'Amount ($)',
    ]);
    expect(mapping.date).toBe('Run Date');
    expect(mapping.action).toBe('Action');
    expect(mapping.symbol).toBe('Symbol');
    expect(mapping.quantity).toBe('Quantity');
    expect(mapping.price).toBe('Price ($)');
    expect(mapping.fees).toBe('Commission ($)');
    expect(mapping.amount).toBe('Amount ($)');
  });

  it('detects Robinhood-style header variants', () => {
    const mapping = suggestColumnMapping([
      'Activity Date',
      'Instrument',
      'Trans Code',
      'Shares',
      'Average Price',
      'Net Amount',
    ]);
    expect(mapping.date).toBe('Activity Date');
    expect(mapping.symbol).toBe('Instrument');
    expect(mapping.action).toBe('Trans Code');
    expect(mapping.quantity).toBe('Shares');
    expect(mapping.price).toBe('Average Price');
    expect(mapping.amount).toBe('Net Amount');
  });

  it('leaves unmatched fields empty', () => {
    const mapping = suggestColumnMapping(['Foo', 'Bar']);
    expect(mapping.date).toBe('');
    expect(mapping.symbol).toBe('');
  });
});

// ---------------------------------------------------------------------------
// parseBrokerageCsv — happy path + fee handling
// ---------------------------------------------------------------------------

describe('parseBrokerageCsv', () => {
  it('parses buys, dividends and computes integer-cent cash flow incl. fees', () => {
    const result = parseFidelity();
    expect(result.errors).toHaveLength(0);
    expect(result.trades).toHaveLength(3);

    const [buy1, buy2, div] = result.trades;

    expect(buy1.symbol).toBe('AAPL');
    expect(buy1.action).toBe('BUY');
    expect(buy1.quantity).toBe(10);
    expect(buy1.priceCents).toBe(15000);
    expect(buy1.feesCents).toBe(495);
    expect(buy1.grossCents).toBe(150000);
    // BUY cash flow is negative and includes fees: -(150000 + 495)
    expect(buy1.cashFlowCents).toBe(-150495);

    expect(buy2.quantity).toBe(5);
    expect(buy2.grossCents).toBe(80000);
    expect(buy2.cashFlowCents).toBe(-80495);

    expect(div.action).toBe('DIV');
    expect(div.grossCents).toBe(1250);
    expect(div.cashFlowCents).toBe(1250);
  });

  it('handles sells net of fees with positive cash flow', () => {
    const result = parseBrokerageCsv(SCHWAB_CSV, { broker: 'Schwab' });
    expect(result.errors).toHaveLength(0);
    const sell = result.trades.find((t) => t.action === 'SELL');
    expect(sell).toBeDefined();
    expect(sell!.quantity).toBe(3);
    expect(sell!.grossCents).toBe(126000);
    expect(sell!.feesCents).toBe(100);
    // SELL proceeds are net of fees: 126000 - 100
    expect(sell!.cashFlowCents).toBe(125900);
  });

  it('uppercases symbols and resolves the broker label', () => {
    const csv = 'Date,Action,Symbol,Quantity,Price\n2024-01-01,buy,nvda,2,500.00';
    const result = parseBrokerageCsv(csv, { broker: 'Robinhood' });
    expect(result.trades[0].symbol).toBe('NVDA');
    expect(result.trades[0].broker).toBe('Robinhood');
  });

  it('derives price from the net amount when no price column exists', () => {
    const csv = 'Date,Action,Symbol,Quantity,Amount,Fees\n2024-01-01,buy,VTI,4,-1000.00,4.00';
    const result = parseBrokerageCsv(csv, { broker: 'Custom' });
    const trade = result.trades[0];
    // gross = |amount| - fees = 100000 - 400 = 99600; price = 99600 / 4
    expect(trade.grossCents).toBe(99600);
    expect(trade.priceCents).toBe(24900);
    expect(trade.cashFlowCents).toBe(-100000);
  });

  it('respects explicit mapping overrides', () => {
    const csv = 'When,What,Tkr,Units,Cost\n2024-01-01,Buy,TSLA,1,250.00';
    const result = parseBrokerageCsv(csv, {
      broker: 'Manual',
      mapping: {
        date: 'When',
        action: 'What',
        symbol: 'Tkr',
        quantity: 'Units',
        price: 'Cost',
      },
    });
    expect(result.errors).toHaveLength(0);
    expect(result.trades[0].symbol).toBe('TSLA');
    expect(result.trades[0].priceCents).toBe(25000);
  });

  // -------------------------------------------------------------------------
  // Malformed rows
  // -------------------------------------------------------------------------

  it('collects malformed rows as errors without throwing', () => {
    const csv = [
      'Date,Action,Symbol,Quantity,Price',
      ',Buy,AAPL,10,150.00', // missing date
      '2024-01-02,Buy,,10,150.00', // missing symbol
      '2024-01-03,journal,AAPL,10,150.00', // unrecognized action
      '2024-01-04,Buy,AAPL,abc,150.00', // invalid quantity
      '2024-01-05,Buy,AAPL,10,', // missing price
      '2024-01-06,Buy,AAPL,10,150.00', // valid
    ].join('\n');
    const result = parseBrokerageCsv(csv, { broker: 'Fidelity' });
    expect(result.trades).toHaveLength(1);
    expect(result.errors).toHaveLength(5);
    expect(result.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
    expect(result.errors[0].message).toMatch(/date/i);
    expect(result.errors[1].message).toMatch(/symbol/i);
    expect(result.errors[2].message).toMatch(/action/i);
    expect(result.errors[3].message).toMatch(/quantity/i);
    expect(result.errors[4].message).toMatch(/price/i);
  });
});

// ---------------------------------------------------------------------------
// reconcileTrades — single broker, average cost
// ---------------------------------------------------------------------------

describe('reconcileTrades (single broker)', () => {
  it('aggregates buys into a position with average cost incl. fees', () => {
    const { trades } = parseFidelity();
    const { holdings } = reconcileTrades(trades);
    expect(holdings).toHaveLength(1);
    const aapl = holdings[0];
    expect(aapl.symbol).toBe('AAPL');
    expect(aapl.netQuantity).toBe(15);
    // cost basis = (150000 + 495) + (80000 + 495) = 230990
    expect(aapl.costBasisCents).toBe(230990);
    // average cost = round(230990 / 15) = 15399 (banker's rounding of 15399.33)
    expect(aapl.averageCostCents).toBe(15399);
    expect(aapl.dividendsCents).toBe(1250);
    expect(aapl.totalFeesCents).toBe(990);
    expect(aapl.buyCount).toBe(2);
    expect(aapl.sellCount).toBe(0);
  });

  it('computes realized gain and reduces basis on a sell (average cost)', () => {
    const result = parseBrokerageCsv(SCHWAB_CSV, { broker: 'Schwab' });
    const { holdings } = reconcileTrades(result.trades);
    const msft = holdings[0];
    expect(msft.symbol).toBe('MSFT');
    expect(msft.netQuantity).toBe(5);
    // buy: 8 @ 400 + 0 fee = 320000 basis; avg = 40000/share
    // sell 3 @ 420 - 1 fee: proceeds 125900, cost removed 120000 -> realized 5900
    expect(msft.realizedGainCents).toBe(5900);
    // remaining basis = 320000 - 120000 = 200000
    expect(msft.costBasisCents).toBe(200000);
    expect(msft.averageCostCents).toBe(40000);
  });

  it('flags an oversold position when sells exceed buys', () => {
    const csv = [
      'Date,Action,Symbol,Quantity,Price',
      '2024-01-01,Buy,GME,5,20.00',
      '2024-02-01,Sell,GME,8,25.00',
    ].join('\n');
    const result = parseBrokerageCsv(csv, { broker: 'Robinhood' });
    const { holdings, warnings } = reconcileTrades(result.trades);
    expect(holdings[0].netQuantity).toBe(-3);
    expect(holdings[0].costBasisCents).toBe(0);
    expect(warnings.some((w) => w.type === 'oversold-position')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cross-broker reconciliation
// ---------------------------------------------------------------------------

describe('cross-broker reconciliation', () => {
  it('pools the same symbol across brokers into one unified holding', () => {
    const fidelity = parseBrokerageCsv(
      'Date,Action,Symbol,Quantity,Price,Fees\n2024-01-01,Buy,AAPL,10,150.00,5.00',
      { broker: 'Fidelity' },
    );
    const schwab = parseBrokerageCsv(
      'Date,Action,Symbol,Quantity,Price,Fees\n2024-02-01,Buy,AAPL,10,170.00,0.00',
      { broker: 'Schwab' },
    );
    const plan = buildBrokerageImportPlan([fidelity, schwab]);

    expect(plan.brokers).toEqual(['Fidelity', 'Schwab']);
    expect(plan.holdings).toHaveLength(1);
    const aapl = plan.holdings[0];
    expect(aapl.netQuantity).toBe(20);
    // basis = (150000 + 500) + (170000 + 0) = 320500
    expect(aapl.costBasisCents).toBe(320500);
    expect(aapl.averageCostCents).toBe(16025);
    expect(aapl.brokers).toEqual(['Fidelity', 'Schwab']);
    expect(aapl.contributions).toEqual([
      { broker: 'Fidelity', quantity: 10, costBasisCents: 150500 },
      { broker: 'Schwab', quantity: 10, costBasisCents: 170000 },
    ]);
  });

  it('aggregates totals across brokers in integer cents', () => {
    const plan = importBrokerageCsvs([
      {
        content: 'Date,Action,Symbol,Quantity,Price,Fees\n2024-01-01,Buy,AAPL,10,150.00,5.00',
        options: { broker: 'Fidelity' },
      },
      {
        content: 'Date,Action,Symbol,Quantity,Price\n2024-02-01,Buy,MSFT,2,400.00',
        options: { broker: 'Schwab' },
      },
    ]);
    expect(plan.totals.tradeCount).toBe(2);
    expect(plan.totals.buyCount).toBe(2);
    expect(plan.totals.feesCents).toBe(500);
    // net invested = (150000 + 500) + 80000 = 230500
    expect(plan.totals.netInvestedCents).toBe(230500);
  });
});

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

describe('detectDuplicates', () => {
  it('flags an identical trade duplicated within one broker export', () => {
    const csv = [
      'Date,Action,Symbol,Quantity,Price',
      '2024-01-01,Buy,AAPL,10,150.00',
      '2024-01-01,Buy,AAPL,10,150.00',
    ].join('\n');
    const result = parseBrokerageCsv(csv, { broker: 'Fidelity' });
    const groups = detectDuplicates(result.trades);
    expect(groups).toHaveLength(1);
    expect(groups[0].crossBroker).toBe(false);
    expect(groups[0].tradeIds).toHaveLength(2);
  });

  it('flags identical trades appearing across two brokers as cross-broker', () => {
    const a = parseBrokerageCsv(
      'Date,Action,Symbol,Quantity,Price\n2024-01-01,Buy,AAPL,10,150.00',
      {
        broker: 'Fidelity',
      },
    );
    const b = parseBrokerageCsv(
      'Date,Action,Symbol,Quantity,Price\n2024-01-01,Buy,AAPL,10,150.00',
      {
        broker: 'Schwab',
      },
    );
    const plan = buildBrokerageImportPlan([a, b]);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.duplicates[0].crossBroker).toBe(true);
    expect(plan.warnings.some((w) => w.type === 'duplicate-cross-broker')).toBe(true);
  });

  it('does not flag distinct trades as duplicates', () => {
    const result = parseFidelity();
    expect(detectDuplicates(result.trades)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildBrokerageImportPlan — orchestration / determinism
// ---------------------------------------------------------------------------

describe('buildBrokerageImportPlan', () => {
  it('is deterministic regardless of source order', () => {
    const fidelity = parseBrokerageCsv(
      'Date,Action,Symbol,Quantity,Price\n2024-02-01,Buy,AAPL,5,160.00',
      { broker: 'Fidelity' },
    );
    const schwab = parseBrokerageCsv(
      'Date,Action,Symbol,Quantity,Price\n2024-01-01,Buy,AAPL,10,150.00',
      { broker: 'Schwab' },
    );
    const planA = buildBrokerageImportPlan([fidelity, schwab]);
    const planB = buildBrokerageImportPlan([schwab, fidelity]);
    expect(planA.holdings).toEqual(planB.holdings);
    expect(planA.totals).toEqual(planB.totals);
    // trades are sorted by date
    expect(planA.trades.map((t) => t.date)).toEqual(['2024-01-01', '2024-02-01']);
  });

  it('surfaces parse errors from every source', () => {
    const good = parseBrokerageCsv(
      'Date,Action,Symbol,Quantity,Price\n2024-01-01,Buy,AAPL,1,10.00',
      {
        broker: 'Fidelity',
      },
    );
    const bad = parseBrokerageCsv('Date,Action,Symbol,Quantity,Price\n,Buy,AAPL,1,10.00', {
      broker: 'Schwab',
    });
    const plan = buildBrokerageImportPlan([good, bad]);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0].broker).toBe('Schwab');
  });

  it('handles an empty set of sources', () => {
    const plan = buildBrokerageImportPlan([]);
    expect(plan.trades).toHaveLength(0);
    expect(plan.holdings).toHaveLength(0);
    expect(plan.totals.tradeCount).toBe(0);
  });
});
