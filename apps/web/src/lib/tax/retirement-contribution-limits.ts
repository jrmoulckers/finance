// SPDX-License-Identifier: BUSL-1.1

/**
 * Retirement contribution-limit tracking for tax-year compliance planning.
 *
 * Amounts are integer cents. Constants are published IRS annual limits for
 * 2024 and 2025 and should be versioned by tax year rather than overwritten.
 * Calculations are estimates and do not validate IRA income phase-outs.
 *
 * References: IRC §219 IRA, §401(k)/§403(b) elective deferrals, §223 HSA,
 * IRS Notice 2023-75, Rev. Proc. 2023-34, Notice 2024-80, Rev. Proc. 2024-25;
 * issue #2287.
 */

const NEAR_LIMIT_THRESHOLD = 0.9;

export type RetirementAccountType =
  'TRADITIONAL_IRA' | 'ROTH_IRA' | '401K' | 'ROTH_401K' | '403B' | 'SEP_IRA' | 'HSA' | 'FSA';

export type RetirementTaxTreatment = 'PRE_TAX' | 'ROTH' | 'AFTER_TAX' | 'EMPLOYER';
export type ContributionDesignation = 'EMPLOYEE' | 'EMPLOYER';
export type HsaCoverageLevel = 'SELF_ONLY' | 'FAMILY';
export type ContributionLimitStatus = 'OK' | 'NEAR_LIMIT' | 'OVER_LIMIT' | 'UNSUPPORTED_YEAR';

export type ContributionLimitGroup =
  | 'IRA_COMBINED'
  | 'EMPLOYER_PLAN_EMPLOYEE_DEFERRAL'
  | 'EMPLOYER_PLAN_TOTAL_ANNUAL_ADDITIONS'
  | 'HSA_SELF_ONLY'
  | 'HSA_FAMILY'
  | 'HEALTH_FSA';

export interface RetirementAccountClassification {
  readonly accountId: string;
  readonly accountType: RetirementAccountType;
  readonly taxTreatment: RetirementTaxTreatment;
  readonly hsaCoverageLevel?: HsaCoverageLevel;
}

export interface RetirementContributionTransaction {
  readonly id: string;
  readonly accountId: string;
  readonly date: string;
  readonly amountCents: number;
  readonly contributionYear?: number;
  readonly designation: ContributionDesignation;
}

export interface ContributionLimitDefinition {
  readonly group: ContributionLimitGroup;
  readonly taxYear: number;
  readonly baseLimitCents: number;
  readonly catchUpAge: number | null;
  readonly catchUpLimitCents: number;
  readonly superCatchUpAgeMin?: number;
  readonly superCatchUpAgeMax?: number;
  readonly superCatchUpLimitCents?: number;
  readonly source: string;
}

export interface ContributionLimitProfile {
  readonly taxYear: number;
  readonly ageAtYearEnd?: number;
  readonly birthYear?: number;
  readonly hsaCoverageLevel?: HsaCoverageLevel;
}

export interface ContributionLimitSummaryRow {
  readonly group: ContributionLimitGroup;
  readonly taxYear: number;
  readonly contributedCents: number;
  readonly limitCents: number;
  readonly remainingCents: number;
  readonly overageCents: number;
  readonly percentUsed: number;
  readonly status: ContributionLimitStatus;
  readonly catchUpAppliedCents: number;
  readonly contributionIds: readonly string[];
  readonly message: string;
}

export interface RetirementContributionLimitSummary {
  readonly taxYear: number;
  readonly rows: readonly ContributionLimitSummaryRow[];
  readonly totalContributedCents: number;
  readonly warnings: readonly string[];
  readonly unsupportedAccountIds: readonly string[];
}

