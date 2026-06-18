// SPDX-License-Identifier: BUSL-1.1

/** Charitable donation tracking helpers for tax beta issue #2278. */

import type { LocalDate } from '../../kmp/bridge';

export type DonationType = 'CASH' | 'NON_CASH' | 'SECURITIES' | 'PAYROLL';
export type DonationReceiptStatus = 'MISSING' | 'REQUESTED' | 'RECEIVED' | 'NOT_REQUIRED';

export interface CharitableDonationEntry {
  readonly id: string;
  readonly transactionId?: string;
  readonly taxYear: number;
  readonly date: LocalDate;
  readonly organizationName: string;
  readonly donationType: DonationType;
  readonly amountCents: number;
  readonly fairMarketValueCents?: number;
  readonly receiptStatus: DonationReceiptStatus;
  readonly nonCashDescription?: string;
  readonly valuationNotes?: string;
  readonly acknowledgementReceived?: boolean;
  readonly notes?: string;
}

export interface DonationTypeSummary {
  readonly donationType: DonationType;
  readonly totalAmountCents: number;
  readonly entryCount: number;
  readonly missingReceiptCount: number;
  readonly missingOrganizationCount: number;
}

export interface CharitableDonationSummary {
  readonly taxYear: number;
  readonly byType: readonly DonationTypeSummary[];
  readonly totalAmountCents: number;
  readonly missingReceiptCount: number;
  readonly missingOrganizationCount: number;
  readonly substantiationWarnings: readonly string[];
}

const WRITTEN_ACKNOWLEDGEMENT_THRESHOLD_CENTS = 250_00;
const NON_CASH_FORM_8283_THRESHOLD_CENTS = 500_00;

function donationAmount(entry: CharitableDonationEntry): number {
  return Math.max(0, entry.fairMarketValueCents ?? entry.amountCents);
}

function isMissingOrganization(entry: CharitableDonationEntry): boolean {
  return entry.organizationName.trim().length === 0;
}

function needsReceipt(entry: CharitableDonationEntry): boolean {
  return donationAmount(entry) >= WRITTEN_ACKNOWLEDGEMENT_THRESHOLD_CENTS;
}

function isMissingReceipt(entry: CharitableDonationEntry): boolean {
  return needsReceipt(entry) && entry.receiptStatus !== 'RECEIVED';
}

export function filterDonationsByYear(
  entries: readonly CharitableDonationEntry[],
  taxYear: number,
): CharitableDonationEntry[] {
  return entries.filter(
    (entry) => entry.taxYear === taxYear || entry.date.startsWith(String(taxYear)),
  );
}

export function summarizeCharitableDonations(
  entries: readonly CharitableDonationEntry[],
  taxYear: number,
): CharitableDonationSummary {
  const yearEntries = filterDonationsByYear(entries, taxYear);
  const byType = (['CASH', 'NON_CASH', 'SECURITIES', 'PAYROLL'] satisfies DonationType[]).map(
    (donationType) => {
      const typeEntries = yearEntries.filter((entry) => entry.donationType === donationType);
      return {
        donationType,
        totalAmountCents: typeEntries.reduce((sum, entry) => sum + donationAmount(entry), 0),
        entryCount: typeEntries.length,
        missingReceiptCount: typeEntries.filter(isMissingReceipt).length,
        missingOrganizationCount: typeEntries.filter(isMissingOrganization).length,
      } satisfies DonationTypeSummary;
    },
  );

  const substantiationWarnings = yearEntries.flatMap((entry) => {
    const warnings: string[] = [];
    const amount = donationAmount(entry);
    if (isMissingOrganization(entry)) {
      warnings.push(`Donation ${entry.id} is missing an organization name.`);
    }
    if (isMissingReceipt(entry)) {
      warnings.push(`Donation ${entry.id} needs written acknowledgement for $250+ gifts.`);
    }
    if (
      entry.donationType === 'NON_CASH' &&
      amount >= NON_CASH_FORM_8283_THRESHOLD_CENTS &&
      entry.acknowledgementReceived !== true
    ) {
      warnings.push(
        `Donation ${entry.id} is non-cash over $500 and should be reviewed for Form 8283 support.`,
      );
    }
    return warnings;
  });

  return {
    taxYear,
    byType,
    totalAmountCents: byType.reduce((sum, type) => sum + type.totalAmountCents, 0),
    missingReceiptCount: byType.reduce((sum, type) => sum + type.missingReceiptCount, 0),
    missingOrganizationCount: byType.reduce((sum, type) => sum + type.missingOrganizationCount, 0),
    substantiationWarnings,
  };
}

export function buildCharitableDonationExportRows(
  entries: readonly CharitableDonationEntry[],
  taxYear: number,
): ReadonlyArray<Readonly<Record<string, string | number | boolean | undefined>>> {
  return filterDonationsByYear(entries, taxYear).map((entry) => ({
    id: entry.id,
    transactionId: entry.transactionId,
    date: entry.date,
    organizationName: entry.organizationName,
    donationType: entry.donationType,
    amountCents: donationAmount(entry),
    receiptStatus: entry.receiptStatus,
    nonCashDescription: entry.nonCashDescription,
    valuationNotes: entry.valuationNotes,
    acknowledgementReceived: entry.acknowledgementReceived,
    notes: entry.notes,
  }));
}

export const CHARITABLE_DONATION_DISCLAIMER =
  'Donation tracking is an estimate organizer only; deductibility and itemization rules vary and should be reviewed with a tax professional.';
