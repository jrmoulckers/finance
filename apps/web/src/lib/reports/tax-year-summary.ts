// SPDX-License-Identifier: BUSL-1.1

import type { Category, LocalDate, SyncId, Transaction } from '../../kmp/bridge';
import type { CryptoTaxSummary } from '../assets/types';
import type { EstimatedTaxPaymentRecord } from '../tax-reserve';
import { isSelfEmploymentIncomeTransaction } from '../tax/self-employment-income';

export type TaxSummarySectionKey =
  | 'ordinary-income'
  | 'self-employment-income'
  | 'deductible-expenses'
  | 'charitable-giving'
  | 'capital-gains'
  | 'wash-sale-addbacks'
  | 'estimated-payments';

export type TaxSourceType =
  | 'transaction'
  | 'estimated-payment'
  | 'investment-summary'
  | 'manual-entry'
  | 'checklist-item';
export type TaxQualityFlagSeverity = 'info' | 'warning';

export interface TaxSummarySourceLink {
  readonly type: TaxSourceType;
  readonly id: string;
  readonly label: string;
}

export interface TaxYearManualEntry {
  readonly id: string;
  readonly taxYear: number;
  readonly section:
    | 'ordinary-income'
    | 'deductible-expenses'
    | 'charitable-giving'
    | 'wash-sale-addbacks';
  readonly amountCents: number;
  readonly label: string;
}

export interface TaxChecklistItem {
  readonly id: string;
  readonly taxYear: number;
  readonly label: string;
  readonly status: 'open' | 'done';
}

export interface TaxYearSummarySection {
  readonly key: TaxSummarySectionKey;
  readonly label: string;
  readonly amountCents: number;
  readonly sourceLinks: readonly TaxSummarySourceLink[];
}

export interface TaxDataQualityFlag {
  readonly id: string;
  readonly severity: TaxQualityFlagSeverity;
  readonly label: string;
  readonly sourceLinks: readonly TaxSummarySourceLink[];
}

export interface TaxYearSummaryReport {
  readonly taxYear: number;
  readonly periodStart: LocalDate;
  readonly periodEnd: LocalDate;
  readonly ordinaryIncomeCents: number;
  readonly selfEmploymentIncomeCents: number;
  readonly deductibleExpensesCents: number;
  readonly charitableGivingCents: number;
  readonly shortTermGainLossCents: number;
  readonly longTermGainLossCents: number;
  readonly washSaleAddbacksCents: number;
  readonly estimatedTaxPaymentsCents: number;
  readonly sections: readonly TaxYearSummarySection[];
  readonly qualityFlags: readonly TaxDataQualityFlag[];
  readonly notes: readonly string[];
  readonly csvRows: readonly Readonly<Record<string, string | number>>[];
}

const SECTION_LABELS: Record<TaxSummarySectionKey, string> = {
  'ordinary-income': 'Ordinary income',
  'self-employment-income': 'Self-employment income',
  'deductible-expenses': 'Deductible expenses',
  'charitable-giving': 'Charitable giving',
  'capital-gains': 'Capital gains and losses',
  'wash-sale-addbacks': 'Wash-sale addbacks',
  'estimated-payments': 'Estimated tax payments',
};

function amountMagnitude(transaction: Pick<Transaction, 'amount'>): number {
  return Math.abs(transaction.amount.amount);
}

function fieldsFor(
  transaction: Pick<Transaction, 'customFields'>,
): Readonly<Record<string, string>> {
  return transaction.customFields ?? {};
}

function parseBoolean(value: string | undefined): boolean {
  return value === 'true' || value === '1' || value === 'yes' || value === 'Y';
}

function isInTaxYear(date: LocalDate, taxYear: number): boolean {
  return date >= `${taxYear}-01-01` && date <= `${taxYear}-12-31`;
}

function categoryName(
  categoryId: SyncId | null,
  categoriesById: ReadonlyMap<SyncId, Category>,
): string {
  return categoryId
    ? (categoriesById.get(categoryId)?.name ?? 'Unknown category')
    : 'Uncategorized';
}

function transactionLabel(
  transaction: Pick<Transaction, 'payee' | 'counterpartyName' | 'date'>,
): string {
  return `${transaction.date} ${transaction.payee ?? transaction.counterpartyName ?? 'Transaction'}`;
}

function transactionSource(
  transaction: Pick<Transaction, 'id' | 'payee' | 'counterpartyName' | 'date'>,
): TaxSummarySourceLink {
  return { type: 'transaction', id: transaction.id, label: transactionLabel(transaction) };
}

function manualSource(entry: TaxYearManualEntry): TaxSummarySourceLink {
  return { type: 'manual-entry', id: entry.id, label: entry.label };
}

function isDeductibleExpense(transaction: Pick<Transaction, 'type' | 'customFields'>): boolean {
  if (transaction.type !== 'EXPENSE') return false;
  const fields = fieldsFor(transaction);
  return (
    fields['tax.deductibleStatus'] === 'DEDUCTIBLE' ||
    parseBoolean(fields['tax.deductible']) ||
    fields['tax.category'] === 'SCHEDULE_C_EXPENSE'
  );
}