export const IRS_RETIREMENT_LIMITS: readonly ContributionLimitDefinition[] = [
  {
    group: 'IRA_COMBINED',
    taxYear: 2024,
    baseLimitCents: 7_000_00,
    catchUpAge: 50,
    catchUpLimitCents: 1_000_00,
    source: 'IRS Notice 2023-75: 2024 IRA contribution limit.',
  },
  {
    group: 'EMPLOYER_PLAN_EMPLOYEE_DEFERRAL',
    taxYear: 2024,
    baseLimitCents: 23_000_00,
    catchUpAge: 50,
    catchUpLimitCents: 7_500_00,
    source: 'IRS Notice 2023-75: 2024 401(k)/403(b) elective deferral limit.',
  },
  {
    group: 'EMPLOYER_PLAN_TOTAL_ANNUAL_ADDITIONS',
    taxYear: 2024,
    baseLimitCents: 69_000_00,
    catchUpAge: 50,
    catchUpLimitCents: 7_500_00,
    source: 'IRS Notice 2023-75: 2024 defined-contribution annual additions limit.',
  },
  {
    group: 'HSA_SELF_ONLY',
    taxYear: 2024,
    baseLimitCents: 4_150_00,
    catchUpAge: 55,
    catchUpLimitCents: 1_000_00,
    source: 'IRS Rev. Proc. 2023-34: 2024 HSA self-only limit.',
  },
  {
    group: 'HSA_FAMILY',
    taxYear: 2024,
    baseLimitCents: 8_300_00,
    catchUpAge: 55,
    catchUpLimitCents: 1_000_00,
    source: 'IRS Rev. Proc. 2023-34: 2024 HSA family limit.',
  },
  {
    group: 'HEALTH_FSA',
    taxYear: 2024,
    baseLimitCents: 3_200_00,
    catchUpAge: null,
    catchUpLimitCents: 0,
    source: 'IRS Notice 2023-75: 2024 health FSA salary-reduction limit.',
  },
  {
    group: 'IRA_COMBINED',
    taxYear: 2025,
    baseLimitCents: 7_000_00,
    catchUpAge: 50,
    catchUpLimitCents: 1_000_00,
    source: 'IRS Notice 2024-80: 2025 IRA contribution limit.',
  },
  {
    group: 'EMPLOYER_PLAN_EMPLOYEE_DEFERRAL',
    taxYear: 2025,
    baseLimitCents: 23_500_00,
    catchUpAge: 50,
    catchUpLimitCents: 7_500_00,
    superCatchUpAgeMin: 60,
    superCatchUpAgeMax: 63,
    superCatchUpLimitCents: 11_250_00,
    source: 'IRS Notice 2024-80: 2025 401(k)/403(b) and SECURE 2.0 age 60-63 catch-up.',
  },
  {
    group: 'EMPLOYER_PLAN_TOTAL_ANNUAL_ADDITIONS',
    taxYear: 2025,
    baseLimitCents: 70_000_00,
    catchUpAge: 50,
    catchUpLimitCents: 7_500_00,
    superCatchUpAgeMin: 60,
    superCatchUpAgeMax: 63,
    superCatchUpLimitCents: 11_250_00,
    source: 'IRS Notice 2024-80: 2025 defined-contribution annual additions limit.',
  },
  {
    group: 'HSA_SELF_ONLY',
    taxYear: 2025,
    baseLimitCents: 4_300_00,
    catchUpAge: 55,
    catchUpLimitCents: 1_000_00,
    source: 'IRS Rev. Proc. 2024-25: 2025 HSA self-only limit.',
  },
  {
    group: 'HSA_FAMILY',
    taxYear: 2025,
    baseLimitCents: 8_550_00,
    catchUpAge: 55,
    catchUpLimitCents: 1_000_00,
    source: 'IRS Rev. Proc. 2024-25: 2025 HSA family limit.',
  },
  {
    group: 'HEALTH_FSA',
    taxYear: 2025,
    baseLimitCents: 3_300_00,
    catchUpAge: null,
    catchUpLimitCents: 0,
    source: 'IRS Notice 2024-80: 2025 health FSA salary-reduction limit.',
  },
];

function taxYearFromDate(date: string): number {
  const year = Number.parseInt(date.slice(0, 4), 10);
  if (!Number.isInteger(year)) {
    throw new Error(`Invalid contribution date: ${date}`);
  }
  return year;
}

function resolveAge(profile: ContributionLimitProfile): number | null {
  if (profile.ageAtYearEnd !== undefined) return profile.ageAtYearEnd;
  if (profile.birthYear !== undefined) return profile.taxYear - profile.birthYear;
  return null;
}

