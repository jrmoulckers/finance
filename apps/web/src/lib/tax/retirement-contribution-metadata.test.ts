// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import type { Account, Transaction } from '../../kmp/bridge';
import { summarizeTaggedRetirementContributions } from './retirement-contribution-metadata';

const syncMetadata = {
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
  deletedAt: null,
  syncVersion: 1,
  isSynced: true,
} as const;

function account(overrides: Partial<Account>): Account {
  return {
    id: 'roth-401k',
    householdId: 'household-1',
    name: 'Work Roth 401(k)',
    type: 'INVESTMENT',
    purpose: 'personal',
    retirementAccountType: 'ROTH_401K',
    retirementTaxTreatment: 'ROTH',
    hsaCoverageLevel: null,
    currency: { code: 'USD', decimalPlaces: 2 },
    currentBalance: { amount: 0 },
    isArchived: false,
    sortOrder: 0,
    icon: null,
    color: null,
    ...syncMetadata,
    ...overrides,
  };
}

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-1',
    householdId: 'household-1',
    accountId: 'roth-401k',
    categoryId: null,
    splits: [],
    type: 'TRANSFER',
    status: 'CLEARED',
    amount: { amount: 5_000_00 },
    currency: { code: 'USD', decimalPlaces: 2 },
    payee: 'Payroll contribution',
    note: null,
    date: '2025-02-01',
    transferAccountId: null,
    transferTransactionId: null,
    isRecurring: false,
    recurringRuleId: null,
    tags: [],
    retirementContributionYear: 2025,
    retirementContributionDesignation: 'EMPLOYEE',
    moodTag: null,
    merchantAddress: null,
    merchantCity: null,
    merchantState: null,
    merchantZip: null,
    merchantCountry: null,
    externalReferenceId: null,
    statementDescription: null,
    customFields: null,
    extraNotes: null,
    counterpartyName: null,
    counterpartyAccountId: null,
    ...syncMetadata,
    ...overrides,
  };
}

describe('retirement-contribution-metadata', () => {
  it('rolls tagged transactions from classified accounts into contribution limits', () => {
    const summary = summarizeTaggedRetirementContributions({
      accounts: [account({})],
      transactions: [transaction({})],
      profile: { taxYear: 2025, ageAtYearEnd: 45 },
    });

    const employeeDeferral = summary.rows.find(
      (row) => row.group === 'EMPLOYER_PLAN_EMPLOYEE_DEFERRAL',
    );
    const annualAdditions = summary.rows.find(
      (row) => row.group === 'EMPLOYER_PLAN_TOTAL_ANNUAL_ADDITIONS',
    );

    expect(employeeDeferral?.contributedCents).toBe(5_000_00);
    expect(employeeDeferral?.contributionIds).toEqual(['tx-1']);
    expect(annualAdditions?.contributedCents).toBe(5_000_00);
    expect(summary.warnings).toEqual([]);
  });

  it('surfaces unsupported tagged contributions as warnings', () => {
    const summary = summarizeTaggedRetirementContributions({
      accounts: [
        account({ id: 'checking', retirementAccountType: null, retirementTaxTreatment: null }),
      ],
      transactions: [transaction({ accountId: 'checking' })],
      profile: { taxYear: 2025 },
    });

    expect(summary.unsupportedAccountIds).toEqual(['checking']);
    expect(summary.warnings[0]).toContain('not classified as a supported retirement account');
  });
});
