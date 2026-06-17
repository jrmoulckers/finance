// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import { buildTaxReconciliationSummary, reconcileTaxForm1099 } from './tax-reconciliation-inputs';

describe('tax-reconciliation-inputs', () => {
  it('marks missing receipts for deductible and charitable transactions', () => {
    const summary = buildTaxReconciliationSummary({
      taxYear: 2025,
      transactions: [
        { id: 'office', taxYear: 2025, label: 'Office', amountCents: -125_00, deductible: true, charitable: false },
        {
          id: 'donation',
          taxYear: 2025,
          label: 'Donation',
          amountCents: -50_00,
          deductible: false,
          charitable: true,
          receiptId: 'receipt-1',
        },
        { id: 'personal', taxYear: 2025, label: 'Groceries', amountCents: -80_00, deductible: false, charitable: false },
      ],
    });

    expect(summary.missingReceiptTransactionIds).toEqual(['office']);
    expect(summary.receiptMarkers.find((marker) => marker.transactionId === 'donation')?.status).toBe('required-attached');
    expect(summary.receiptMarkers.find((marker) => marker.transactionId === 'personal')?.status).toBe('not-required');
  });

  it('tracks expected, received, reconciled, and variance 1099 states', () => {
    expect(
      reconcileTaxForm1099({ id: 'expected', taxYear: 2025, payerName: 'Client', formType: '1099-NEC', expectedAmountCents: 1_000_00 }).status,
    ).toBe('expected');
    expect(
      reconcileTaxForm1099({
        id: 'variance',
        taxYear: 2025,
        payerName: 'Platform',
        formType: '1099-K',
        expectedAmountCents: 2_000_00,
        receivedAmountCents: 2_100_00,
      }),
    ).toMatchObject({ status: 'variance', varianceCents: 100_00 });
    expect(
      reconcileTaxForm1099({
        id: 'done',
        taxYear: 2025,
        payerName: 'Bank',
        formType: '1099-INT',
        expectedAmountCents: 10_00,
        receivedAmountCents: 10_00,
        reconciled: true,
      }).status,
    ).toBe('reconciled');
  });

  it('surfaces open checklist items alongside unreconciled forms', () => {
    const summary = buildTaxReconciliationSummary({
      taxYear: 2025,
      transactions: [],
      forms1099: [{ id: 'nec', taxYear: 2025, payerName: 'Client', formType: '1099-NEC', expectedAmountCents: 500_00 }],
      checklistItems: [
        { id: 'upload-nec', taxYear: 2025, label: 'Upload 1099-NEC', status: 'open' },
        { id: 'done', taxYear: 2025, label: 'Confirm address', status: 'done' },
      ],
    });

    expect(summary.unreconciledFormIds).toEqual(['nec']);
    expect(summary.openChecklistItems.map((item) => item.id)).toEqual(['upload-nec']);
  });
});
