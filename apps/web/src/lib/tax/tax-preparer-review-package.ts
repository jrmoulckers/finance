// SPDX-License-Identifier: BUSL-1.1

/**
 * Preparer-review export package assembled from the local tax summary facade.
 *
 * The schemas are stable string-keyed rows for CSV generation; amounts stay in
 * integer cents. Output is for preparer review and is not an official tax form.
 * References: issue #2636.
 */

import type { TaxDataQualityFlag, TaxYearSummaryReport } from '../reports/tax-year-summary';
import type { TaxReconciliationSummary } from './tax-reconciliation-inputs';

export type TaxPreparerCsvName = 'summary-sections' | 'source-links' | 'validation-flags';

export interface TaxPreparerReviewPackage {
  readonly taxYear: number;
  readonly csvSchemas: Readonly<Record<TaxPreparerCsvName, readonly string[]>>;
  readonly csvRows: Readonly<Record<TaxPreparerCsvName, ReadonlyArray<Readonly<Record<string, string | number>>>> >;
  readonly printableSectionOrder: readonly string[];
  readonly explanatoryNotes: readonly string[];
  readonly validationSummary: {
    readonly missingReceiptCount: number;
    readonly uncategorizedTaxTransactionCount: number;
    readonly unreconciledFormCount: number;
    readonly openChecklistItemCount: number;
  };
}

const CSV_SCHEMAS: Readonly<Record<TaxPreparerCsvName, readonly string[]>> = {
  'summary-sections': ['taxYear', 'sectionKey', 'sectionLabel', 'amountCents', 'sourceCount'],
  'source-links': ['taxYear', 'sectionKey', 'sourceType', 'sourceId', 'sourceLabel'],
  'validation-flags': ['taxYear', 'flagId', 'severity', 'label', 'sourceIds'],
};

const PRINTABLE_SECTION_ORDER = [
  'ordinary-income',
  'self-employment-income',
  'deductible-expenses',
  'charitable-giving',
  'capital-gains',
  'wash-sale-addbacks',
  'estimated-payments',
  'validation-summary',
] as const;

function sourceIds(flag: TaxDataQualityFlag): string {
  return flag.sourceLinks.map((source) => `${source.type}:${source.id}`).join('|');
}

function countFlags(report: TaxYearSummaryReport, prefix: string): number {
  return report.qualityFlags.filter((flag) => flag.id.startsWith(prefix)).length;
}

export function buildTaxPreparerReviewPackage(input: {
  readonly report: TaxYearSummaryReport;
  readonly reconciliation?: TaxReconciliationSummary;
}): TaxPreparerReviewPackage {
  const report = input.report;
  const reconciliation = input.reconciliation;
  const sectionRows = report.sections.map((section) => ({
    taxYear: report.taxYear,
    sectionKey: section.key,
    sectionLabel: section.label,
    amountCents: section.amountCents,
    sourceCount: section.sourceLinks.length,
  }));
  const sourceRows = report.sections.flatMap((section) =>
    section.sourceLinks.map((source) => ({
      taxYear: report.taxYear,
      sectionKey: section.key,
      sourceType: source.type,
      sourceId: source.id,
      sourceLabel: source.label,
    })),
  );
  const validationRows = report.qualityFlags.map((flag) => ({
    taxYear: report.taxYear,
    flagId: flag.id,
    severity: flag.severity,
    label: flag.label,
    sourceIds: sourceIds(flag),
  }));

  return {
    taxYear: report.taxYear,
    csvSchemas: CSV_SCHEMAS,
    csvRows: {
      'summary-sections': sectionRows,
      'source-links': sourceRows,
      'validation-flags': validationRows,
    },
    printableSectionOrder: PRINTABLE_SECTION_ORDER,
    explanatoryNotes: [
      'Amounts are recorded or estimated user data in cents and should be reconciled to official source documents.',
      'Missing receipts, uncategorized tax transactions, unreconciled forms, and open checklist items should be reviewed before filing.',
      'This package is an educational preparer review aid, not legal or tax advice.',
    ],
    validationSummary: {
      missingReceiptCount: reconciliation?.missingReceiptTransactionIds.length ?? countFlags(report, 'missing-receipt:'),
      uncategorizedTaxTransactionCount: countFlags(report, 'uncategorized:'),
      unreconciledFormCount: reconciliation?.unreconciledFormIds.length ?? countFlags(report, 'unreconciled-1099:'),
      openChecklistItemCount: reconciliation?.openChecklistItems.length ?? countFlags(report, 'open-checklist:'),
    },
  };
}
