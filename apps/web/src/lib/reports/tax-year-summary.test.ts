// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';

import type { Category, Transaction } from '../../kmp/bridge';
import {
  buildTaxYearSummaryReport,
  type TaxChecklistItem,
  type TaxYearManualEntry,
} from './tax-year-summary';

const currency = { code: 'USD', decimalPlaces: 2 } as const;
const metadata = {
  householdId: 'hh-1',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
};

function tx(
  overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'type' | 'amount'>,
): Transaction {
  return {
    ...metadata,
    id: overrides.id,
    accountId: overrides.accountId ?? 'acct-1',
    categoryId: 'categoryId' in overrides ? (overrides.categoryId ?? null) : 'cat-business',
    type: overrides.type,
    status: overrides.status ?? 'CLEARED',
    amount: overrides.amount,
    currency,
    payee: overrides.payee ?? 'Payee',
    note: overrides.note ?? null,
    date: overrides.date,
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: overrides.tags ?? [],
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantZip: null,
    merchantCountry: null,
    externalReferenceId: null,
    statementDescription: null,
    customFields: overrides.customFields ?? null,
    extraNotes: null,
    counterpartyName: null,
    counterpartyAccountId: null,
  };
}

const categories: Category[] = [
  {
    ...metadata,
    id: 'cat-business',
    name: 'Business supplies',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 0,
  },
  {
    ...metadata,
    id: 'cat-charity',
    name: 'Charity donations',
    icon: null,
    color: null,
    parentId: null,
    isIncome: false,
    isSystem: false,
    sortOrder: 1,
  },
];

describe('tax year summary report', () => {
  it('consolidates income, deductions, investments, payments, and quality flags', () => {
    const manualEntries: TaxYearManualEntry[] = [
      {
        id: 'manual-donation',
        taxYear: 2025,
        section: 'charitable-giving',
        amountCents: 2500,
        label: 'Cash donation receipt',
      },
    ];
    const checklistItems: TaxChecklistItem[] = [
      { id: 'check-1', taxYear: 2025, label: 'Upload 1099-NEC', status: 'open' },
    ];

    const report = buildTaxYearSummaryReport({
      taxYear: 2025,
      categories,
      transactions: [
        tx({
          id: 'w2',
          date: '2025-01-15',
          type: 'INCOME',
          amount: { amount: 500000 },
          payee: 'Employer',
        }),
        tx({
          id: 'contract',
          date: '2025-02-15',
          type: 'INCOME',
          amount: { amount: 150000 },
          categoryId: null,
          payee: 'Client',
          customFields: { 'tax.selfEmploymentIncome': 'true', 'tax.expectedFormStatus': 'MISSING' },
        }),
        tx({
          id: 'supplies',
          date: '2025-03-01',
          type: 'EXPENSE',
          amount: { amount: -30000 },
          customFields: { 'tax.deductible': 'true', 'tax.receiptStatus': 'MISSING' },
        }),
        tx({
          id: 'donation',
          date: '2025-04-01',
          type: 'EXPENSE',
          amount: { amount: -10000 },
          categoryId: 'cat-charity',
        }),
      ],
      estimatedPayments: [
        { id: 'pay-q1', taxYear: 2025, quarter: 'Q1', paidDate: '2025-04-15', amountCents: 20000 },
      ],
      investmentSummaries: [
        {
          taxYear: 2025,
          shortTermGainLossCents: 12000,
          longTermGainLossCents: -3000,
          totalGainLossCents: 9000,
          ordinaryIncomeCents: 0,
          totalDisposals: 2,
          washSaleAlerts: [
            {
              symbol: 'ABC',
              disposalDate: '2025-06-01',
              reacquisitionDate: '2025-06-15',
              disallowedLossCents: 800,
            },
          ],
        },
      ],
      manualEntries,
      checklistItems,
    });

    expect(report).toMatchObject({
      ordinaryIncomeCents: 500000,
      selfEmploymentIncomeCents: 150000,
      deductibleExpensesCents: 30000,
      charitableGivingCents: 12500,
      shortTermGainLossCents: 12000,
      longTermGainLossCents: -3000,
      washSaleAddbacksCents: 800,
      estimatedTaxPaymentsCents: 20000,
    });
    expect(report.qualityFlags.map((flag) => flag.id)).toEqual(
      expect.arrayContaining([
        'uncategorized:contract',
        'missing-receipt:supplies',
        'unreconciled-1099:contract',
        'open-checklist:check-1',
      ]),
    );
    expect(
      report.sections.find((section) => section.key === 'estimated-payments')?.sourceLinks[0]?.id,
    ).toBe('pay-q1');
    expect(report.csvRows).toContainEqual({
      section: 'Capital gains and losses',
      amountCents: 9000,
      sourceCount: 1,
    });
    expect(report.notes[0]).toContain('not a tax filing');
  });
});
