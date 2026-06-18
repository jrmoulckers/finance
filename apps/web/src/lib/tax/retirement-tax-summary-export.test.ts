// SPDX-License-Identifier: BUSL-1.1

import { describe, expect, it } from 'vitest';
import {
  summarizeRetirementContributionLimits,
  type RetirementAccountClassification,
  type RetirementContributionTransaction,
} from './retirement-contribution-limits';
import {
  buildRetirementTaxSummaryExport,
  getRetirementContributionConstantsUpdateWorkflow,
} from './retirement-tax-summary-export';

const accounts: RetirementAccountClassification[] = [
  { accountId: 'work', accountType: '401K', taxTreatment: 'PRE_TAX' },
];
const contributions: RetirementContributionTransaction[] = [
  {
    id: 'deferral',
    accountId: 'work',
    date: '2025-01-10',
    amountCents: 23_000_00,
    designation: 'EMPLOYEE',
  },
];

describe('retirement-tax-summary-export', () => {
  it('exports contributed, remaining, status, and IRS source for each limit group', () => {
    const summary = summarizeRetirementContributionLimits({
      accounts,
      contributions,
      profile: { taxYear: 2025, ageAtYearEnd: 45 },
    });
    const output = buildRetirementTaxSummaryExport(summary);
    const deferral = output.rows.find((row) => row.group === 'EMPLOYER_PLAN_EMPLOYEE_DEFERRAL');

    expect(deferral).toMatchObject({
      contributedCents: 23_000_00,
      limitCents: 23_500_00,
      remainingCents: 500_00,
      overLimit: false,
    });
    expect(deferral?.irsSource).toContain('IRS Notice 2024-80');
    expect(output.disclaimer).toContain('not tax advice');
  });

  it('documents the future constants update workflow', () => {
    const workflow = getRetirementContributionConstantsUpdateWorkflow();

    expect(workflow.map((step) => step.order)).toEqual([1, 2, 3]);
    expect(workflow[1].label).toContain('without overwriting prior-year values');
  });
});
