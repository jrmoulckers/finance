// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { TaxYearSummaryReport } from '../reports/tax-year-summary';
import { buildTaxPreparerReviewPackage } from './tax-preparer-review-package';

const report: TaxYearSummaryReport = {
  taxYear: 2025,
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31',
  ordinaryIncomeCents: 100_00,
  selfEmploymentIncomeCents: 0,
  deductibleExpensesCents: 25_00,
  charitableGivingCents: 0,
  shortTermGainLossCents: 0,
  longTermGainLossCents: 0,
  washSaleAddbacksCents: 0,
  estimatedTaxPaymentsCents: 0,
  sections: [
    {
      key: 'deductible-expenses',
      label: 'Deductible expenses',
      amountCents: 25_00,
      sourceLinks: [{ type: 'transaction', id: 'office', label: 'Office supplies' }],
    },
  ],
  qualityFlags: [
    { id: 'missing-receipt:office', severity: 'warning', label: 'Missing receipt', sourceLinks: [] },
    { id: 'uncategorized:client', severity: 'warning', label: 'Uncategorized', sourceLinks: [] },
  ],
  notes: [],
  csvRows: [],
};

describe('tax-preparer-review-package', () => {
  it('creates stable CSV schemas, rows, section order, and validation counts', () => {
    const pkg = buildTaxPreparerReviewPackage({
      report,
      reconciliation: {
        taxYear: 2025,
        receiptMarkers: [],
        missingReceiptTransactionIds: ['office'],
        forms1099: [],
        unreconciledFormIds: ['nec'],
        openChecklistItems: [{ id: 'todo', taxYear: 2025, label: 'Upload NEC', status: 'open' }],
      },
    });

    expect(pkg.csvSchemas['summary-sections']).toEqual(['taxYear', 'sectionKey', 'sectionLabel', 'amountCents', 'sourceCount']);
    expect(pkg.csvRows['summary-sections'][0]).toMatchObject({ sectionKey: 'deductible-expenses', amountCents: 25_00 });
    expect(pkg.csvRows['source-links'][0]).toMatchObject({ sourceType: 'transaction', sourceId: 'office' });
    expect(pkg.printableSectionOrder.at(-1)).toBe('validation-summary');
    expect(pkg.validationSummary).toEqual({
      missingReceiptCount: 1,
      uncategorizedTaxTransactionCount: 1,
      unreconciledFormCount: 1,
      openChecklistItemCount: 1,
    });
    expect(pkg.explanatoryNotes.join(' ')).toContain('not legal or tax advice');
  });
});
