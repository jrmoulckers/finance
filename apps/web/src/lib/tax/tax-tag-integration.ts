// SPDX-License-Identifier: BUSL-1.1

/**
 * Shared tax-tag integration adapters for reserve, year-end export, and helpers.
 *
 * Explicit tax tags win. When no saved tax metadata exists, business-account
 * expense/income heuristics are used as a conservative planning fallback only.
 * References: issue #2710.
 */

import {
  calculateDeductibleAmountCents,
  taxTagFromCustomFields,
  type DeductibleStatus,
  type ReceiptStatus,
  type TaxCategory,
  type TaxTaggableTransaction,
} from './tax-category-tagging';

export interface TaxReserveTaggedTransaction extends TaxTaggableTransaction {
  readonly accountPurpose?: 'personal' | 'business' | 'both';
}

export interface TaxReserveDeductibleInput {
  readonly transactionId: string;
  readonly taxYear: number;
  readonly category: TaxCategory;
  readonly deductibleStatus: DeductibleStatus;
  readonly deductibleAmountCents: number;
  readonly receiptStatus: ReceiptStatus;
  readonly reviewNeeded: boolean;
  readonly source: 'explicit-tax-tag' | 'business-account-heuristic';
}

export interface TaxYearEndExportRow extends TaxReserveDeductibleInput {
  readonly grossAmountCents: number;
  readonly receiptMissing: boolean;
  readonly reviewFlags: string;
}

function taxYearFromDate(date: string): number {
  const year = Number.parseInt(date.slice(0, 4), 10);
  if (!Number.isInteger(year)) throw new Error(`Invalid tax transaction date: ${date}`);
  return year;
}

function fallbackForBusinessAccount(
  transaction: TaxReserveTaggedTransaction,
): TaxReserveDeductibleInput | null {
  const taxYear = taxYearFromDate(transaction.date);
  if (transaction.type === 'INCOME' && transaction.accountPurpose !== 'personal') {
    return {
      transactionId: transaction.id,
      taxYear,
      category: 'SCHEDULE_C_INCOME',
      deductibleStatus: 'NON_DEDUCTIBLE',
      deductibleAmountCents: 0,
      receiptStatus: 'NOT_REQUIRED',
      reviewNeeded: false,
      source: 'business-account-heuristic',
    };
  }
  if (
    transaction.type === 'EXPENSE' &&
    (transaction.accountPurpose === 'business' || transaction.accountPurpose === 'both')
  ) {
    return {
      transactionId: transaction.id,
      taxYear,
      category: 'SCHEDULE_C_EXPENSE',
      deductibleStatus: 'REVIEW_NEEDED',
      deductibleAmountCents: 0,
      receiptStatus: Math.abs(transaction.amountCents) >= 75_00 ? 'MISSING' : 'NOT_REQUIRED',
      reviewNeeded: true,
      source: 'business-account-heuristic',
    };
  }
  return null;
}

export function classifyTaxReserveTransaction(
  transaction: TaxReserveTaggedTransaction,
): TaxReserveDeductibleInput | null {
  const explicit = taxTagFromCustomFields(transaction);
  if (explicit !== null) {
    const deductibleAmountCents = calculateDeductibleAmountCents(transaction, explicit);
    return {
      transactionId: transaction.id,
      taxYear: explicit.taxYear,
      category: explicit.category,
      deductibleStatus: explicit.deductibleStatus,
      deductibleAmountCents,
      receiptStatus: explicit.receiptStatus,
      reviewNeeded:
        explicit.category === 'REVIEW_NEEDED' ||
        explicit.deductibleStatus === 'REVIEW_NEEDED' ||
        explicit.receiptStatus === 'MISSING',
      source: 'explicit-tax-tag',
    };
  }

  return fallbackForBusinessAccount(transaction);
}

export function buildTaxReserveDeductibleInputs(
  transactions: readonly TaxReserveTaggedTransaction[],
  taxYear: number,
): TaxReserveDeductibleInput[] {
  return transactions
    .map(classifyTaxReserveTransaction)
    .filter((row): row is TaxReserveDeductibleInput => row !== null && row.taxYear === taxYear);
}

export function buildTaxYearEndExportRows(
  transactions: readonly TaxReserveTaggedTransaction[],
  taxYear: number,
): TaxYearEndExportRow[] {
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  return buildTaxReserveDeductibleInputs(transactions, taxYear).map((input) => {
    const transaction = byId.get(input.transactionId);
    const flags = [
      ...(input.receiptStatus === 'MISSING' ? ['missing-receipt'] : []),
      ...(input.reviewNeeded ? ['review-needed'] : []),
    ];
    return {
      ...input,
      grossAmountCents: Math.abs(transaction?.amountCents ?? 0),
      receiptMissing: input.receiptStatus === 'MISSING',
      reviewFlags: flags.join('|'),
    };
  });
}

export function buildSharedTaxCategoryConsumerRecords(
  transactions: readonly TaxReserveTaggedTransaction[],
  taxYear: number,
): ReadonlyArray<Readonly<Record<string, string | number | boolean>>> {
  return buildTaxYearEndExportRows(transactions, taxYear).map((row) => ({
    transactionId: row.transactionId,
    taxCategory: row.category,
    deductibleAmountCents: row.deductibleAmountCents,
    receiptStatus: row.receiptStatus,
    reviewNeeded: row.reviewNeeded,
    source: row.source,
  }));
}
