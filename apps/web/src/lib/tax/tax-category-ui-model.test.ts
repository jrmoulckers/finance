// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { TaxTaggableTransaction } from './tax-category-tagging';
import {
  applyTaxCategoryBulkEdit,
  buildTaxCategoryEditModel,
  filterTaxTransactions,
  serializeTaxTagCustomFields,
  TAX_CATEGORY_PLANNING_COPY,
} from './tax-category-ui-model';

const transactions: TaxTaggableTransaction[] = [
  {
    id: 'office',
    date: '2025-01-01',
    type: 'EXPENSE',
    amountCents: -100_00,
    categoryName: 'Office supplies',
    accountPurpose: 'business',
  },
  {
    id: 'personal',
    date: '2025-01-02',
    type: 'EXPENSE',
    amountCents: -40_00,
    categoryName: 'Groceries',
    accountPurpose: 'personal',
  },
  { id: 'review', date: '2025-01-03', type: 'TRANSFER', amountCents: 10_00 },
];

describe('tax-category-ui-model', () => {
  it('builds edit models with tax-advice disclaimer copy', () => {
    const model = buildTaxCategoryEditModel(transactions[0]);

    expect(model).toMatchObject({
      transactionId: 'office',
      category: 'SCHEDULE_C_EXPENSE',
      receiptStatus: 'MISSING',
    });
    expect(model.copy).toBe(TAX_CATEGORY_PLANNING_COPY);
  });

  it('serializes tax tag custom fields for create/edit persistence', () => {
    const fields = serializeTaxTagCustomFields({
      transactionId: 'office',
      taxYear: 2025,
      category: 'HOME_OFFICE',
      deductibleStatus: 'PARTIALLY_DEDUCTIBLE',
      deductionPercent: 25,
      receiptStatus: 'ATTACHED',
      reimbursable: false,
      capitalized: false,
      businessPurposeNote: 'Studio',
    });

    expect(fields).toMatchObject({
      'tax.category': 'HOME_OFFICE',
      'tax.deductionPercent': '25',
      'tax.businessPurposeNote': 'Studio',
    });
  });

  it('applies bulk tax metadata to selected transactions', () => {
    const [updated] = applyTaxCategoryBulkEdit([transactions[1]], {
      category: 'CHARITABLE_CASH',
      deductibleStatus: 'DEDUCTIBLE',
      deductionPercent: 100,
      receiptStatus: 'ATTACHED',
    });

    expect(updated.customFields).toMatchObject({
      'tax.category': 'CHARITABLE_CASH',
      'tax.receiptStatus': 'ATTACHED',
    });
  });

  it('filters transaction lists by tax review states', () => {
    expect(
      filterTaxTransactions(transactions, 'missing-receipt').map((transaction) => transaction.id),
    ).toEqual(['office']);
    expect(
      filterTaxTransactions(transactions, 'deductible').map((transaction) => transaction.id),
    ).toEqual(['office']);
    expect(
      filterTaxTransactions(transactions, 'non-deductible').map((transaction) => transaction.id),
    ).toEqual(['personal']);
    expect(
      filterTaxTransactions(transactions, 'review-needed').map((transaction) => transaction.id),
    ).toEqual(['review']);
  });
});
