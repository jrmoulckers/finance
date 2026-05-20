// SPDX-License-Identifier: BUSL-1.1

/**
 * Tests for brokerage trade import with duplicate-safe reconciliation.
 *
 * References: issue #1592
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Trade, TradeImportRow } from './types';
import {
  bankersRound,
  createFingerprint,
  normalizeDate,
  parseDollarsToCents,
  parseTradeAction,
  parseTradeRow,
  parseTradeRows,
  reconcileTrades,
  resetImportIdCounter,
  safeDivide,
  tradeToFingerprint,
} from './trade-import';

// ---------------------------------------------------------------------------
// bankersRound
// ---------------------------------------------------------------------------

describe('bankersRound', () => {
  it('rounds 0.5 to even (down when floor is even)', () => {
    expect(bankersRound(2.5)).toBe(2);
    expect(bankersRound(4.5)).toBe(4);
  });

  it('rounds 0.5 to even (up when floor is odd)', () => {
    expect(bankersRound(3.5)).toBe(4);
    expect(bankersRound(5.5)).toBe(6);
  });

  it('rounds normally for non-0.5 values', () => {
    expect(bankersRound(2.3)).toBe(2);
    expect(bankersRound(2.7)).toBe(3);
    expect(bankersRound(3.1)).toBe(3);
    expect(bankersRound(3.9)).toBe(4);
  });

  it('handles negative values', () => {
    expect(bankersRound(-2.3)).toBe(-2);
    expect(bankersRound(-2.7)).toBe(-3);
  });

  it('returns 0 for NaN and Infinity', () => {
    expect(bankersRound(NaN)).toBe(0);
    expect(bankersRound(Infinity)).toBe(0);
    expect(bankersRound(-Infinity)).toBe(0);
  });

  it('handles zero', () => {
    expect(bankersRound(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// safeDivide
// ---------------------------------------------------------------------------

describe('safeDivide', () => {
  it('divides normally', () => {
    expect(safeDivide(10, 2)).toBe(5);
    expect(safeDivide(100, 3)).toBeCloseTo(33.333, 2);
  });

  it('returns 0 for divide by zero', () => {
    expect(safeDivide(10, 0)).toBe(0);
    expect(safeDivide(0, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseDollarsToCents
// ---------------------------------------------------------------------------

describe('parseDollarsToCents', () => {
  it('parses standard dollar amounts', () => {
    expect(parseDollarsToCents('100.00')).toBe(10000);
    expect(parseDollarsToCents('1234.56')).toBe(123456);
  });

  it('handles dollar signs and commas', () => {
    expect(parseDollarsToCents('$1,234.56')).toBe(123456);
    expect(parseDollarsToCents('$100')).toBe(10000);
  });

  it('handles negative amounts', () => {
    expect(parseDollarsToCents('-$500.00')).toBe(-50000);
    expect(parseDollarsToCents('-100.50')).toBe(-10050);
  });

  it('returns 0 for invalid input', () => {
    expect(parseDollarsToCents('')).toBe(0);
    expect(parseDollarsToCents('abc')).toBe(0);
  });

  it('handles amounts with no decimal', () => {
    expect(parseDollarsToCents('100')).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// normalizeDate
// ---------------------------------------------------------------------------

describe('normalizeDate', () => {
  it('passes through ISO dates', () => {
    expect(normalizeDate('2024-01-15')).toBe('2024-01-15');
  });

  it('converts MM/DD/YYYY to ISO', () => {
    expect(normalizeDate('01/15/2024')).toBe('2024-01-15');
    expect(normalizeDate('12/31/2023')).toBe('2023-12-31');
  });

  it('converts M/D/YYYY to ISO', () => {
    expect(normalizeDate('1/5/2024')).toBe('2024-01-05');
  });

  it('trims whitespace', () => {
    expect(normalizeDate('  2024-01-15  ')).toBe('2024-01-15');
  });
});

// ---------------------------------------------------------------------------
// parseTradeAction
// ---------------------------------------------------------------------------

describe('parseTradeAction', () => {
  it('parses standard actions (case-insensitive)', () => {
    expect(parseTradeAction('Buy')).toBe('BUY');
    expect(parseTradeAction('SELL')).toBe('SELL');
    expect(parseTradeAction('dividend')).toBe('DIVIDEND');
    expect(parseTradeAction('div')).toBe('DIVIDEND');
  });

  it('parses transfer actions', () => {
    expect(parseTradeAction('transfer in')).toBe('TRANSFER_IN');
    expect(parseTradeAction('transfer_out')).toBe('TRANSFER_OUT');
  });

  it('returns null for unknown actions', () => {
    expect(parseTradeAction('unknown')).toBeNull();
    expect(parseTradeAction('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fingerprinting
// ---------------------------------------------------------------------------

describe('createFingerprint', () => {
  it('creates a deterministic string key', () => {
    const fp = createFingerprint({
      date: '2024-01-15',
      symbol: 'AAPL',
      amountCents: 10000,
      action: 'BUY',
    });
    expect(fp).toBe('2024-01-15|AAPL|10000|BUY');
  });

  it('normalizes symbol to uppercase', () => {
    const fp = createFingerprint({
      date: '2024-01-15',
      symbol: 'aapl',
      amountCents: 10000,
      action: 'BUY',
    });
    expect(fp).toBe('2024-01-15|AAPL|10000|BUY');
  });
});

describe('tradeToFingerprint', () => {
  it('extracts fingerprint fields from a trade', () => {
    const trade: Trade = {
      id: 'test-1',
      date: '2024-01-15',
      symbol: 'MSFT',
      action: 'BUY',
      shares: 10,
      amountCents: 500000,
      pricePerShareCents: 50000,
      commissionCents: 0,
    };
    const fp = tradeToFingerprint(trade);
    expect(fp.date).toBe('2024-01-15');
    expect(fp.symbol).toBe('MSFT');
    expect(fp.amountCents).toBe(500000);
    expect(fp.action).toBe('BUY');
  });
});

// ---------------------------------------------------------------------------
// parseTradeRow
// ---------------------------------------------------------------------------

describe('parseTradeRow', () => {
  beforeEach(() => {
    resetImportIdCounter();
  });

  it('parses a valid CSV row into a Trade', () => {
    const row: TradeImportRow = {
      date: '01/15/2024',
      symbol: 'AAPL',
      action: 'Buy',
      shares: '10',
      amount: '$1,500.00',
      price: '$150.00',
      commission: '$4.95',
    };
    const trade = parseTradeRow(row);
    expect(trade).not.toBeNull();
    expect(trade!.date).toBe('2024-01-15');
    expect(trade!.symbol).toBe('AAPL');
    expect(trade!.action).toBe('BUY');
    expect(trade!.shares).toBe(10);
    expect(trade!.amountCents).toBe(150000);
    expect(trade!.pricePerShareCents).toBe(15000);
    expect(trade!.commissionCents).toBe(495);
  });

  it('returns null for invalid action', () => {
    const row: TradeImportRow = {
      date: '2024-01-15',
      symbol: 'AAPL',
      action: 'INVALID',
      shares: '10',
      amount: '1500',
      price: '150',
      commission: '0',
    };
    expect(parseTradeRow(row)).toBeNull();
  });

  it('returns null for missing symbol', () => {
    const row: TradeImportRow = {
      date: '2024-01-15',
      symbol: '',
      action: 'Buy',
      shares: '10',
      amount: '1500',
      price: '150',
      commission: '0',
    };
    expect(parseTradeRow(row)).toBeNull();
  });

  it('handles missing commission', () => {
    const row: TradeImportRow = {
      date: '2024-01-15',
      symbol: 'GOOG',
      action: 'Sell',
      shares: '5',
      amount: '750',
      price: '150',
      commission: '',
    };
    const trade = parseTradeRow(row);
    expect(trade!.commissionCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseTradeRows
// ---------------------------------------------------------------------------

describe('parseTradeRows', () => {
  beforeEach(() => {
    resetImportIdCounter();
  });

  it('parses multiple rows, skipping invalid ones', () => {
    const rows: TradeImportRow[] = [
      {
        date: '2024-01-15',
        symbol: 'AAPL',
        action: 'Buy',
        shares: '10',
        amount: '1500',
        price: '150',
        commission: '0',
      },
      {
        date: '2024-01-16',
        symbol: '',
        action: 'Buy',
        shares: '5',
        amount: '500',
        price: '100',
        commission: '0',
      },
      {
        date: '2024-01-17',
        symbol: 'MSFT',
        action: 'Sell',
        shares: '3',
        amount: '900',
        price: '300',
        commission: '5',
      },
    ];
    const trades = parseTradeRows(rows);
    expect(trades).toHaveLength(2);
    expect(trades[0].symbol).toBe('AAPL');
    expect(trades[1].symbol).toBe('MSFT');
  });

  it('returns empty array for all invalid rows', () => {
    const rows: TradeImportRow[] = [
      {
        date: '',
        symbol: '',
        action: '',
        shares: '',
        amount: '',
        price: '',
        commission: '',
      },
    ];
    expect(parseTradeRows(rows)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// reconcileTrades
// ---------------------------------------------------------------------------

describe('reconcileTrades', () => {
  const existingTrades: Trade[] = [
    {
      id: 'existing-1',
      date: '2024-01-15',
      symbol: 'AAPL',
      action: 'BUY',
      shares: 10,
      amountCents: 150000,
      pricePerShareCents: 15000,
      commissionCents: 0,
    },
    {
      id: 'existing-2',
      date: '2024-01-20',
      symbol: 'MSFT',
      action: 'BUY',
      shares: 5,
      amountCents: 200000,
      pricePerShareCents: 40000,
      commissionCents: 500,
    },
  ];

  it('identifies duplicate trades', () => {
    const imported: Trade[] = [
      {
        id: 'import-1',
        date: '2024-01-15',
        symbol: 'AAPL',
        action: 'BUY',
        shares: 10,
        amountCents: 150000,
        pricePerShareCents: 15000,
        commissionCents: 0,
      },
    ];
    const result = reconcileTrades(imported, existingTrades);
    expect(result.duplicateCount).toBe(1);
    expect(result.newCount).toBe(0);
    expect(result.totalImported).toBe(1);
  });

  it('identifies new trades', () => {
    const imported: Trade[] = [
      {
        id: 'import-1',
        date: '2024-02-01',
        symbol: 'GOOG',
        action: 'BUY',
        shares: 3,
        amountCents: 45000,
        pricePerShareCents: 15000,
        commissionCents: 0,
      },
    ];
    const result = reconcileTrades(imported, existingTrades);
    expect(result.newCount).toBe(1);
    expect(result.duplicateCount).toBe(0);
  });

  it('identifies matched trades (same symbol+date, different details)', () => {
    const imported: Trade[] = [
      {
        id: 'import-1',
        date: '2024-01-15',
        symbol: 'AAPL',
        action: 'SELL',
        shares: 5,
        amountCents: 80000,
        pricePerShareCents: 16000,
        commissionCents: 0,
      },
    ];
    const result = reconcileTrades(imported, existingTrades);
    expect(result.matchedCount).toBe(1);
    expect(result.duplicateCount).toBe(0);
    expect(result.newCount).toBe(0);
  });

  it('handles mixed import with all categories', () => {
    const imported: Trade[] = [
      // Duplicate
      {
        id: 'dup',
        date: '2024-01-15',
        symbol: 'AAPL',
        action: 'BUY',
        shares: 10,
        amountCents: 150000,
        pricePerShareCents: 15000,
        commissionCents: 0,
      },
      // Matched (same date+symbol, different action/amount)
      {
        id: 'match',
        date: '2024-01-20',
        symbol: 'MSFT',
        action: 'SELL',
        shares: 2,
        amountCents: 80000,
        pricePerShareCents: 40000,
        commissionCents: 0,
      },
      // New
      {
        id: 'new',
        date: '2024-03-01',
        symbol: 'TSLA',
        action: 'BUY',
        shares: 1,
        amountCents: 20000,
        pricePerShareCents: 20000,
        commissionCents: 0,
      },
    ];
    const result = reconcileTrades(imported, existingTrades);
    expect(result.totalImported).toBe(3);
    expect(result.duplicateCount).toBe(1);
    expect(result.matchedCount).toBe(1);
    expect(result.newCount).toBe(1);
  });

  it('handles empty existing trades (all are new)', () => {
    const imported: Trade[] = [
      {
        id: 'new-1',
        date: '2024-01-15',
        symbol: 'AAPL',
        action: 'BUY',
        shares: 10,
        amountCents: 150000,
        pricePerShareCents: 15000,
        commissionCents: 0,
      },
    ];
    const result = reconcileTrades(imported, []);
    expect(result.newCount).toBe(1);
    expect(result.duplicateCount).toBe(0);
  });

  it('handles empty import', () => {
    const result = reconcileTrades([], existingTrades);
    expect(result.totalImported).toBe(0);
    expect(result.newCount).toBe(0);
    expect(result.duplicateCount).toBe(0);
  });
});
