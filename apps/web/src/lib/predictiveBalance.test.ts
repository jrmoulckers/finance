// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  computeHistoricalAverages,
  computeCurrentMonthSpending,
  generatePredictions,
} from './predictiveBalance';
import type { Transaction } from '../kmp/bridge';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function makeTx(overrides: {
  date: string;
  type: Transaction['type'];
  amount: number;
  accountId?: string;
}): Transaction {
  return {
    id: crypto.randomUUID(),
    householdId: 'h1',
    accountId: overrides.accountId ?? 'acc-1',
    categoryId: null,
    status: 'CLEARED',
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: null,
    note: null,
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    ...syncMetadata,
    type: overrides.type,
    amount: { amount: overrides.amount },
    date: overrides.date,
  };
}

describe('predictiveBalance', () => {
  describe('computeHistoricalAverages', () => {
    it('returns zero averages for empty transactions', () => {
      const result = computeHistoricalAverages([], 3);
      expect(result.avgDailySpendingCents).toBe(0);
      expect(result.avgDailyIncomeCents).toBe(0);
    });

    it('computes daily spending average from past transactions', () => {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      const dateStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-15`;

      const transactions = [
        makeTx({ date: dateStr, type: 'EXPENSE', amount: 3000 }),
        makeTx({ date: dateStr, type: 'EXPENSE', amount: 2000 }),
      ];

      const result = computeHistoricalAverages(transactions, 1);
      expect(result.avgDailySpendingCents).toBeGreaterThan(0);
      expect(result.totalDays).toBeGreaterThan(0);
    });

    it('computes daily income average from past transactions', () => {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      const dateStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-15`;

      const transactions = [makeTx({ date: dateStr, type: 'INCOME', amount: 500000 })];

      const result = computeHistoricalAverages(transactions, 1);
      expect(result.avgDailyIncomeCents).toBeGreaterThan(0);
    });

    it('ignores transfer transactions', () => {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      const dateStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-15`;

      const transactions = [makeTx({ date: dateStr, type: 'TRANSFER', amount: 10000 })];

      const result = computeHistoricalAverages(transactions, 1);
      expect(result.avgDailySpendingCents).toBe(0);
      expect(result.avgDailyIncomeCents).toBe(0);
    });
  });

  describe('computeCurrentMonthSpending', () => {
    it('returns zero for empty transactions', () => {
      const result = computeCurrentMonthSpending([]);
      expect(result.spentCents).toBe(0);
      expect(result.incomeCents).toBe(0);
    });

    it('sums current month expenses', () => {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(Math.min(now.getDate(), 15)).padStart(2, '0')}`;

      const transactions = [
        makeTx({ date: dateStr, type: 'EXPENSE', amount: 5000 }),
        makeTx({ date: dateStr, type: 'EXPENSE', amount: 3000 }),
        makeTx({ date: dateStr, type: 'INCOME', amount: 100000 }),
      ];

      const result = computeCurrentMonthSpending(transactions);
      expect(result.spentCents).toBe(8000);
      expect(result.incomeCents).toBe(100000);
    });
  });

  describe('generatePredictions', () => {
    it('returns predictions for accounts', () => {
      const accounts = [{ id: 'acc-1', name: 'Checking', currentBalance: { amount: 500000 } }];

      const result = generatePredictions(accounts, []);
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].accountName).toBe('Checking');
      expect(result.accounts[0].currentBalanceCents).toBe(500000);
    });

    it('computes total predicted balance across accounts', () => {
      const accounts = [
        { id: 'acc-1', name: 'Checking', currentBalance: { amount: 500000 } },
        { id: 'acc-2', name: 'Savings', currentBalance: { amount: 1000000 } },
      ];

      const result = generatePredictions(accounts, []);
      expect(result.totalCurrentBalanceCents).toBe(1500000);
      expect(typeof result.totalPredictedBalanceCents).toBe('number');
    });

    it('includes end of month date', () => {
      const accounts = [{ id: 'acc-1', name: 'Checking', currentBalance: { amount: 500000 } }];

      const result = generatePredictions(accounts, []);
      expect(result.endOfMonth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('includes days remaining', () => {
      const accounts = [{ id: 'acc-1', name: 'Checking', currentBalance: { amount: 500000 } }];

      const result = generatePredictions(accounts, []);
      expect(result.accounts[0].daysRemaining).toBeGreaterThanOrEqual(0);
    });

    it('calculates confidence based on data availability', () => {
      const accounts = [{ id: 'acc-1', name: 'Checking', currentBalance: { amount: 500000 } }];

      const result = generatePredictions(accounts, []);
      expect(result.accounts[0].confidence).toBeGreaterThanOrEqual(0);
      expect(result.accounts[0].confidence).toBeLessThanOrEqual(1);
    });

    it('assigns trend direction', () => {
      const accounts = [{ id: 'acc-1', name: 'Checking', currentBalance: { amount: 500000 } }];

      const result = generatePredictions(accounts, []);
      expect(['positive', 'negative', 'flat']).toContain(result.accounts[0].trend);
    });

    it('generates timestamp', () => {
      const accounts = [{ id: 'acc-1', name: 'Checking', currentBalance: { amount: 500000 } }];

      const result = generatePredictions(accounts, []);
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
