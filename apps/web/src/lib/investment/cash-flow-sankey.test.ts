// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildCashFlowSankey, exportCashFlowSankeyCsv } from './cash-flow-sankey';

describe('buildCashFlowSankey', () => {
  it('builds income-to-outflow links with a surplus node', () => {
    const report = buildCashFlowSankey({
      income: [
        { id: 'salary', label: 'Salary', amountCents: 5_000_00, kind: 'INCOME' },
        { id: 'interest', label: 'Interest', amountCents: 50_00, kind: 'INCOME' },
      ],
      outflows: [
        { id: 'rent', label: 'Rent', amountCents: 2_000_00, kind: 'EXPENSE' },
        { id: 'groceries', label: 'Groceries', amountCents: 700_00, kind: 'EXPENSE' },
        { id: 'tiny', label: 'Tiny category', amountCents: 10_00, kind: 'EXPENSE' },
      ],
      otherThresholdPercent: 1,
    });

    expect(report.totalIncomeCents).toBe(5_050_00);
    expect(report.netCashFlowCents).toBe(2_340_00);
    expect(report.nodes.some((node) => node.id === 'surplus')).toBe(true);
    expect(report.nodes.some((node) => node.id === 'outflow:expense-other')).toBe(true);
    expect(report.accessibleRows).toHaveLength(report.links.length);
  });

  it('adds a deficit funding node when outflows exceed income', () => {
    const report = buildCashFlowSankey({
      income: [{ id: 'salary', label: 'Salary', amountCents: 1_000_00, kind: 'INCOME' }],
      outflows: [{ id: 'rent', label: 'Rent', amountCents: 2_000_00, kind: 'EXPENSE' }],
    });

    expect(report.netCashFlowCents).toBe(-1_000_00);
    expect(report.links).toContainEqual({
      source: 'deficit',
      target: 'available-cash',
      amountCents: 1_000_00,
    });
  });
});

describe('exportCashFlowSankeyCsv', () => {
  it('exports flow table rows', () => {
    expect(exportCashFlowSankeyCsv([{ source: 'a', target: 'b', amountCents: 123 }])).toBe(
      'source,target,amountCents\na,b,123',
    );
  });
});