function isCharitableGiving(
  transaction: Pick<Transaction, 'type' | 'categoryId' | 'customFields'>,
  categoriesById: ReadonlyMap<SyncId, Category>,
): boolean {
  if (transaction.type !== 'EXPENSE') return false;
  const fields = fieldsFor(transaction);
  const label = categoryName(transaction.categoryId, categoriesById).toLowerCase();
  return (
    parseBoolean(fields['tax.charitable']) ||
    fields['tax.category'] === 'CHARITABLE_GIVING' ||
    label.includes('charity') ||
    label.includes('donation') ||
    label.includes('tithe')
  );
}

function isTaxRelated(
  transaction: Transaction,
  categoriesById: ReadonlyMap<SyncId, Category>,
): boolean {
  const fields = fieldsFor(transaction);
  return (
    Object.keys(fields).some((key) => key.startsWith('tax.')) ||
    isSelfEmploymentIncomeTransaction(transaction) ||
    isDeductibleExpense(transaction) ||
    isCharitableGiving(transaction, categoriesById)
  );
}

function receiptMissing(transaction: Pick<Transaction, 'customFields'>): boolean {
  const fields = fieldsFor(transaction);
  return (
    fields['tax.receiptStatus'] === 'MISSING' ||
    (parseBoolean(fields['tax.receiptRequired']) && fields['tax.receiptId'] === undefined)
  );
}

function unreconciled1099(transaction: Pick<Transaction, 'customFields'>): boolean {
  const status = fieldsFor(transaction)['tax.expectedFormStatus'];
  return status === 'EXPECTED' || status === 'MISSING' || status === 'VARIANCE';
}

function addSectionSource(
  sources: Map<TaxSummarySectionKey, TaxSummarySourceLink[]>,
  key: TaxSummarySectionKey,
  source: TaxSummarySourceLink,
): void {
  sources.set(key, [...(sources.get(key) ?? []), source]);
}

function manualEntriesFor(
  entries: readonly TaxYearManualEntry[],
  taxYear: number,
  section: TaxYearManualEntry['section'],
): TaxYearManualEntry[] {
  return entries.filter((entry) => entry.taxYear === taxYear && entry.section === section);
}

function sumManualEntries(
  entries: readonly TaxYearManualEntry[],
  sources: Map<TaxSummarySectionKey, TaxSummarySourceLink[]>,
  section: TaxYearManualEntry['section'],
): number {
  let total = 0;
  for (const entry of entries) {
    total += entry.amountCents;
    addSectionSource(sources, section, manualSource(entry));
  }
  return total;
}

function buildCsvRows(
  sections: readonly TaxYearSummarySection[],
): ReadonlyArray<Readonly<Record<string, string | number>>> {
  return sections.map((section) => ({
    section: section.label,
    amountCents: section.amountCents,
    sourceCount: section.sourceLinks.length,
  }));
}

