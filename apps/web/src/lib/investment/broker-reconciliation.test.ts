// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { reconcileBrokerageData } from './broker-reconciliation';
import type { BrokerActivity, BrokerPosition, CashBalance } from './broker-reconciliation';

describe('reconcileBrokerageData', () => {
  it('detects duplicate manual/API trades with symbol aliases', () => {
    const activities: BrokerActivity[] = [
      { id: 'api-1', source: 'plaid', accountId: 'taxable', type: 'BUY', tradeDate: '2026-01-02', symbol: 'BRK.B', quantity: 0.5, amountCents: -20000_00, currency: 'USD' },
      { id: 'csv-1', source: 'csv', accountId: 'taxable', type: 'BUY', tradeDate: '2026-01-02', symbol: 'BRK/B', quantity: 0.5, amountCents: -20000_00, currency: 'USD' },
      { id: 'div-1', source: 'csv', accountId: 'taxable', type: 'DIVIDEND', tradeDate: '2026-01-03', symbol: 'VTI', amountCents: 42_00, currency: 'USD' },
    ];

    const summary = reconcileBrokerageData({ activities, positions: [], cashBalances: [], symbolAliases: { 'BRK/B': 'BRK.B' } });

    expect(summary.duplicateGroups).toEqual([['api-1', 'csv-1']]);
    expect(summary.warningCount).toBe(1);
  });

  it('reports position and cash mismatches with severity', () => {
    const positions: BrokerPosition[] = [
      { source: 'api', accountId: 'ira', symbol: 'VTI', quantity: 10, marketValueCents: 25000_00, currency: 'USD' },
      { source: 'csv', accountId: 'ira', symbol: 'VTI', quantity: 9.5, marketValueCents: 23750_00, currency: 'USD' },
    ];
    const cashBalances: CashBalance[] = [
      { source: 'api', accountId: 'ira', currency: 'USD', balanceCents: 1000_00 },
      { source: 'csv', accountId: 'ira', currency: 'USD', balanceCents: 750_00 },
    ];

    const summary = reconcileBrokerageData({ activities: [], positions, cashBalances });

    expect(summary.issues.map((issue) => issue.type)).toEqual(['position-mismatch', 'cash-mismatch']);
    expect(summary.criticalCount).toBe(2);
  });

  it('classifies same-day equal and opposite cash rows as possible transfers', () => {
    const summary = reconcileBrokerageData({
      activities: [
        { id: 'in', source: 'broker', accountId: 'taxable', type: 'TRANSFER', tradeDate: '2026-01-04', amountCents: 500_00, currency: 'USD' },
        { id: 'out', source: 'bank', accountId: 'checking', type: 'TRANSFER', tradeDate: '2026-01-04', amountCents: -500_00, currency: 'USD' },
      ],
      positions: [],
      cashBalances: [],
    });

    expect(summary.issues).toContainEqual(expect.objectContaining({ type: 'possible-transfer', severity: 'info' }));
  });
});
