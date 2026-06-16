// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildCharitableDonationExportRows,
  summarizeCharitableDonations,
  type CharitableDonationEntry,
} from './charitable-donations';

describe('charitable donation tracking', () => {
  const entries: CharitableDonationEntry[] = [
    {
      id: 'cash',
      taxYear: 2025,
      date: '2025-01-10',
      organizationName: 'Community Fund',
      donationType: 'CASH',
      amountCents: 300_00,
      receiptStatus: 'RECEIVED',
    },
    {
      id: 'noncash',
      taxYear: 2025,
      date: '2025-02-03',
      organizationName: '',
      donationType: 'NON_CASH',
      amountCents: 0,
      fairMarketValueCents: 650_00,
      receiptStatus: 'REQUESTED',
      nonCashDescription: 'Furniture',
    },
    {
      id: 'payroll',
      taxYear: 2024,
      date: '2024-11-05',
      organizationName: 'United Way',
      donationType: 'PAYROLL',
      amountCents: 100_00,
      receiptStatus: 'NOT_REQUIRED',
    },
  ];

  it('summarizes donations by type and flags missing substantiation', () => {
    const summary = summarizeCharitableDonations(entries, 2025);

    expect(summary.totalAmountCents).toBe(950_00);
    expect(summary.missingReceiptCount).toBe(1);
    expect(summary.missingOrganizationCount).toBe(1);
    expect(summary.byType.find((type) => type.donationType === 'NON_CASH')).toMatchObject({
      totalAmountCents: 650_00,
      entryCount: 1,
    });
    expect(summary.substantiationWarnings).toEqual(
      expect.arrayContaining([
        'Donation noncash is missing an organization name.',
        'Donation noncash needs written acknowledgement for $250+ gifts.',
        'Donation noncash is non-cash over $500 and should be reviewed for Form 8283 support.',
      ]),
    );
  });

  it('exports tax-year donation rows without promising deductibility', () => {
    const rows = buildCharitableDonationExportRows(entries, 2025);

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      id: 'noncash',
      amountCents: 650_00,
      receiptStatus: 'REQUESTED',
    });
  });
});
