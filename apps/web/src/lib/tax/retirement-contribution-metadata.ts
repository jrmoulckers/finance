// SPDX-License-Identifier: BUSL-1.1

import type {
  Account,
  ContributionDesignation,
  RetirementAccountType,
  RetirementTaxTreatment,
  HsaCoverageLevel,
  Transaction,
} from '../../kmp/bridge';
import {
  summarizeRetirementContributionLimits,
  type ContributionLimitProfile,
  type RetirementAccountClassification,
  type RetirementContributionLimitSummary,
  type RetirementContributionTransaction,
} from './retirement-contribution-limits';

export const RETIREMENT_ACCOUNT_TYPE_OPTIONS: readonly {
  readonly value: RetirementAccountType;
  readonly label: string;
  readonly defaultTaxTreatment: RetirementTaxTreatment;
  readonly hsaCoverageLevel?: HsaCoverageLevel;
}[] = [
  { value: 'TRADITIONAL_IRA', label: 'Traditional IRA', defaultTaxTreatment: 'PRE_TAX' },
  { value: 'ROTH_IRA', label: 'Roth IRA', defaultTaxTreatment: 'ROTH' },
  { value: '401K', label: '401(k)', defaultTaxTreatment: 'PRE_TAX' },
  { value: 'ROTH_401K', label: 'Roth 401(k)', defaultTaxTreatment: 'ROTH' },
  { value: '403B', label: '403(b)', defaultTaxTreatment: 'PRE_TAX' },
  { value: 'SEP_IRA', label: 'SEP IRA', defaultTaxTreatment: 'EMPLOYER' },
  { value: 'HSA', label: 'HSA', defaultTaxTreatment: 'PRE_TAX', hsaCoverageLevel: 'SELF_ONLY' },
  { value: 'FSA', label: 'FSA', defaultTaxTreatment: 'PRE_TAX' },
] as const;

export const RETIREMENT_TAX_TREATMENT_OPTIONS: readonly {
  readonly value: RetirementTaxTreatment;
  readonly label: string;
}[] = [
  { value: 'PRE_TAX', label: 'Pre-tax' },
  { value: 'ROTH', label: 'Roth' },
  { value: 'AFTER_TAX', label: 'After-tax' },
  { value: 'EMPLOYER', label: 'Employer funded' },
] as const;

export const HSA_COVERAGE_OPTIONS: readonly {
  readonly value: HsaCoverageLevel;
  readonly label: string;
}[] = [
  { value: 'SELF_ONLY', label: 'Self-only' },
  { value: 'FAMILY', label: 'Family' },
] as const;

export const CONTRIBUTION_DESIGNATION_OPTIONS: readonly {
  readonly value: ContributionDesignation;
  readonly label: string;
}[] = [
  { value: 'EMPLOYEE', label: 'Employee / personal' },
  { value: 'EMPLOYER', label: 'Employer' },
] as const;

const ACCOUNT_TYPE_LABELS = new Map(
  RETIREMENT_ACCOUNT_TYPE_OPTIONS.map((option) => [option.value, option.label]),
);
const TAX_TREATMENT_LABELS = new Map(
  RETIREMENT_TAX_TREATMENT_OPTIONS.map((option) => [option.value, option.label]),
);
const HSA_COVERAGE_LABELS = new Map(
  HSA_COVERAGE_OPTIONS.map((option) => [option.value, option.label]),
);
const DESIGNATION_LABELS = new Map(
  CONTRIBUTION_DESIGNATION_OPTIONS.map((option) => [option.value, option.label]),
);

export function getRetirementAccountTypeLabel(
  type: RetirementAccountType | null | undefined,
): string {
  return type ? (ACCOUNT_TYPE_LABELS.get(type) ?? type) : 'Not a retirement account';
}

export function getRetirementTaxTreatmentLabel(
  treatment: RetirementTaxTreatment | null | undefined,
): string {
  return treatment ? (TAX_TREATMENT_LABELS.get(treatment) ?? treatment) : 'Not set';
}

export function getHsaCoverageLabel(coverage: HsaCoverageLevel | null | undefined): string {
  return coverage ? (HSA_COVERAGE_LABELS.get(coverage) ?? coverage) : 'Not set';
}

export function getContributionDesignationLabel(
  designation: ContributionDesignation | null | undefined,
): string {
  return designation ? (DESIGNATION_LABELS.get(designation) ?? designation) : 'Not tagged';
}

export function getDefaultRetirementTaxTreatment(
  accountType: RetirementAccountType,
): RetirementTaxTreatment {
  return (
    RETIREMENT_ACCOUNT_TYPE_OPTIONS.find((option) => option.value === accountType)
      ?.defaultTaxTreatment ?? 'PRE_TAX'
  );
}

export function supportsEmployerRetirementContributions(
  accountType: RetirementAccountType | null | undefined,
): boolean {
  return (
    accountType === '401K' ||
    accountType === 'ROTH_401K' ||
    accountType === '403B' ||
    accountType === 'SEP_IRA' ||
    accountType === 'HSA'
  );
}

export function buildRetirementAccountClassifications(
  accounts: readonly Account[],
): RetirementAccountClassification[] {
  return accounts
    .filter(
      (account) =>
        account.retirementAccountType !== null && account.retirementAccountType !== undefined,
    )
    .map((account) => ({
      accountId: account.id,
      accountType: account.retirementAccountType!,
      taxTreatment:
        account.retirementTaxTreatment ??
        getDefaultRetirementTaxTreatment(account.retirementAccountType!),
      ...(account.retirementAccountType === 'HSA'
        ? { hsaCoverageLevel: account.hsaCoverageLevel ?? 'SELF_ONLY' }
        : {}),
    }));
}

export function buildRetirementContributionTransactions(
  transactions: readonly Transaction[],
): RetirementContributionTransaction[] {
  return transactions
    .filter(
      (transaction) =>
        transaction.retirementContributionDesignation !== null &&
        transaction.retirementContributionDesignation !== undefined,
    )
    .map((transaction) => ({
      id: transaction.id,
      accountId: transaction.accountId,
      date: transaction.date,
      amountCents: Math.abs(transaction.amount.amount),
      ...(transaction.retirementContributionYear !== null &&
      transaction.retirementContributionYear !== undefined
        ? { contributionYear: transaction.retirementContributionYear }
        : {}),
      designation: transaction.retirementContributionDesignation!,
    }));
}

export function summarizeTaggedRetirementContributions(input: {
  readonly accounts: readonly Account[];
  readonly transactions: readonly Transaction[];
  readonly profile: ContributionLimitProfile;
}): RetirementContributionLimitSummary {
  return summarizeRetirementContributionLimits({
    accounts: buildRetirementAccountClassifications(input.accounts),
    contributions: buildRetirementContributionTransactions(input.transactions),
    profile: input.profile,
  });
}