function isEmployerPlan(accountType: RetirementAccountType): boolean {
  return accountType === '401K' || accountType === 'ROTH_401K' || accountType === '403B';
}

function supportsEmployerContribution(accountType: RetirementAccountType): boolean {
  return isEmployerPlan(accountType) || accountType === 'SEP_IRA' || accountType === 'HSA';
}

function getLimitDefinition(
  group: ContributionLimitGroup,
  taxYear: number,
): ContributionLimitDefinition | null {
  return (
    IRS_RETIREMENT_LIMITS.find((limit) => limit.group === group && limit.taxYear === taxYear) ??
    null
  );
}

function catchUpForAge(limit: ContributionLimitDefinition, age: number | null): number {
  if (age === null || limit.catchUpAge === null || age < limit.catchUpAge) return 0;
  if (
    limit.superCatchUpAgeMin !== undefined &&
    limit.superCatchUpAgeMax !== undefined &&
    limit.superCatchUpLimitCents !== undefined &&
    age >= limit.superCatchUpAgeMin &&
    age <= limit.superCatchUpAgeMax
  ) {
    return limit.superCatchUpLimitCents;
  }
  return limit.catchUpLimitCents;
}

function effectiveLimitCents(limit: ContributionLimitDefinition, age: number | null): number {
  return limit.baseLimitCents + catchUpForAge(limit, age);
}

function groupForAccount(
  account: RetirementAccountClassification,
  profile: ContributionLimitProfile,
  contribution: RetirementContributionTransaction,
): readonly ContributionLimitGroup[] {
  switch (account.accountType) {
    case 'TRADITIONAL_IRA':
    case 'ROTH_IRA':
      return ['IRA_COMBINED'];
    case '401K':
    case 'ROTH_401K':
    case '403B':
      return contribution.designation === 'EMPLOYEE'
        ? ['EMPLOYER_PLAN_EMPLOYEE_DEFERRAL', 'EMPLOYER_PLAN_TOTAL_ANNUAL_ADDITIONS']
        : ['EMPLOYER_PLAN_TOTAL_ANNUAL_ADDITIONS'];
    case 'SEP_IRA':
      return ['EMPLOYER_PLAN_TOTAL_ANNUAL_ADDITIONS'];
    case 'HSA':
      return [
        (account.hsaCoverageLevel ?? profile.hsaCoverageLevel) === 'FAMILY'
          ? 'HSA_FAMILY'
          : 'HSA_SELF_ONLY',
      ];
    case 'FSA':
      return ['HEALTH_FSA'];
  }
}

function buildMessage(row: Omit<ContributionLimitSummaryRow, 'message'>): string {
  if (row.status === 'UNSUPPORTED_YEAR') {
    return `No IRS limit constant is configured for ${row.group} in ${row.taxYear}.`;
  }
  if (row.status === 'OVER_LIMIT') {
    return `${row.group} exceeds the configured ${row.taxYear} limit by ${row.overageCents} cents.`;
  }
  if (row.status === 'NEAR_LIMIT') {
    return `${row.group} has used ${row.percentUsed}% of the configured ${row.taxYear} limit.`;
  }
  return `${row.group} is within the configured ${row.taxYear} limit.`;
}

/** Return IRS constants for a tax year so UI can disclose the source used. */
export function getRetirementLimitDefinitions(taxYear: number): ContributionLimitDefinition[] {
  return IRS_RETIREMENT_LIMITS.filter((limit) => limit.taxYear === taxYear);
}

/** Calculate the limit for a group after age-based catch-up rules. */
export function getEffectiveRetirementLimitCents(
  group: ContributionLimitGroup,
  profile: ContributionLimitProfile,
): number | null {
  const limit = getLimitDefinition(group, profile.taxYear);
  if (limit === null) return null;
  return effectiveLimitCents(limit, resolveAge(profile));
}

