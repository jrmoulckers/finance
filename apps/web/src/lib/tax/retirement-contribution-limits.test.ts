// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  getEffectiveRetirementLimitCents,
  getRetirementLimitDefinitions,
  summarizeRetirementContributionLimits,
  type RetirementAccountClassification,
  type RetirementContributionTransaction,
} from './retirement-contribution-limits';

const ACCOUNTS: RetirementAccountClassification[] = [
  { accountId: 'trad-ira', accountType: 'TRADITIONAL_IRA', taxTreatment: 'PRE_TAX' },
  { accountId: 'roth-ira', accountType: 'ROTH_IRA', taxTreatment: 'ROTH' },
  { accountId: 'work-401k', accountType: '401K', taxTreatment: 'PRE_TAX' },
  {
    accountId: 'family-hsa',
    accountType: 'HSA',
    taxTreatment: 'PRE_TAX',
    hsaCoverageLevel: 'FAMILY',
  },
  { accountId: 'health-fsa', accountType: 'FSA', taxTreatment: 'PRE_TAX' },
];

describe('retirement-contribution-limits', () => {
  it('exposes documented IRS constants by tax year', () => {
    const limits = getRetirementLimitDefinitions(2025);

    expect(limits.map((limit) => limit.group)).toContain('IRA_COMBINED');
    expect(limits.find((limit) => limit.group === 'EMPLOYER_PLAN_EMPLOYEE_DEFERRAL')).toMatchObject(
      {
        baseLimitCents: 23_500_00,
        superCatchUpLimitCents: 11_250_00,
      },
    );
  });

  it('applies 2025 age 60-63 super catch-up for employer plan deferrals', () => {
    const limit = getEffectiveRetirementLimitCents('EMPLOYER_PLAN_EMPLOYEE_DEFERRAL', {
      taxYear: 2025,
      ageAtYearEnd: 61,
    });

    expect(limit).toBe(34_750_00);
  });

  it('combines Traditional and Roth IRA contributions against one shared limit', () => {
    const contributions: RetirementContributionTransaction[] = [
      {
        id: 'trad-1',
        accountId: 'trad-ira',
        date: '2025-01-15',
        amountCents: 4_000_00,
        designation: 'EMPLOYEE',
      },
      {
        id: 'roth-1',
        accountId: 'roth-ira',
        date: '2025-02-15',
        amountCents: 3_500_00,
        designation: 'EMPLOYEE',
      },
    ];

    const summary = summarizeRetirementContributionLimits({
      accounts: ACCOUNTS,
      contributions,
      profile: { taxYear: 2025, ageAtYearEnd: 45 },
    });
    const ira = summary.rows.find((row) => row.group === 'IRA_COMBINED');

    expect(ira).toMatchObject({
      contributedCents: 7_500_00,
      limitCents: 7_000_00,
      overageCents: 500_00,
      status: 'OVER_LIMIT',
    });
    expect(summary.warnings.some((warning) => warning.includes('IRA_COMBINED'))).toBe(true);
  });

  it('separates employee deferral and total annual additions for employer plans', () => {
    const contributions: RetirementContributionTransaction[] = [
      {
        id: 'employee-401k',
        accountId: 'work-401k',
        date: '2024-06-01',
        amountCents: 23_000_00,
        designation: 'EMPLOYEE',
      },
      {
        id: 'employer-match',
        accountId: 'work-401k',
        date: '2024-06-01',
        amountCents: 5_000_00,
        designation: 'EMPLOYER',
      },
    ];

    const summary = summarizeRetirementContributionLimits({
      accounts: ACCOUNTS,
      contributions,
      profile: { taxYear: 2024, ageAtYearEnd: 45 },
    });
    const deferral = summary.rows.find((row) => row.group === 'EMPLOYER_PLAN_EMPLOYEE_DEFERRAL');
    const total = summary.rows.find((row) => row.group === 'EMPLOYER_PLAN_TOTAL_ANNUAL_ADDITIONS');

    expect(deferral?.contributedCents).toBe(23_000_00);
    expect(total?.contributedCents).toBe(28_000_00);
  });

  it('uses HSA family limit and age 55 catch-up', () => {
    const summary = summarizeRetirementContributionLimits({
      accounts: ACCOUNTS,
      contributions: [
        {
          id: 'hsa-1',
          accountId: 'family-hsa',
          date: '2025-03-01',
          amountCents: 9_000_00,
          designation: 'EMPLOYEE',
        },
      ],
      profile: { taxYear: 2025, ageAtYearEnd: 55 },
    });
    const hsa = summary.rows.find((row) => row.group === 'HSA_FAMILY');

    expect(hsa?.limitCents).toBe(9_550_00);
    expect(hsa?.remainingCents).toBe(550_00);
    expect(hsa?.status).toBe('NEAR_LIMIT');
  });

  it('honors contributionYear override for prior-year IRA contributions made later', () => {
    const summary = summarizeRetirementContributionLimits({
      accounts: ACCOUNTS,
      contributions: [
        {
          id: 'prior-year-ira',
          accountId: 'trad-ira',
          date: '2025-03-01',
          contributionYear: 2024,
          amountCents: 1_000_00,
          designation: 'EMPLOYEE',
        },
      ],
      profile: { taxYear: 2024, ageAtYearEnd: 45 },
    });
    const ira = summary.rows.find((row) => row.group === 'IRA_COMBINED');

    expect(ira?.contributedCents).toBe(1_000_00);
    expect(ira?.remainingCents).toBe(6_000_00);
  });

  it('tracks unsupported account references for review', () => {
    const summary = summarizeRetirementContributionLimits({
      accounts: ACCOUNTS,
      contributions: [
        {
          id: 'missing-account',
          accountId: 'not-classified',
          date: '2025-01-01',
          amountCents: 500_00,
          designation: 'EMPLOYEE',
        },
      ],
      profile: { taxYear: 2025, birthYear: 1985 },
    });

    expect(summary.unsupportedAccountIds).toEqual(['not-classified']);
    expect(summary.warnings[0]).toContain('not classified as a supported retirement account');
  });

  it('warns when employer contributions are tagged on unsupported account types', () => {
    const summary = summarizeRetirementContributionLimits({
      accounts: ACCOUNTS,
      contributions: [
        {
          id: 'employer-roth-ira',
          accountId: 'roth-ira',
          date: '2025-01-01',
          amountCents: 500_00,
          designation: 'EMPLOYER',
        },
      ],
      profile: { taxYear: 2025 },
    });

    expect(summary.unsupportedAccountIds).toEqual(['roth-ira']);
    expect(summary.warnings[0]).toContain('does not support employer contributions');
  });
});
