// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { manualBrokerageCsvAdapter, parseManualBrokerageCsv } from '../brokerage-trade-import';

const metadata = { provider: 'manual', accountId: 'acct-1', sourceFileName: 'broker.csv' };

describe('brokerage trade import', () => {
  it('detects common brokerage CSV headers and duplicate provider IDs', () => {
    const csv = `Date,Action,Symbol,Quantity,Price,Amount,Fee,Transaction ID
2024-01-15,Buy,AAPL,2,100.00,-200.00,,dup
2024-01-16,Sell,AAPL,1,110.00,110.00,1.00,dup`;

    expect(manualBrokerageCsvAdapter.detect(['Date', 'Action', 'Symbol', 'Amount'])).toBe(true);

    const result = parseManualBrokerageCsv(csv, metadata);

    expect(result.activities).toHaveLength(2);
    expect(result.activities[0]).toMatchObject({ kind: 'fill', feeCents: 0, quantity: 2 });
    expect(result.activities[1].feeCents).toBe(100);
    expect(result.duplicateProviderIds).toEqual(['dup']);
  });

  it('normalizes multi-leg options, transfers, dividends, corporate actions, and crypto trades', () => {
    const csv = `Date,Action,Symbol,Quantity,Price,Amount,Fee,Leg ID,Transaction ID
2024-01-15,Buy to Open Call,AAPL 240216C00100000,1,2.50,-250.00,,leg-a,opt-1
2024-01-15,Sell to Open Put,AAPL 240216P00090000,1,1.10,110.00,,leg-b,opt-2
2024-01-16,Transfer,,0,,500.00,,,xfer-1
2024-01-17,Dividend,MSFT,0,,12.00,,,div-1
2024-01-18,Stock Split,TSLA,0,,0.00,,,corp-1
2024-01-19,Buy Crypto,BTC,0.1,40000.00,-4000.00,,,crypto-1`;

    const kinds = parseManualBrokerageCsv(csv, metadata).activities.map((activity) => activity.kind);

    expect(kinds).toEqual(['option_event', 'option_event', 'transfer', 'dividend', 'corporate_action', 'crypto_trade']);
  });
});
