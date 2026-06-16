// SPDX-License-Identifier: BUSL-1.1

/** Tax-document checklist and export bundle helpers for tax beta issue #2282. */

import type { CharitableDonationSummary } from './charitable-donations';
import type { HomeOfficeSummary } from './home-office-deductions';
import type { AnnualMileageSummary } from './mileage-log';
import type { PayerIncomeSummary } from './self-employment-income';

export type TaxChecklistSection = 'INCOME' | 'INVESTMENTS' | 'DEDUCTIONS' | 'ESTIMATED_PAYMENTS' | 'DOCUMENTS';
export type TaxChecklistStatus =
  | 'NOT_STARTED'
  | 'REQUESTED'
  | 'RECEIVED'
  | 'REVIEWED'
  | 'EXPORTED'
  | 'NOT_APPLICABLE';

export interface TaxChecklistItem {
  readonly id: string;
  readonly section: TaxChecklistSection;
  readonly label: string;
  readonly status: TaxChecklistStatus;
  readonly linkedRecordCount: number;
  readonly warnings: readonly string[];
}

export interface TaxDocumentChecklist {
  readonly taxYear: number;
  readonly items: readonly TaxChecklistItem[];
  readonly readyToExport: boolean;
  readonly openIssueCount: number;
}

export interface TaxDocumentChecklistInput {
  readonly taxYear: number;
  readonly incomeSummaries?: readonly PayerIncomeSummary[];
  readonly donationSummary?: CharitableDonationSummary;
  readonly mileageSummary?: AnnualMileageSummary;
  readonly homeOfficeSummary?: HomeOfficeSummary;
  readonly estimatedPaymentCount?: number;
  readonly investmentSaleCount?: number;
  readonly manuallyReceivedDocuments?: readonly string[];
}

export interface TaxExportFile {
  readonly path: string;
  readonly mimeType: string;
  readonly content: string;
}

export interface TaxExportManifest {
  readonly taxYear: number;
  readonly householdName: string;
  readonly generatedAt: string;
  readonly files: readonly string[];
  readonly disclaimers: readonly string[];
  readonly openIssueCount: number;
}

export interface TaxExportBundle {
  readonly manifest: TaxExportManifest;
  readonly files: readonly TaxExportFile[];
}

const TAX_EXPORT_DISCLAIMER =
  'Tax exports contain user-recorded and estimated data for review; they are not professional tax advice or official tax forms.';

function item(
  input: Omit<TaxChecklistItem, 'status'> & { readonly status?: TaxChecklistStatus },
): TaxChecklistItem {
  return { ...input, status: input.status ?? (input.warnings.length > 0 ? 'REQUESTED' : 'REVIEWED') };
}

export function buildTaxDocumentChecklist(input: TaxDocumentChecklistInput): TaxDocumentChecklist {
  const incomeSummaries = input.incomeSummaries ?? [];
  const donationSummary = input.donationSummary;
  const mileageSummary = input.mileageSummary;
  const homeOfficeSummary = input.homeOfficeSummary;
  const manuallyReceivedDocuments = input.manuallyReceivedDocuments ?? [];

  const items: TaxChecklistItem[] = [
    item({
      id: 'self-employment-income',
      section: 'INCOME',
      label: '1099 and self-employment income reconciliation',
      linkedRecordCount: incomeSummaries.reduce((sum, summary) => sum + summary.recordCount, 0),
      warnings: incomeSummaries
        .filter((summary) => summary.missingPayerDetails || summary.expectedFormStatus === 'MISSING')
        .map((summary) => `${summary.payerName} ${summary.formType} needs payer details or expected form follow-up.`),
      status: incomeSummaries.length === 0 ? 'NOT_APPLICABLE' : undefined,
    }),
    item({
      id: 'investment-sales',
      section: 'INVESTMENTS',
      label: 'Brokerage 1099-B and capital-gain lot detail',
      linkedRecordCount: input.investmentSaleCount ?? 0,
      warnings: input.investmentSaleCount === undefined ? ['Confirm brokerage tax forms before export.'] : [],
      status: input.investmentSaleCount === 0 ? 'NOT_APPLICABLE' : undefined,
    }),
    item({
      id: 'deduction-support',
      section: 'DEDUCTIONS',
      label: 'Mileage, home-office, and charitable deduction support',
      linkedRecordCount:
        (donationSummary?.byType.reduce((sum, summary) => sum + summary.entryCount, 0) ?? 0) +
        (mileageSummary?.totalTrips ?? 0) +
        (homeOfficeSummary?.resultCount ?? 0),
      warnings: [
        ...(donationSummary?.substantiationWarnings ?? []),
        ...((homeOfficeSummary?.missingSupportCount ?? 0) > 0
          ? ['Home-office entries need supporting notes or receipt references.']
          : []),
      ],
    }),
    item({
      id: 'estimated-payments',
      section: 'ESTIMATED_PAYMENTS',
      label: 'Quarterly estimated tax payment records',
      linkedRecordCount: input.estimatedPaymentCount ?? 0,
      warnings: (input.estimatedPaymentCount ?? 0) === 0 ? ['No estimated payments recorded for this tax year.'] : [],
    }),
    item({
      id: 'source-documents',
      section: 'DOCUMENTS',
      label: 'W-2, 1099, brokerage, receipt, and preparer documents',
      linkedRecordCount: manuallyReceivedDocuments.length,
      warnings: manuallyReceivedDocuments.length === 0 ? ['No source documents marked received yet.'] : [],
    }),
  ];

  const openIssueCount = items.filter((checklistItem) => checklistItem.warnings.length > 0).length;

  return {
    taxYear: input.taxYear,
    items,
    readyToExport: openIssueCount === 0,
    openIssueCount,
  };
}

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function rowsToCsv(rows: ReadonlyArray<Readonly<Record<string, string | number | boolean | null | undefined>>>): string {
  if (rows.length === 0) {
    return '';
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(','));
  }
  return lines.join('\n');
}

export function buildTaxExportBundle(input: {
  readonly taxYear: number;
  readonly householdName: string;
  readonly generatedAt: string;
  readonly checklist: TaxDocumentChecklist;
  readonly csvFiles: Readonly<Record<string, ReadonlyArray<Readonly<Record<string, string | number | boolean | null | undefined>>>>>;
  readonly jsonPayload: Readonly<Record<string, unknown>>;
}): TaxExportBundle {
  const files: TaxExportFile[] = Object.entries(input.csvFiles).map(([name, rows]) => ({
    path: `${input.taxYear}/${name}.csv`,
    mimeType: 'text/csv',
    content: rowsToCsv(rows),
  }));

  files.push({
    path: `${input.taxYear}/tax-data.json`,
    mimeType: 'application/json',
    content: JSON.stringify(input.jsonPayload, null, 2),
  });

  const manifest: TaxExportManifest = {
    taxYear: input.taxYear,
    householdName: input.householdName,
    generatedAt: input.generatedAt,
    files: files.map((file) => file.path),
    disclaimers: [TAX_EXPORT_DISCLAIMER],
    openIssueCount: input.checklist.openIssueCount,
  };

  return {
    manifest,
    files: [
      {
        path: `${input.taxYear}/manifest.json`,
        mimeType: 'application/json',
        content: JSON.stringify(manifest, null, 2),
      },
      ...files,
    ],
  };
}
