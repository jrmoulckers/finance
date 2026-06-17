// SPDX-License-Identifier: BUSL-1.1

/**
 * Retirement contribution-limit rows for Tax Center summaries and exports.
 *
 * IRS constants are versioned by tax year and surfaced with source text so users
 * can review the exact published limit used. References: issue #2724.
 */

import {
  getRetirementLimitDefinitions,
  type ContributionLimitGroup,
  type RetirementContributionLimitSummary,
} from './retirement-contribution-limits';

export interface RetirementTaxSummaryExportRow {
  readonly taxYear: number;
  readonly group: ContributionLimitGroup;
  readonly contributedCents: number;
  readonly limitCents: number;
  readonly remainingCents: number;
  readonly overageCents: number;
  readonly status: string;
  readonly nearLimit: boolean;
  readonly overLimit: boolean;
  readonly irsSource: string;
}

export interface RetirementContributionConstantsUpdateStep {
  readonly order: number;
  readonly label: string;
  readonly owner: 'tax-sme' | 'engineering';
}

export interface RetirementTaxSummaryExport {
  readonly taxYear: number;
  readonly rows: readonly RetirementTaxSummaryExportRow[];
  readonly constantsUpdateWorkflow: readonly RetirementContributionConstantsUpdateStep[];
  readonly disclaimer: string;
}

function sourceByGroup(taxYear: number): Map<ContributionLimitGroup, string> {
  return new Map(getRetirementLimitDefinitions(taxYear).map((definition) => [definition.group, definition.source]));
}

export function getRetirementContributionConstantsUpdateWorkflow(): RetirementContributionConstantsUpdateStep[] {
  return [
    { order: 1, label: 'Monitor IRS annual inflation-adjustment notices and revenue procedures for the next tax year.', owner: 'tax-sme' },
    { order: 2, label: 'Add new constants as a new tax-year entry without overwriting prior-year values.', owner: 'tax-sme' },
    { order: 3, label: 'Add tests for base limits, catch-up limits, and source strings before enabling exports.', owner: 'engineering' },
  ];
}

export function buildRetirementTaxSummaryExport(summary: RetirementContributionLimitSummary): RetirementTaxSummaryExport {
  const sources = sourceByGroup(summary.taxYear);
  return {
    taxYear: summary.taxYear,
    rows: summary.rows.map((row) => ({
      taxYear: summary.taxYear,
      group: row.group,
      contributedCents: row.contributedCents,
      limitCents: row.limitCents,
      remainingCents: row.remainingCents,
      overageCents: row.overageCents,
      status: row.status,
      nearLimit: row.status === 'NEAR_LIMIT',
      overLimit: row.status === 'OVER_LIMIT',
      irsSource: sources.get(row.group) ?? 'No IRS source configured for this tax year/group.',
    })),
    constantsUpdateWorkflow: getRetirementContributionConstantsUpdateWorkflow(),
    disclaimer: 'Retirement limit summaries use documented IRS constants for educational planning and are not tax advice.',
  };
}
