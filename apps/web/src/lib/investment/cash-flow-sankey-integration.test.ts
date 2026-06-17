// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildCashFlowSankeyRangeReport, resolveCashFlowSankeyDateRange } from './cash-flow-sankey-integration';
import type { CashFlowSankeyTransaction } from './cash-flow-sankey-integration';

const transactions: CashFlowSankeyTransaction[] = [
  { id: 'pay-1', date: '2025-04-01', label: 'Salary', amountCents: 5_000_00, kind: 'INCOME' },
  { id: 'rent', date: '2025-04-03', label: 'Rent', amountCents: -2_000_00, kind: 'EXPENSE' },
  { id: 'brokerage', date: '2025-04-08', label: 'Brokerage', amountCents: -1_000_00, kind: 'SAVINGS' },
  { id: 'coffee', date: '2025-04-10', label: 'Coffee', amountCents: -10_00, kind: 'EXPENSE' },
  { id: 'old', date: '2025-03-10', label: 'Old rent', amountCents: -1_900_00, kind: 'EXPENSE' },
];

describe('resolveCashFlowSankeyDateRange', () => {
  it('resolves month and custom ranges for report-builder presets', () => {
    expect(resolveCashFlowSankeyDateRange({ preset: 'MONTH', month: '2025-04' })).toEqual({
      startDate: '2025-04-01',
      endDate: '2025-04-30',
      label: '2025-04',
    });
    expect(
      resolveCashFlowSankeyDateRange({
        preset: 'CUSTOM',
        customStartDate: '2025-04-05',
        customEndDate: '2025-04-12',
      }).label,
    ).toBe('2025-04-05 to 2025-04-12');
  });
});

describe('buildCashFlowSankeyRangeReport', () => {
  it('filters by range, preserves outflow kinds, exposes Other children, and exports CSV', () => {
    const range = resolveCashFlowSankeyDateRange({ preset: 'MONTH', month: '2025-04' });
    const result = buildCashFlowSankeyRangeReport({ transactions, range, otherThresholdPercent: 1 });

    expect(result.report.totalIncomeCents).toBe(5_000_00);
    expect(result.report.totalOutflowCents).toBe(3_010_00);
    expect(result.report.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Brokerage', kind: 'SAVINGS' })]),
    );
    expect(result.otherGroups[0]).toMatchObject({ label: 'Other expense', amountCents: 10_00 });
    expect(result.otherGroups[0].children[0].label).toBe('Coffee');
    expect(result.csv).toContain('source,target,amountCents');
  });
});
