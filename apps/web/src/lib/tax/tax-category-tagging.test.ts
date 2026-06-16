// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildTaxTag,
  calculateDeductibleAmountCents,
  suggestTaxCategory,
  summarizeTaxCategories,
  tagTaxTransactions,
  taxTagFromCustomFields,
  type TaxTaggableTransaction,
} from './tax-category-tagging';

const OFFICE_EXPENSE: TaxTaggableTransaction = {
  id: 'txn-office',
  date: '2025-02-10',
  type: 'EXPENSE',
  amountCents: -150_00,
  categoryName: 'Office supplies',
  payee: 'Office Depot',
  accountPurpose: 'business',
};

describe('tax-category-tagging', () => {
  it('suggests ordinary Schedule C expenses from category/payee signals', () => {
    const suggestion = suggestTaxCategory(OFFICE_EXPENSE);

    expect(suggestion.category).toBe('SCHEDULE_C_EXPENSE');
    expect(suggestion.deductibleStatus).toBe('DEDUCTIBLE');
    expect(suggestion.deductionPercent).toBe(100);
    expect(suggestion.receiptStatus).toBe('MISSING');
  });

  it('uses 50% partial deduction for likely business meals', () => {
    const meal: TaxTaggableTransaction = {
      id: 'txn-meal',
      date: '2025-03-01',
      type: 'EXPENSE',
      amountCents: -80_00,
      categoryName: 'Restaurants',
      payee: 'Client lunch cafe',
      accountPurpose: 'business',
    };

    const tag = buildTaxTag(meal);

    expect(tag.category).toBe('BUSINESS_MEALS');
    expect(tag.deductibleStatus).toBe('PARTIALLY_DEDUCTIBLE');
    expect(calculateDeductibleAmountCents(meal, tag)).toBe(40_00);
  });

  it('prefers saved custom fields used by tax reserve integrations', () => {
    const transaction: TaxTaggableTransaction = {
      ...OFFICE_EXPENSE,
      customFields: {
        'tax.category': 'HOME_OFFICE',
        'tax.deductibleStatus': 'PARTIALLY_DEDUCTIBLE',
        'tax.deductionPercent': '25',
        'tax.receiptStatus': 'ATTACHED',
        'tax.businessPurposeNote': 'Dedicated studio space',
      },
    };

    const tag = taxTagFromCustomFields(transaction);

    expect(tag).toMatchObject({
      category: 'HOME_OFFICE',
      deductibleStatus: 'PARTIALLY_DEDUCTIBLE',
      deductionPercent: 25,
      receiptStatus: 'ATTACHED',
      businessPurposeNote: 'Dedicated studio space',
    });
  });

  it('applies prior user rules before heuristics', () => {
    const transaction: TaxTaggableTransaction = {
      id: 'txn-prior',
      date: '2025-04-01',
      type: 'EXPENSE',
      amountCents: -25_00,
      payee: 'Acme Vendor',
      categoryName: 'Misc',
    };

    const tag = buildTaxTag(transaction, [
      {
        payee: 'Acme Vendor',
        suggestion: {
          category: 'REIMBURSABLE',
          deductibleStatus: 'REIMBURSABLE',
          deductionPercent: 0,
          receiptStatus: 'NOT_REQUIRED',
          confidence: 0.95,
        },
      },
    ]);

    expect(tag.category).toBe('REIMBURSABLE');
    expect(tag.reimbursable).toBe(true);
  });

  it('summarizes tax-year deductible totals and review queues', () => {
    const transactions: TaxTaggableTransaction[] = [
      OFFICE_EXPENSE,
      {
        id: 'txn-meal',
        date: '2025-03-01',
        type: 'EXPENSE',
        amountCents: -80_00,
        categoryName: 'Meal',
        accountPurpose: 'business',
      },
      {
        id: 'txn-review',
        date: '2025-03-02',
        type: 'EXPENSE',
        amountCents: -500_00,
        categoryName: 'Unknown business purchase',
        accountPurpose: 'business',
      },
      {
        id: 'txn-prior-year',
        date: '2024-12-31',
        type: 'EXPENSE',
        amountCents: -999_00,
        categoryName: 'Office supplies',
        accountPurpose: 'business',
      },
    ];

    const summary = summarizeTaxCategories(transactions, 2025);

    expect(summary.totalDeductibleAmountCents).toBe(190_00);
    expect(summary.missingReceiptTransactionIds).toContain('txn-office');
    expect(summary.reviewTransactionIds).toContain('txn-review');
    expect(summary.uncategorizedTransactionIds).toContain('txn-review');
    expect(summary.rows.map((row) => row.category)).toContain('SCHEDULE_C_EXPENSE');
  });

  it('returns tagged transactions with deductible amount and review flags', () => {
    const [tagged] = tagTaxTransactions([OFFICE_EXPENSE]);

    expect(tagged.deductibleAmountCents).toBe(150_00);
    expect(tagged.needsReview).toBe(true);
  });
});
