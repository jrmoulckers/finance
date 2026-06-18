// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildTaxDocumentChecklist, buildTaxExportBundle, rowsToCsv } from './tax-document-export';

describe('tax document checklist and export', () => {
  it('builds grouped checklist items and flags missing/stale support before export', () => {
    const checklist = buildTaxDocumentChecklist({
      taxYear: 2025,
      incomeSummaries: [
        {
          payerName: 'Client Co',
          payerTinLast4: null,
          formType: '1099_NEC',
          grossIncomeCents: 5_000_00,
          netDepositCents: 5_000_00,
          processorFeesCents: 0,
          refundsCents: 0,
          chargebacksCents: 0,
          recordCount: 1,
          expectedFormStatus: 'MISSING',
          missingPayerDetails: true,
        },
      ],
      estimatedPaymentCount: 0,
      manuallyReceivedDocuments: [],
    });

    expect(checklist.taxYear).toBe(2025);
    expect(checklist.items.map((item) => item.section)).toEqual([
      'INCOME',
      'INVESTMENTS',
      'DEDUCTIONS',
      'ESTIMATED_PAYMENTS',
      'DOCUMENTS',
    ]);
    expect(checklist.readyToExport).toBe(false);
    expect(checklist.openIssueCount).toBeGreaterThan(0);
  });

  it('serializes CSV summaries, JSON payload, and manifest into an export bundle', () => {
    const checklist = buildTaxDocumentChecklist({
      taxYear: 2025,
      estimatedPaymentCount: 1,
      investmentSaleCount: 0,
      manuallyReceivedDocuments: ['1099-NEC'],
    });

    const bundle = buildTaxExportBundle({
      taxYear: 2025,
      householdName: 'Household',
      generatedAt: '2025-12-31T12:00:00.000Z',
      checklist,
      csvFiles: {
        income: [{ payer: 'Client, Inc.', amountCents: 100_00 }],
      },
      jsonPayload: { taxYear: 2025, checklist },
    });

    expect(rowsToCsv([{ name: 'Client, Inc.', amount: 100 }])).toBe(
      'name,amount\n"Client, Inc.",100',
    );
    expect(bundle.manifest.files).toEqual(['2025/income.csv', '2025/tax-data.json']);
    expect(bundle.files.map((file) => file.path)).toEqual([
      '2025/manifest.json',
      '2025/income.csv',
      '2025/tax-data.json',
    ]);
  });
});
