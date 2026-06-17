// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import {
  aggregateDisplayCurrencyAmounts,
  calculateBudgetDisplayRollup,
  calculateDashboardDisplayRollup,
  type DisplayExchangeRate,
} from '../display-currency-rollups';

const rates: DisplayExchangeRate[] = [
  { from: 'EUR', to: 'USD', rate: 1.1, timestamp: '2025-06-01T00:00:00Z', source: 'api' },
  { from: 'MXN', to: 'USD', rate: 0.05, timestamp: '2025-05-01T00:00:00Z', source: 'stored' },
];

describe('display currency rollups', () => {
  it('converts mixed currencies before summing dashboard totals', () => {
    const dashboard = calculateDashboardDisplayRollup({
      displayCurrency: 'USD',
      rates,
      accountBalances: [
        { id: 'checking', amountCents: 100_00, currency: 'USD' },
        { id: 'euro', amountCents: 100_00, currency: 'EUR' },
        { id: 'mxn', amountCents: 1_000_00, currency: 'MXN' },
      ],
      cashFlowTransactions: [
        { id: 'pay', amountCents: 200_00, currency: 'USD' },
        { id: 'meal', amountCents: -50_00, currency: 'EUR' },
      ],
    });

    expect(dashboard.netWorth.totalCents).toBe(260_00);
    expect(dashboard.cashFlow.totalCents).toBe(145_00);
    expect(dashboard.netWorth.disclosure).toContain('Converted EUR, MXN to USD');
  });

  it('marks stale or offline rates in metadata', () => {
    const rollup = aggregateDisplayCurrencyAmounts(
      [{ id: 'old', amountCents: 100_00, currency: 'MXN' }],
      'USD',
      rates,
      { staleAfter: '2025-05-15T00:00:00Z' },
    );

    expect(rollup.hasStaleRates).toBe(true);
    expect(rollup.disclosure).toContain('stale or offline');
  });

  it('returns budgeted spent and remaining amounts in display currency', () => {
    const rollup = calculateBudgetDisplayRollup(
      [
        { id: 'food', budgetedCents: 100_00, spentCents: 25_00, currency: 'USD' },
        { id: 'travel', budgetedCents: 100_00, spentCents: 20_00, currency: 'EUR' },
      ],
      'USD',
      rates,
    );

    expect(rollup.budgetedCents).toBe(210_00);
    expect(rollup.spentCents).toBe(47_00);
    expect(rollup.remainingCents).toBe(163_00);
  });
});
