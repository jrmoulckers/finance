// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { TaxYearSummaryReport } from '../reports/tax-year-summary';
import { buildTaxSummaryPrintableExport } from './tax-summary-printable-export';

const report: TaxYearSummaryReport = {
  taxYear: 2025,
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31',
  ordinaryIncomeCents: 100_00,
  selfEmploymentIncomeCents: 0,
  deductibleExpensesCents: 25_00,
  charitableGivingCents: 0,
  shortTermGainLossCents: 5_00,
  longTermGainLossCents: 0,
  washSaleAddbacksCents: 0,
  estimatedTaxPaymentsCents: 20_00,
  sections: [
    {
      key: 'ordinary-income',
      label: 'Ordinary income',
      amountCents: 100_00,
      sourceLinks: [{ type: 'transaction', id: 'txn-1', label: 'Wages' }],
    },
    {
      key: 'estimated-payments',
      label: 'Estimated tax payments',
      amountCents: 20_00,
      sourceLinks: [{ type: 'estimated-payment', id: 'pay-q1', label: 'Q1 paid' }],
    },
  ],
  qualityFlags: [
    {
      id: 'missing-receipt:txn-2',
      severity: 'warning',
      label: 'Deductible transaction is missing a receipt.',
      sourceLinks: [{ type: 'transaction', id: 'txn-2', label: 'Office' }],
    },
  ],
  notes: ['Recorded data only.'],
  csvRows: [],
};

describe('tax-summary-printable-export', () => {
  it('builds CSV, printable HTML, and drill-down links from report sections and flags', () => {
    const output = buildTaxSummaryPrintableExport(report);

    expect(output.csv.split('\n')[0]).toBe('sectionKey,sectionLabel,amountCents,sourceCount,sourceIds');
    expect(output.csv).toContain('ordinary-income,Ordinary income,10000,1,transaction:txn-1');
    expect(output.printableHtml).toContain('Tax Center summary 2025');
    expect(output.printableHtml).toContain('not tax advice');
    expect(output.sourceLinks.map((link) => link.id)).toEqual(['pay-q1', 'txn-1', 'txn-2']);
    expect(output.sourceLinks.find((link) => link.id === 'txn-2')?.href).toBe('#transaction%3Atxn-2');
  });
});
