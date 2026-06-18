// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../kmp/bridge';
import { generateCashFlowForecast } from './cash-flow-forecasts';

const sync = {
  createdAt: '2025-01-01T12:00:00Z',
  updatedAt: '2025-01-01T12:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function tx(id: string, date: string, type: Transaction['type'], amount: number): Transaction {
  return {
    ...sync,
    id,
    householdId: 'h1',
    accountId: 'a1',
    categoryId: 'cat',
    status: 'CLEARED',
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: null,
    note: null,
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantZip: null,
    merchantCountry: null,
    externalReferenceId: null,
    statementDescription: null,
    customFields: null,
    extraNotes: null,
    counterpartyName: null,
    counterpartyAccountId: null,
    date,
    type,
    amount: { amount },
  };
}

function history(): Transaction[] {
  const transactions: Transaction[] = [];
  for (let day = 1; day <= 20; day += 1) {
    const date = `2025-04-${String(day).padStart(2, '0')}`;
    transactions.push(tx(`i-${day}`, date, 'INCOME', 10_000));
    transactions.push(tx(`e-${day}`, date, 'EXPENSE', day % 5 === 0 ? 5_000 : 3_000));
  }
  return transactions;
}

describe('generateCashFlowForecast', () => {
  it('returns 7/30/90 day forecast ranges with confidence bands', () => {
    const result = generateCashFlowForecast({
      transactions: history(),
      currentBalanceCents: 100_000,
      asOfDate: '2025-04-20',
      recurringTransactions: [
        {
          id: 'rent',
          description: 'Rent',
          amountCents: 50_000,
          type: 'expense',
          nextDate: '2025-05-01',
        },
      ],
    });

    expect(result.status).toBe('ready');
    expect(result.forecasts.map((forecast) => forecast.horizonDays)).toEqual([7, 30, 90]);
    expect(result.forecasts[0].lowBalanceCents).toBeLessThan(
      result.forecasts[0].expectedBalanceCents,
    );
    expect(result.forecasts[0].highBalanceCents).toBeGreaterThan(
      result.forecasts[0].expectedBalanceCents,
    );
    expect(result.forecasts[0].topFactors.join(' ')).toContain('history');
  });

  it('highlights low-path safety-buffer crossings', () => {
    const result = generateCashFlowForecast({
      transactions: history(),
      currentBalanceCents: 8_000,
      asOfDate: '2025-04-20',
      safetyBufferCents: 5_000,
      horizons: [30],
      recurringTransactions: [
        {
          id: 'bill',
          description: 'Bill',
          amountCents: 250_000,
          type: 'expense',
          nextDate: '2025-04-25',
        },
      ],
    });

    expect(result.forecasts[0].thresholdCrossings.map((item) => item.threshold)).toContain(
      'safety-buffer',
    );
  });

  it('returns an explicit low-data state instead of overconfident ranges', () => {
    const result = generateCashFlowForecast({
      transactions: [tx('one', '2025-04-01', 'EXPENSE', 2_000)],
      currentBalanceCents: 100_000,
      asOfDate: '2025-04-20',
    });

    expect(result.status).toBe('low-data');
    expect(result.forecasts).toEqual([]);
    expect(result.message).toContain('At least');
  });
});