/** Summarize contributions by shared IRS limit group for a tax year. */
export function summarizeRetirementContributionLimits(input: {
  readonly accounts: readonly RetirementAccountClassification[];
  readonly contributions: readonly RetirementContributionTransaction[];
  readonly profile: ContributionLimitProfile;
}): RetirementContributionLimitSummary {
  const accountMap = new Map(input.accounts.map((account) => [account.accountId, account]));
  const grouped = new Map<ContributionLimitGroup, { amount: number; ids: string[] }>();
  const unsupportedAccountIds = new Set<string>();
  const validationWarnings: string[] = [];
  let totalContributedCents = 0;

  for (const contribution of input.contributions) {
    const taxYear = contribution.contributionYear ?? taxYearFromDate(contribution.date);
    if (taxYear !== input.profile.taxYear) continue;

    const account = accountMap.get(contribution.accountId);
    if (account === undefined) {
      unsupportedAccountIds.add(contribution.accountId);
      validationWarnings.push(
        `Contribution ${contribution.id} references account ${contribution.accountId}, which is not classified as a supported retirement account.`,
      );
      continue;
    }

    if (
      contribution.designation === 'EMPLOYER' &&
      !supportsEmployerContribution(account.accountType)
    ) {
      unsupportedAccountIds.add(contribution.accountId);
      validationWarnings.push(
        `Contribution ${contribution.id} is marked employer-funded, but ${account.accountType} does not support employer contributions in this tracker.`,
      );
      continue;
    }

    const contributionAmount = Math.abs(Math.round(contribution.amountCents));
    totalContributedCents += contributionAmount;

    for (const group of groupForAccount(account, input.profile, contribution)) {
      const current = grouped.get(group) ?? { amount: 0, ids: [] };
      grouped.set(group, {
        amount: current.amount + contributionAmount,
        ids: [...current.ids, contribution.id],
      });
    }
  }

  const groups = new Set<ContributionLimitGroup>([
    ...getRetirementLimitDefinitions(input.profile.taxYear).map((limit) => limit.group),
    ...grouped.keys(),
  ]);
  const age = resolveAge(input.profile);
  const rows = [...groups]
    .sort((a, b) => a.localeCompare(b))
    .map((group): ContributionLimitSummaryRow => {
      const limit = getLimitDefinition(group, input.profile.taxYear);
      const contribution = grouped.get(group) ?? { amount: 0, ids: [] };
      if (limit === null) {
        const rowWithoutMessage = {
          group,
          taxYear: input.profile.taxYear,
          contributedCents: contribution.amount,
          limitCents: 0,
          remainingCents: 0,
          overageCents: contribution.amount,
          percentUsed: 0,
          status: 'UNSUPPORTED_YEAR' as const,
          catchUpAppliedCents: 0,
          contributionIds: contribution.ids,
        };
        return { ...rowWithoutMessage, message: buildMessage(rowWithoutMessage) };
      }

      const catchUpAppliedCents = catchUpForAge(limit, age);
      const limitCents = limit.baseLimitCents + catchUpAppliedCents;
      const overageCents = Math.max(0, contribution.amount - limitCents);
      const remainingCents = Math.max(0, limitCents - contribution.amount);
      const percentUsed = limitCents > 0 ? Math.round((contribution.amount / limitCents) * 100) : 0;
      const status: ContributionLimitStatus =
        overageCents > 0
          ? 'OVER_LIMIT'
          : contribution.amount >= limitCents * NEAR_LIMIT_THRESHOLD
            ? 'NEAR_LIMIT'
            : 'OK';
      const rowWithoutMessage = {
        group,
        taxYear: input.profile.taxYear,
        contributedCents: contribution.amount,
        limitCents,
        remainingCents,
        overageCents,
        percentUsed,
        status,
        catchUpAppliedCents,
        contributionIds: contribution.ids,
      };
      return { ...rowWithoutMessage, message: buildMessage(rowWithoutMessage) };
    });

  return {
    taxYear: input.profile.taxYear,
    rows,
    totalContributedCents,
    warnings: [
      ...validationWarnings,
      ...rows
        .filter((row) => row.status === 'NEAR_LIMIT' || row.status === 'OVER_LIMIT')
        .map((row) => row.message),
    ],
    unsupportedAccountIds: [...unsupportedAccountIds].sort(),
  };
}
