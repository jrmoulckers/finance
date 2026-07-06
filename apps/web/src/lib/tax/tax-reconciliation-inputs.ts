// SPDX-License-Identifier: BUSL-1.1

/**
 * Pure data-capture models for tax reconciliation evidence.
 *
 * Receipt, 1099, and checklist fields feed the Tax Center quality flags without
 * assuming any backend storage shape. References: issue #2635.
 */

export type TaxReceiptStatus = 'not-required' | 'required-attached' | 'required-missing';
export type TaxForm1099Status =
  'not-expected' | 'expected' | 'received' | 'reconciled' | 'variance';
export type TaxReconciliationChecklistStatus = 'open' | 'done';

export interface TaxReconciliationTransactionInput {
  readonly id: string;
  readonly taxYear: number;
  readonly label: string;
  readonly amountCents: number;
  readonly deductible: boolean;
  readonly charitable: boolean;
  readonly receiptRequired?: boolean;
  readonly receiptId?: string;
}

export interface TaxReceiptMarker {
  readonly transactionId: string;
  readonly taxYear: number;
  readonly status: TaxReceiptStatus;
  readonly label: string;
}

export interface TaxForm1099Input {
  readonly id: string;
  readonly taxYear: number;
  readonly payerName: string;
  readonly formType:
    '1099-NEC' | '1099-MISC' | '1099-K' | '1099-INT' | '1099-DIV' | '1099-B' | 'OTHER';
  readonly expectedAmountCents?: number;
  readonly receivedAmountCents?: number;
  readonly reconciled?: boolean;
}

export interface TaxForm1099Reconciliation {
  readonly formId: string;
  readonly taxYear: number;
  readonly payerName: string;
  readonly formType: TaxForm1099Input['formType'];
  readonly status: TaxForm1099Status;
  readonly varianceCents: number;
}

export interface TaxChecklistInput {
  readonly id: string;
  readonly taxYear: number;
  readonly label: string;
  readonly status: TaxReconciliationChecklistStatus;
}

export interface TaxReconciliationSummary {
  readonly taxYear: number;
  readonly receiptMarkers: readonly TaxReceiptMarker[];
  readonly missingReceiptTransactionIds: readonly string[];
  readonly forms1099: readonly TaxForm1099Reconciliation[];
  readonly unreconciledFormIds: readonly string[];
  readonly openChecklistItems: readonly TaxChecklistInput[];
}

function receiptStatus(input: TaxReconciliationTransactionInput): TaxReceiptStatus {
  if (!input.deductible && !input.charitable && input.receiptRequired !== true)
    return 'not-required';
  return input.receiptId === undefined || input.receiptId.trim() === ''
    ? 'required-missing'
    : 'required-attached';
}

export function buildTaxReceiptMarkers(
  transactions: readonly TaxReconciliationTransactionInput[],
  taxYear: number,
): TaxReceiptMarker[] {
  return transactions
    .filter((transaction) => transaction.taxYear === taxYear)
    .map((transaction) => ({
      transactionId: transaction.id,
      taxYear,
      status: receiptStatus(transaction),
      label: transaction.label,
    }));
}

export function reconcileTaxForm1099(input: TaxForm1099Input): TaxForm1099Reconciliation {
  const expected = input.expectedAmountCents;
  const received = input.receivedAmountCents;
  const varianceCents = expected !== undefined && received !== undefined ? received - expected : 0;
  const status: TaxForm1099Status =
    expected === undefined
      ? 'not-expected'
      : received === undefined
        ? 'expected'
        : input.reconciled === true && varianceCents === 0
          ? 'reconciled'
          : varianceCents !== 0
            ? 'variance'
            : 'received';

  return {
    formId: input.id,
    taxYear: input.taxYear,
    payerName: input.payerName,
    formType: input.formType,
    status,
    varianceCents,
  };
}

export function buildTaxReconciliationSummary(input: {
  readonly taxYear: number;
  readonly transactions: readonly TaxReconciliationTransactionInput[];
  readonly forms1099?: readonly TaxForm1099Input[];
  readonly checklistItems?: readonly TaxChecklistInput[];
}): TaxReconciliationSummary {
  const receiptMarkers = buildTaxReceiptMarkers(input.transactions, input.taxYear);
  const forms1099 = (input.forms1099 ?? [])
    .filter((form) => form.taxYear === input.taxYear)
    .map(reconcileTaxForm1099);
  const openChecklistItems = (input.checklistItems ?? []).filter(
    (item) => item.taxYear === input.taxYear && item.status === 'open',
  );

  return {
    taxYear: input.taxYear,
    receiptMarkers,
    missingReceiptTransactionIds: receiptMarkers
      .filter((marker) => marker.status === 'required-missing')
      .map((marker) => marker.transactionId),
    forms1099,
    unreconciledFormIds: forms1099
      .filter(
        (form) =>
          form.status === 'expected' || form.status === 'received' || form.status === 'variance',
      )
      .map((form) => form.formId),
    openChecklistItems,
  };
}
