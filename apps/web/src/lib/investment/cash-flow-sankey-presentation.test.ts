// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildCashFlowSankey } from './cash-flow-sankey';
import { buildCashFlowSankeyPresentation } from './cash-flow-sankey-presentation';

describe('buildCashFlowSankeyPresentation', () => {
  it('creates chart nodes, legend entries, and accessible rows for every flow kind', () => {
    const report = buildCashFlowSankey({
      income: [{ id: 'salary', label: 'Salary', amountCents: 5_000_00, kind: 'INCOME' }],
      outflows: [
        { id: 'rent', label: 'Rent', amountCents: 2_000_00, kind: 'EXPENSE' },
        { id: 'transfer', label: 'Brokerage transfer', amountCents: 500_00, kind: 'TRANSFER' },
        { id: 'loan', label: 'Student loan', amountCents: 300_00, kind: 'DEBT' },
        { id: 'saving', label: 'Emergency fund', amountCents: 200_00, kind: 'SAVINGS' },
      ],
      otherThresholdPercent: 0,
    });

    const presentation = buildCashFlowSankeyPresentation(report);

    expect(presentation.legend.map((item) => item.token)).toEqual(
      expect.arrayContaining(['expense', 'transfer', 'debt', 'savings']),
    );
    expect(presentation.tableRows).toHaveLength(report.links.length);
    expect(presentation.tableRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetLabel: 'Brokerage transfer', colorToken: 'transfer' }),
        expect.objectContaining({ targetLabel: 'Student loan', colorToken: 'debt' }),
        expect.objectContaining({ targetLabel: 'Emergency fund', colorToken: 'savings' }),
      ]),
    );
    expect(presentation.ariaLabel).toContain('equivalent table');
  });
});