export function buildTaxYearSummaryReport(params: {
  readonly taxYear: number;
  readonly transactions: readonly Transaction[];
  readonly categories?: readonly Category[];
  readonly estimatedPayments?: readonly EstimatedTaxPaymentRecord[];
  readonly investmentSummaries?: readonly CryptoTaxSummary[];
  readonly manualEntries?: readonly TaxYearManualEntry[];
  readonly checklistItems?: readonly TaxChecklistItem[];
}): TaxYearSummaryReport {
  const categoriesById = new Map(
    (params.categories ?? []).map((category) => [category.id, category]),
  );
  const sources = new Map<TaxSummarySectionKey, TaxSummarySourceLink[]>();
  const qualityFlags: TaxDataQualityFlag[] = [];
  const yearTransactions = params.transactions.filter(
    (transaction) =>
      transaction.deletedAt === null &&
      transaction.status !== 'VOID' &&
      isInTaxYear(transaction.date, params.taxYear),
  );

  let ordinaryIncomeCents = 0;
  let selfEmploymentIncomeCents = 0;
  let deductibleExpensesCents = 0;
  let charitableGivingCents = 0;

  for (const transaction of yearTransactions) {
    const source = transactionSource(transaction);

    if (transaction.type === 'INCOME') {
      if (isSelfEmploymentIncomeTransaction(transaction)) {
        selfEmploymentIncomeCents += amountMagnitude(transaction);
        addSectionSource(sources, 'self-employment-income', source);
      } else {
        ordinaryIncomeCents += amountMagnitude(transaction);
        addSectionSource(sources, 'ordinary-income', source);
      }
    }

    if (isDeductibleExpense(transaction)) {
      deductibleExpensesCents += amountMagnitude(transaction);
      addSectionSource(sources, 'deductible-expenses', source);
    }

    if (isCharitableGiving(transaction, categoriesById)) {
      charitableGivingCents += amountMagnitude(transaction);
      addSectionSource(sources, 'charitable-giving', source);
    }

    if (isTaxRelated(transaction, categoriesById) && transaction.categoryId === null) {
      qualityFlags.push({
        id: `uncategorized:${transaction.id}`,
        severity: 'warning',
        label: 'Tax-related transaction is uncategorized.',
        sourceLinks: [source],
      });
    }

    if (
      (isDeductibleExpense(transaction) || isCharitableGiving(transaction, categoriesById)) &&
      receiptMissing(transaction)
    ) {
      qualityFlags.push({
        id: `missing-receipt:${transaction.id}`,
        severity: 'warning',
        label: 'Deductible or charitable transaction is missing receipt evidence.',
        sourceLinks: [source],
      });
    }

    if (unreconciled1099(transaction)) {
      qualityFlags.push({
        id: `unreconciled-1099:${transaction.id}`,
        severity: 'warning',
        label: '1099 income needs reconciliation before filing.',
        sourceLinks: [source],
      });
    }
  }

  const manualEntries = params.manualEntries ?? [];
  ordinaryIncomeCents += sumManualEntries(
    manualEntriesFor(manualEntries, params.taxYear, 'ordinary-income'),
    sources,
    'ordinary-income',
  );
  deductibleExpensesCents += sumManualEntries(
    manualEntriesFor(manualEntries, params.taxYear, 'deductible-expenses'),
    sources,
    'deductible-expenses',
  );
  charitableGivingCents += sumManualEntries(
    manualEntriesFor(manualEntries, params.taxYear, 'charitable-giving'),
    sources,
    'charitable-giving',
  );

  const investmentSummaries = (params.investmentSummaries ?? []).filter(
    (summary) => summary.taxYear === params.taxYear,
  );
  const shortTermGainLossCents = investmentSummaries.reduce(
    (sum, summary) => sum + summary.shortTermGainLossCents,
    0,
  );
  const longTermGainLossCents = investmentSummaries.reduce(
    (sum, summary) => sum + summary.longTermGainLossCents,
    0,
  );
  const investmentSourceLinks = investmentSummaries.map(
    (summary): TaxSummarySourceLink => ({
      type: 'investment-summary',
      id: `investment-${summary.taxYear}`,
      label: `${summary.taxYear} investment tax summary`,
    }),
  );
  for (const source of investmentSourceLinks) addSectionSource(sources, 'capital-gains', source);

  let washSaleAddbacksCents = investmentSummaries.reduce(
    (sum, summary) =>
      sum +
      summary.washSaleAlerts.reduce((alertSum, alert) => alertSum + alert.disallowedLossCents, 0),
    0,
  );
  washSaleAddbacksCents += sumManualEntries(
    manualEntriesFor(manualEntries, params.taxYear, 'wash-sale-addbacks'),
    sources,
    'wash-sale-addbacks',
  );

  const estimatedPayments = (params.estimatedPayments ?? []).filter(
    (payment) => payment.taxYear === params.taxYear,
  );
  const estimatedTaxPaymentsCents = estimatedPayments.reduce(
    (sum, payment) => sum + payment.amountCents,
    0,
  );
  for (const payment of estimatedPayments) {
    addSectionSource(sources, 'estimated-payments', {
      type: 'estimated-payment',
      id: payment.id,
      label: `${payment.quarter} paid ${payment.paidDate}`,
    });
  }

  for (const item of (params.checklistItems ?? []).filter(
    (entry) => entry.taxYear === params.taxYear && entry.status === 'open',
  )) {
    qualityFlags.push({
      id: `open-checklist:${item.id}`,
      severity: 'info',
      label: `Open tax checklist item: ${item.label}`,
      sourceLinks: [{ type: 'checklist-item', id: item.id, label: item.label }],
    });
  }

  const sectionKeys: TaxSummarySectionKey[] = [
    'ordinary-income',
    'self-employment-income',
    'deductible-expenses',
    'charitable-giving',
    'capital-gains',
    'wash-sale-addbacks',
    'estimated-payments',
  ];
  const amounts: Record<TaxSummarySectionKey, number> = {
    'ordinary-income': ordinaryIncomeCents,
    'self-employment-income': selfEmploymentIncomeCents,
    'deductible-expenses': deductibleExpensesCents,
    'charitable-giving': charitableGivingCents,
    'capital-gains': shortTermGainLossCents + longTermGainLossCents,
    'wash-sale-addbacks': washSaleAddbacksCents,
    'estimated-payments': estimatedTaxPaymentsCents,
  };
  const sections = sectionKeys.map(
    (key): TaxYearSummarySection => ({
      key,
      label: SECTION_LABELS[key],
      amountCents: amounts[key],
      sourceLinks: sources.get(key) ?? [],
    }),
  );

  return {
    taxYear: params.taxYear,
    periodStart: `${params.taxYear}-01-01`,
    periodEnd: `${params.taxYear}-12-31`,
    ordinaryIncomeCents,
    selfEmploymentIncomeCents,
    deductibleExpensesCents,
    charitableGivingCents,
    shortTermGainLossCents,
    longTermGainLossCents,
    washSaleAddbacksCents,
    estimatedTaxPaymentsCents,
    sections,
    qualityFlags,
    notes: [
      'This report summarizes recorded data and manual entries; it is not a tax filing or tax advice.',
      'Estimated tax calculations should be reconciled against official forms, receipts, and preparer guidance before filing.',
    ],
    csvRows: buildCsvRows(sections),
  };
}
