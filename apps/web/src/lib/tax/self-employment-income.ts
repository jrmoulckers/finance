// SPDX-License-Identifier: BUSL-1.1

/**
 * 1099 and self-employment income tracking helpers for tax beta issue #2270.
 *
 * Amounts are integer cents. Form labels intentionally model the common payer
 * statements contractors reconcile against: Forms 1099-NEC, 1099-MISC, 1099-K,
 * cash/no-form income, and other manually reviewed income.
 */

import type { LocalDate, Transaction } from '../../kmp/bridge';

export const SELF_EMPLOYMENT_INCOME_FIELD = 'tax.selfEmploymentIncome';
export const SELF_EMPLOYMENT_FORM_TYPE_FIELD = 'tax.selfEmploymentFormType';

export type SelfEmploymentFormType = '1099_NEC' | '1099_MISC' | '1099_K' | 'CASH' | 'OTHER';
export type ExpectedTaxFormStatus =
  | 'NOT_EXPECTED'
  | 'EXPECTED'
  | 'RECEIVED'
  | 'RECONCILED'
  | 'MISSING';

export interface SelfEmploymentIncomeRecord {
  readonly id: string;
  readonly transactionId?: string;
  readonly taxYear: number;
  readonly date: LocalDate;
  readonly payerName: string;
  readonly payerTinLast4?: string;
  readonly formType: SelfEmploymentFormType;
  readonly expectedFormStatus: ExpectedTaxFormStatus;
  readonly grossIncomeCents: number;
  readonly netDepositCents?: number;
  readonly processorFeesCents?: number;
  readonly refundsCents?: number;
  readonly chargebacksCents?: number;
  readonly notes?: string;
}

export interface EnteredTaxFormAmount {
  readonly payerName: string;
  readonly formType: SelfEmploymentFormType;
  readonly reportedGrossCents: number;
  readonly receivedDate?: LocalDate;
}

export interface PayerIncomeSummary {
  readonly payerName: string;
  readonly payerTinLast4: string | null;
  readonly formType: SelfEmploymentFormType;
  readonly grossIncomeCents: number;
  readonly netDepositCents: number;
  readonly processorFeesCents: number;
  readonly refundsCents: number;
  readonly chargebacksCents: number;
  readonly recordCount: number;
  readonly expectedFormStatus: ExpectedTaxFormStatus;
  readonly missingPayerDetails: boolean;
}

export type IncomeReconciliationStatus =
  | 'MATCH'
  | 'VARIANCE'
  | 'MISSING_FORM'
  | 'FORM_WITHOUT_TRANSACTIONS';

export interface IncomeReconciliationResult {
  readonly payerName: string;
  readonly formType: SelfEmploymentFormType;
  readonly transactionGrossCents: number;
  readonly formGrossCents: number | null;
  readonly varianceCents: number;
  readonly status: IncomeReconciliationStatus;
}

function normalizePayerName(payerName: string): string {
  const trimmed = payerName.trim();
  return trimmed.length > 0 ? trimmed : 'Unknown payer';
}

function groupingKey(payerName: string, formType: SelfEmploymentFormType): string {
  return `${normalizePayerName(payerName).toLocaleUpperCase()}::${formType}`;
}

function parseBoolean(value: string | undefined): boolean {
  return value === 'true' || value === '1' || value === 'yes';
}

export function isSelfEmploymentIncomeTransaction(
  transaction: Pick<Transaction, 'type' | 'customFields'>,
): boolean {
  if (transaction.type !== 'INCOME') {
    return false;
  }

  const fields = transaction.customFields ?? {};
  return parseBoolean(fields[SELF_EMPLOYMENT_INCOME_FIELD] ?? fields['tax.selfEmployment']);
}

export function filterSelfEmploymentIncomeByYear(
  records: readonly SelfEmploymentIncomeRecord[],
  taxYear: number,
): SelfEmploymentIncomeRecord[] {
  return records.filter((record) => record.taxYear === taxYear || record.date.startsWith(String(taxYear)));
}

