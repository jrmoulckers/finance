// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { BROKER_FORMATS, KNOWN_BROKER_LABELS, detectBrokerFormat } from './broker-formats';

/** Pull just the header row out of a CSV string. */
function headersOf(csv: string): string[] {
  return csv.split('\n')[0].split(',');
}

describe('detectBrokerFormat', () => {
  it('returns null for an empty or unrecognized header set', () => {
    expect(detectBrokerFormat([])).toBeNull();
    // Generic export with no distinctive signature columns.
    expect(detectBrokerFormat(['Date', 'Action', 'Symbol', 'Quantity', 'Price'])).toBeNull();
  });

  it('detects a Fidelity trade-confirmation export and tunes the mapping', () => {
    const headers = headersOf(
      'Run Date,Action,Symbol,Quantity,Price ($),Commission ($),Amount ($)',
    );
    const detected = detectBrokerFormat(headers);
    expect(detected).not.toBeNull();
    expect(detected?.broker).toBe('Fidelity');
    expect(detected?.assetClass).toBe('equities');
    expect(detected?.dateFormat).toBe('MM/DD/YYYY');
    expect(detected?.mapping).toMatchObject({
      date: 'Run Date',
      symbol: 'Symbol',
      action: 'Action',
      quantity: 'Quantity',
      price: 'Price ($)',
      fees: 'Commission ($)',
      amount: 'Amount ($)',
    });
  });

  it('detects a Schwab export by its "Fees & Comm" signature column', () => {
    const headers = headersOf('Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount');
    const detected = detectBrokerFormat(headers);
    expect(detected?.broker).toBe('Charles Schwab');
    expect(detected?.mapping.fees).toBe('Fees & Comm');
  });

  it('detects a Robinhood export by Activity Date / Instrument / Trans Code', () => {
    const headers = headersOf(
      'Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount',
    );
    const detected = detectBrokerFormat(headers);
    expect(detected?.broker).toBe('Robinhood');
    expect(detected?.mapping).toMatchObject({
      date: 'Activity Date',
      symbol: 'Instrument',
      action: 'Trans Code',
    });
  });

  it('detects an Interactive Brokers export without assuming a date format', () => {
    const headers = headersOf(
      'TradeDate,Symbol,Buy/Sell,Quantity,TradePrice,IBCommission,Proceeds',
    );
    const detected = detectBrokerFormat(headers);
    expect(detected?.broker).toBe('Interactive Brokers');
    expect(detected?.dateFormat).toBeUndefined();
    expect(detected?.mapping).toMatchObject({
      action: 'Buy/Sell',
      price: 'TradePrice',
      fees: 'IBCommission',
    });
  });

  it('detects crypto venues (Coinbase and Kraken) and labels them as crypto', () => {
    const coinbase = detectBrokerFormat(
      headersOf(
        'Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price at Transaction,Subtotal,Total,Fees and/or Spread',
      ),
    );
    expect(coinbase?.broker).toBe('Coinbase');
    expect(coinbase?.assetClass).toBe('crypto');
    expect(coinbase?.mapping).toMatchObject({
      symbol: 'Asset',
      quantity: 'Quantity Transacted',
      fees: 'Fees and/or Spread',
    });

    const kraken = detectBrokerFormat(
      headersOf('txid,ordertxid,pair,time,type,ordertype,price,cost,fee,vol,margin,misc,ledgers'),
    );
    expect(kraken?.broker).toBe('Kraken');
    expect(kraken?.assetClass).toBe('crypto');
    expect(kraken?.mapping).toMatchObject({
      date: 'time',
      symbol: 'pair',
      quantity: 'vol',
      amount: 'cost',
    });
  });

  it('matches headers case-insensitively and ignoring surrounding whitespace', () => {
    const detected = detectBrokerFormat([' RUN DATE ', 'action', 'SYMBOL', 'Quantity']);
    expect(detected?.broker).toBe('Fidelity');
    // Resolved mapping preserves the file's original header casing/spacing.
    expect(detected?.mapping.date).toBe(' RUN DATE ');
  });

  it('prefers the more specific profile when signatures overlap', () => {
    // Vanguard's signature (4 columns) is more specific than a 3-column match.
    const headers = headersOf(
      'Trade Date,Symbol,Transaction Type,Shares,Share Price,Principal Amount,Commission Fees',
    );
    const detected = detectBrokerFormat(headers);
    expect(detected?.broker).toBe('Vanguard');
    expect(detected?.confidence).toBe(4);
  });

  it('exposes a stable, non-empty catalog of known brokers', () => {
    expect(BROKER_FORMATS.length).toBeGreaterThanOrEqual(8);
    expect(KNOWN_BROKER_LABELS).toContain('Fidelity');
    expect(KNOWN_BROKER_LABELS).toContain('Coinbase');
    // Every profile must declare at least two signature columns to stay unambiguous.
    for (const profile of BROKER_FORMATS) {
      expect(profile.signature.length).toBeGreaterThanOrEqual(3);
    }
  });
});
