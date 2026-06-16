// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import { detectRecurringTransactions, type RecurringTransactionInput } from './recurring-pattern-detection';

const TRANSACTIONS: RecurringTransactionInput[] = [
  { id: 'n1', date: '2025-01-01', amountCents: -1_599, merchant: 'Netflix', accountId: 'card', categoryId: 'entertainment' },
  { id: 'n2', date: '2025-02-01', amountCents: -1_599, merchant: 'Netflix', accountId: 'card', categoryId: 'entertainment' },
  { id: 'n3', date: '2025-03-01', amountCents: -1_699, merchant: 'Netflix', accountId: 'card', categoryId: 'entertainment' },
  { id: 'p1', date: '2025-01-03', amountCents: 250_000, merchant: 'Payroll ACH', accountId: 'checking', categoryId: 'income' },
  { id: 'p2', date: '2025-01-17', amountCents: 251_000, merchant: 'Payroll ACH', accountId: 'checking', categoryId: 'income' },
  { id: 'p3', date: '2025-01-31', amountCents: 250_500, merchant: 'Payroll ACH', accountId: 'checking', categoryId: 'income' },
  { id: 'x1', date: '2025-01-01', amountCents: -1_000, merchant: 'Random Cafe', accountId: 'card', categoryId: 'dining' },
  { id: 'x2', date: '2025-01-09', amountCents: -5_000, merchant: 'Random Cafe', accountId: 'card', categoryId: 'dining' },
  { id: 'x3', date: '2025-02-22', amountCents: -900, merchant: 'Random Cafe', accountId: 'card', categoryId: 'dining' },
];

describe('detectRecurringTransactions', () => {
  it('detects monthly subscriptions with next expected date and samples', () => {
    const candidates = detectRecurringTransactions(TRANSACTIONS);
    const netflix = candidates.find((candidate) => candidate.merchant === 'netflix');

    expect(netflix).toMatchObject({
      cadence: 'monthly',
      kind: 'subscription',
      nextExpectedDate: '2025-03-31',
      sampleTransactionIds: ['n1', 'n2', 'n3'],
    });
    expect(netflix!.confidence).toBeGreaterThan(0.75);
  });

  it('detects biweekly paychecks despite small amount variance', () => {
    const payroll = detectRecurringTransactions(TRANSACTIONS).find((candidate) => candidate.kind === 'paycheck');

    expect(payroll).toMatchObject({ cadence: 'biweekly', accountId: 'checking' });
    expect(payroll!.amountVarianceRatio).toBeLessThan(0.01);
  });

  it('guards against irregular false positives and skips existing recurring keys', () => {
    const candidates = detectRecurringTransactions(TRANSACTIONS, {
      existingRecurringKeys: ['netflix|card|entertainment|debit'],
    });

    expect(candidates.some((candidate) => candidate.merchant === 'random cafe')).toBe(false);
    expect(candidates.some((candidate) => candidate.merchant === 'netflix')).toBe(false);
    expect(candidates.some((candidate) => candidate.kind === 'paycheck')).toBe(true);
  });
});
