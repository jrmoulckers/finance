// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { detectP2PProvider, parseP2PCsv } from '../p2p-importer';

describe('P2P CSV importer', () => {
  it('detects and parses Venmo payments, requests, fees, transfers, refunds, and emoji memo text', () => {
    const csv = `Datetime,Type,Status,Note,From,To,Amount,Fee,ID
01/15/2024,Payment,Complete,"Pizza 🍕",Alex,Me,12.34,,v1
01/16/2024,Request,Complete,Rent,Me,Jordan,-500.00,,v2
01/17/2024,Instant Transfer,Complete,Cash out,Me,Bank,-10.00,0.25,v3
01/18/2024,Refund,Complete,Returned,Store,Me,4.50,,v4
01/19/2024,Fee,Complete,Instant fee,Me,Venmo,0.00,1.00,v5`;

    expect(detectP2PProvider(['Datetime', 'Type', 'Note', 'From', 'To'])).toBe('venmo');

    const result = parseP2PCsv(csv);

    expect(result.transactions.map((transaction) => transaction.kind)).toEqual([
      'payment',
      'request',
      'instant_transfer',
      'refund',
      'fee',
    ]);
    expect(result.transactions[0].memoPreview).toBe('Pizza 🍕');
    expect(result.transactions[0].counterpartyHash).toMatch(/^[a-f0-9]{8}$/);
    expect(JSON.stringify(result.transactions)).not.toContain('Alex');
  });

  it('detects and parses Cash App exports without preserving raw payee in normalized fields', () => {
    const csv = `Date,Transaction Type,Name,Amount,Fee,Status,Notes,ID
2024-01-15,Payment,Casey,-20.00,,Complete,Coffee,c1
2024-01-16,Refund,Shop,5.00,,Complete,Refund,c2`;

    expect(detectP2PProvider(['Date', 'Transaction Type', 'Name', 'Amount', 'Notes'])).toBe(
      'cash-app',
    );

    const result = parseP2PCsv(csv);

    expect(result.provider).toBe('cash-app');
    expect(result.transactions.map((transaction) => transaction.direction)).toEqual([
      'outflow',
      'inflow',
    ]);
    expect(result.transactions.map((transaction) => transaction.kind)).toEqual([
      'payment',
      'refund',
    ]);
    expect(result.transactions[0].counterpartyHash).not.toBeNull();
    expect(result.transactions[0].memoPreview).toBe('Coffee');
  });
});
