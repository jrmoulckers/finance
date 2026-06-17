// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  createExpectedIncomeRecord,
  deriveExpectedIncomeStatus,
  linkExpectedIncomeToClearedTransaction,
  summarizeExpectedIncome,
} from './expected-income-lifecycle';

describe('expected income lifecycle', () => {
  it('marks unreliable child support late without counting it as spendable', () => {
    const record = createExpectedIncomeRecord({
      id: 'income-1',
      sourceType: 'child_support',
      sourceName: 'Child support',
      amountCents: 50_000,
      expectedDate: '2026-02-06',
      expectedWindowDays: 1,
      reliability: 'low',
      now: '2026-02-01T00:00:00Z',
    });

    expect(deriveExpectedIncomeStatus(record, '2026-02-08')).toBe('late');
    const summary = summarizeExpectedIncome({ records: [record], asOfDate: '2026-02-08' });

    expect(summary.atRiskCashCents).toBe(50_000);
    expect(summary.spendablePlanningCashCents).toBe(0);
    expect(summary.calmDashboardCopy).toContain('shown separately');
  });

  it('links partial cleared deposits without double-counting expected cash', () => {
    const record = createExpectedIncomeRecord({
      id: 'income-1',
      sourceType: 'freelance',
      sourceName: 'Client',
      amountCents: 80_000,
      expectedDate: '2026-02-06',
    });
    const linked = linkExpectedIncomeToClearedTransaction({
      record,
      transactionId: 'tx-1',
      clearedAmountCents: 30_000,
      now: '2026-02-07T00:00:00Z',
    });

    const summary = summarizeExpectedIncome({ records: [linked], asOfDate: '2026-02-07' });

    expect(linked.status).toBe('partial');
    expect(summary.clearedCashCents).toBe(30_000);
    expect(summary.atRiskCashCents).toBe(50_000);
    expect(summary.spendablePlanningCashCents).toBe(30_000);
  });
});
