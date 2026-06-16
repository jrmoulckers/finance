// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  buildSelfEmploymentIncomeExportRows,
  isSelfEmploymentIncomeTransaction,
  reconcileSelfEmploymentIncome,
  summarizeSelfEmploymentIncome,
  type SelfEmploymentIncomeRecord,
} from './self-employment-income';

describe('self-employment income tracking', () => {
  const records: SelfEmploymentIncomeRecord[] = [
    {
      id: 'stripe-jan',
      taxYear: 2025,
      date: '2025-01-10',
      payerName: 'Stripe',
      payerTinLast4: '1234',
      formType: '1099_K',
      expectedFormStatus: 'EXPECTED',
      grossIncomeCents: 10_000_00,
      netDepositCents: 9_600_00,
      processorFeesCents: 300_00,
      refundsCents: 100_00,
    },
    {
      id: 'stripe-feb',
      taxYear: 2025,
      date: '2025-02-12',
      payerName: 'Stripe',
      payerTinLast4: '1234',
      formType: '1099_K',
      expectedFormStatus: 'RECEIVED',
      grossIncomeCents: 8_000_00,
      netDepositCents: 7_800_00,
      processorFeesCents: 200_00,
    },
    {
      id: 'client',
      taxYear: 2025,
      date: '2025-03-01',
      payerName: '',
      formType: '1099_NEC',
      expectedFormStatus: 'MISSING',
      grossIncomeCents: 2_000_00,
    },
  ];

  it('summarizes gross receipts, processor adjustments, and missing payer details by payer/form', () => {
    const summaries = summarizeSelfEmploymentIncome(records, 2025);

    expect(summaries).toHaveLength(2);
    expect(summaries.find((summary) => summary.payerName === 'Stripe')).toMatchObject({
      formType: '1099_K',
      grossIncomeCents: 18_000_00,
      netDepositCents: 17_400_00,
      processorFeesCents: 500_00,
      refundsCents: 100_00,
      recordCount: 2,
      missingPayerDetails: false,
    });
    expect(summaries.find((summary) => summary.payerName === 'Unknown payer')).toMatchObject({
      expectedFormStatus: 'MISSING',
      missingPayerDetails: true,
    });
  });

  it('reconciles entered 1099 amounts and flags variances or forms without transactions', () => {
    const summaries = summarizeSelfEmploymentIncome(records, 2025);
    const results = reconcileSelfEmploymentIncome(summaries, [
      { payerName: 'Stripe', formType: '1099_K', reportedGrossCents: 18_050_00 },
      { payerName: 'Marketplace', formType: '1099_MISC', reportedGrossCents: 750_00 },
    ]);

    expect(results.find((result) => result.payerName === 'Stripe')).toMatchObject({
      varianceCents: 50_00,
      status: 'VARIANCE',
    });
    expect(results.find((result) => result.payerName === 'Unknown payer')).toMatchObject({
      status: 'MISSING_FORM',
    });
    expect(results.find((result) => result.payerName === 'Marketplace')).toMatchObject({
      status: 'FORM_WITHOUT_TRANSACTIONS',
    });
  });

  it('detects self-employment income metadata on mixed-purpose transactions and exports payer rows', () => {
    expect(
      isSelfEmploymentIncomeTransaction({
        type: 'INCOME',
        customFields: { 'tax.selfEmploymentIncome': 'true' },
      }),
    ).toBe(true);

    const rows = buildSelfEmploymentIncomeExportRows(summarizeSelfEmploymentIncome(records, 2025));
    expect(rows[0]).toHaveProperty('grossIncomeCents');
  });
});
