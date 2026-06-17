// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildSharedTaxCategoryConsumerRecords,
  buildTaxReserveDeductibleInputs,
  buildTaxYearEndExportRows,
  classifyTaxReserveTransaction,
  type TaxReserveTaggedTransaction,
} from './tax-tag-integration';

const transactions: TaxReserveTaggedTransaction[] = [
  {
    id: 'explicit',
    date: '2025-01-01',
    type: 'EXPENSE',
    amountCents: -200_00,
    accountPurpose: 'business',
    customFields: {
      'tax.category': 'BUSINESS_MEALS',
      'tax.deductibleStatus': 'PARTIALLY_DEDUCTIBLE',
      'tax.deductionPercent': '50',
      'tax.receiptStatus': 'ATTACHED',
    },
  },
  { id: 'fallback', date: '2025-01-02', type: 'EXPENSE', amountCents: -125_00, accountPurpose: 'business' },
  { id: 'income', date: '2025-01-03', type: 'INCOME', amountCents: 500_00, accountPurpose: 'business' },
];

describe('tax-tag-integration', () => {
  it('prefers explicit tax tags over business-account heuristics for reserve inputs', () => {
    const explicit = classifyTaxReserveTransaction(transactions[0]);

    expect(explicit).toMatchObject({
      transactionId: 'explicit',
      category: 'BUSINESS_MEALS',
      deductibleAmountCents: 100_00,
      receiptStatus: 'ATTACHED',
      source: 'explicit-tax-tag',
    });
  });

  it('falls back to business-account heuristics when tags are absent', () => {
    const inputs = buildTaxReserveDeductibleInputs(transactions, 2025);

    expect(inputs.find((row) => row.transactionId === 'fallback')).toMatchObject({
      category: 'SCHEDULE_C_EXPENSE',
      deductibleStatus: 'REVIEW_NEEDED',
      receiptStatus: 'MISSING',
      source: 'business-account-heuristic',
    });
    expect(inputs.find((row) => row.transactionId === 'income')).toMatchObject({ category: 'SCHEDULE_C_INCOME' });
  });

  it('builds year-end export rows with tax category, receipt status, and review flags', () => {
    const rows = buildTaxYearEndExportRows(transactions, 2025);

    expect(rows.find((row) => row.transactionId === 'explicit')).toMatchObject({
      taxYear: 2025,
      category: 'BUSINESS_MEALS',
      deductibleAmountCents: 100_00,
      receiptMissing: false,
      reviewFlags: '',
    });
    expect(rows.find((row) => row.transactionId === 'fallback')?.reviewFlags).toBe('missing-receipt|review-needed');
  });

  it('produces shared category records for deduction helper consumers', () => {
    const records = buildSharedTaxCategoryConsumerRecords(transactions, 2025);

    expect(records[0]).toMatchObject({ transactionId: 'explicit', taxCategory: 'BUSINESS_MEALS' });
    expect(records.map((record) => record.transactionId)).toEqual(['explicit', 'fallback', 'income']);
  });
});