export function summarizeSelfEmploymentIncome(
  records: readonly SelfEmploymentIncomeRecord[],
  taxYear: number,
): PayerIncomeSummary[] {
  const groups = new Map<string, SelfEmploymentIncomeRecord[]>();

  for (const record of filterSelfEmploymentIncomeByYear(records, taxYear)) {
    const key = groupingKey(record.payerName, record.formType);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  return [...groups.values()]
    .map((payerRecords) => {
      const first = payerRecords[0];
      const statuses = payerRecords.map((record) => record.expectedFormStatus);
      const expectedFormStatus = statuses.includes('MISSING')
        ? 'MISSING'
        : statuses.includes('EXPECTED')
          ? 'EXPECTED'
          : statuses.includes('RECEIVED')
            ? 'RECEIVED'
            : statuses.includes('RECONCILED')
              ? 'RECONCILED'
              : 'NOT_EXPECTED';

      return {
        payerName: normalizePayerName(first.payerName),
        payerTinLast4: first.payerTinLast4 ?? null,
        formType: first.formType,
        grossIncomeCents: payerRecords.reduce((sum, record) => sum + record.grossIncomeCents, 0),
        netDepositCents: payerRecords.reduce(
          (sum, record) => sum + (record.netDepositCents ?? record.grossIncomeCents),
          0,
        ),
        processorFeesCents: payerRecords.reduce(
          (sum, record) => sum + (record.processorFeesCents ?? 0),
          0,
        ),
        refundsCents: payerRecords.reduce((sum, record) => sum + (record.refundsCents ?? 0), 0),
        chargebacksCents: payerRecords.reduce(
          (sum, record) => sum + (record.chargebacksCents ?? 0),
          0,
        ),
        recordCount: payerRecords.length,
        expectedFormStatus,
        missingPayerDetails:
          normalizePayerName(first.payerName) === 'Unknown payer' || first.payerTinLast4 === undefined,
      } satisfies PayerIncomeSummary;
    })
    .sort((a, b) => a.payerName.localeCompare(b.payerName) || a.formType.localeCompare(b.formType));
}

export function reconcileSelfEmploymentIncome(
  summaries: readonly PayerIncomeSummary[],
  forms: readonly EnteredTaxFormAmount[],
  varianceThresholdCents = 100,
): IncomeReconciliationResult[] {
  const formMap = new Map<string, EnteredTaxFormAmount>();
  for (const form of forms) {
    formMap.set(groupingKey(form.payerName, form.formType), form);
  }

  const results: IncomeReconciliationResult[] = summaries.map((summary) => {
    const form = formMap.get(groupingKey(summary.payerName, summary.formType));
    const formGrossCents = form?.reportedGrossCents ?? null;
    const varianceCents = formGrossCents === null ? summary.grossIncomeCents : formGrossCents - summary.grossIncomeCents;
    const status: IncomeReconciliationStatus =
      formGrossCents === null
        ? 'MISSING_FORM'
        : Math.abs(varianceCents) > varianceThresholdCents
          ? 'VARIANCE'
          : 'MATCH';

    return {
      payerName: summary.payerName,
      formType: summary.formType,
      transactionGrossCents: summary.grossIncomeCents,
      formGrossCents,
      varianceCents,
      status,
    };
  });

  for (const form of forms) {
    if (summaries.some((summary) => groupingKey(summary.payerName, summary.formType) === groupingKey(form.payerName, form.formType))) {
      continue;
    }

    results.push({
      payerName: normalizePayerName(form.payerName),
      formType: form.formType,
      transactionGrossCents: 0,
      formGrossCents: form.reportedGrossCents,
      varianceCents: form.reportedGrossCents,
      status: 'FORM_WITHOUT_TRANSACTIONS',
    });
  }

  return results.sort((a, b) => a.payerName.localeCompare(b.payerName) || a.formType.localeCompare(b.formType));
}

export function buildSelfEmploymentIncomeExportRows(
  summaries: readonly PayerIncomeSummary[],
): ReadonlyArray<Readonly<Record<string, string | number | boolean | null>>> {
  return summaries.map((summary) => ({
    payerName: summary.payerName,
    payerTinLast4: summary.payerTinLast4,
    formType: summary.formType,
    grossIncomeCents: summary.grossIncomeCents,
    netDepositCents: summary.netDepositCents,
    processorFeesCents: summary.processorFeesCents,
    refundsCents: summary.refundsCents,
    chargebacksCents: summary.chargebacksCents,
    recordCount: summary.recordCount,
    expectedFormStatus: summary.expectedFormStatus,
    missingPayerDetails: summary.missingPayerDetails,
  }));
}
