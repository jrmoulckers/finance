// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure UI-state helpers for editing transaction tax-category metadata.
 *
 * The copy explicitly frames classifications as planning estimates, not tax
 * advice. Persistence layers can store the returned custom-field patch locally
 * without coupling UI components to tax semantics. References: issue #2709.
 */

import {
  buildTaxTag,
  calculateDeductibleAmountCents,
  taxTagFromCustomFields,
  type DeductibleStatus,
  type ReceiptStatus,
  type TaxCategory,
  type TaxTag,
  type TaxTaggableTransaction,
} from './tax-category-tagging';

export type TaxTransactionFilter =
  'uncategorized-for-tax' | 'missing-receipt' | 'review-needed' | 'deductible' | 'non-deductible';

export interface TaxCategoryEditModel {
  readonly transactionId: string;
  readonly category: TaxCategory;
  readonly deductibleStatus: DeductibleStatus;
  readonly deductionPercent: number;
  readonly receiptStatus: ReceiptStatus;
  readonly businessPurposeNote: string;
  readonly copy: string;
}

export interface TaxCategoryBulkEdit {
  readonly category?: TaxCategory;
  readonly deductibleStatus?: DeductibleStatus;
  readonly deductionPercent?: number;
  readonly receiptStatus?: ReceiptStatus;
  readonly businessPurposeNote?: string;
}

export const TAX_CATEGORY_PLANNING_COPY =
  'Tax classifications are planning estimates for review and are not tax, legal, or filing advice.';

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function serializeTaxTagCustomFields(tag: TaxTag): Readonly<Record<string, string>> {
  return {
    'tax.category': tag.category,
    'tax.deductibleStatus': tag.deductibleStatus,
    'tax.deductionPercent': String(clampPercent(tag.deductionPercent)),
    'tax.receiptStatus': tag.receiptStatus,
    'tax.reimbursable': String(tag.reimbursable),
    'tax.capitalized': String(tag.capitalized),
    ...(tag.businessPurposeNote !== undefined
      ? { 'tax.businessPurposeNote': tag.businessPurposeNote }
      : {}),
  };
}

export function buildTaxCategoryEditModel(
  transaction: TaxTaggableTransaction,
): TaxCategoryEditModel {
  const tag = buildTaxTag(transaction);
  return {
    transactionId: transaction.id,
    category: tag.category,
    deductibleStatus: tag.deductibleStatus,
    deductionPercent: tag.deductionPercent,
    receiptStatus: tag.receiptStatus,
    businessPurposeNote: tag.businessPurposeNote ?? '',
    copy: TAX_CATEGORY_PLANNING_COPY,
  };
}

export function buildTaxCategoryCustomFieldPatch(
  edit: TaxCategoryBulkEdit,
): Readonly<Record<string, string>> {
  return {
    ...(edit.category !== undefined ? { 'tax.category': edit.category } : {}),
    ...(edit.deductibleStatus !== undefined
      ? { 'tax.deductibleStatus': edit.deductibleStatus }
      : {}),
    ...(edit.deductionPercent !== undefined
      ? { 'tax.deductionPercent': String(clampPercent(edit.deductionPercent)) }
      : {}),
    ...(edit.receiptStatus !== undefined ? { 'tax.receiptStatus': edit.receiptStatus } : {}),
    ...(edit.businessPurposeNote !== undefined
      ? { 'tax.businessPurposeNote': edit.businessPurposeNote }
      : {}),
  };
}

export function applyTaxCategoryBulkEdit(
  transactions: readonly TaxTaggableTransaction[],
  edit: TaxCategoryBulkEdit,
): TaxTaggableTransaction[] {
  const patch = buildTaxCategoryCustomFieldPatch(edit);
  return transactions.map((transaction) => ({
    ...transaction,
    customFields: { ...(transaction.customFields ?? {}), ...patch },
  }));
}

export function filterTaxTransactions(
  transactions: readonly TaxTaggableTransaction[],
  filter: TaxTransactionFilter,
): TaxTaggableTransaction[] {
  return transactions.filter((transaction) => {
    const saved = taxTagFromCustomFields(transaction);
    const tag = saved ?? buildTaxTag(transaction);
    const deductibleAmount = calculateDeductibleAmountCents(transaction, tag);
    switch (filter) {
      case 'uncategorized-for-tax':
        return saved === null || tag.category === 'REVIEW_NEEDED';
      case 'missing-receipt':
        return tag.receiptStatus === 'MISSING';
      case 'review-needed':
        return tag.category === 'REVIEW_NEEDED' || tag.deductibleStatus === 'REVIEW_NEEDED';
      case 'deductible':
        return deductibleAmount > 0;
      case 'non-deductible':
        return tag.deductibleStatus === 'NON_DEDUCTIBLE';
    }
  });
}
