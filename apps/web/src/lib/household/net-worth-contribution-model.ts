// SPDX-License-Identifier: BUSL-1.1

import { buildPrivacyAwareNetWorthRollup } from './net-worth-rollup';
import type { NetWorthAccountInput, NetWorthRollup, NetWorthVisibility } from './net-worth-rollup';

/** Privacy-aware account contribution presentation model for household net worth (#2681). */

export interface NetWorthContributionRow {
  readonly label: string;
  readonly amountCents: number;
  readonly visibility: NetWorthVisibility;
  readonly ownerMemberId: string | null;
  readonly accountId: string | null;
  readonly explanation: string;
}

export interface NetWorthContributionModel {
  readonly rollup: NetWorthRollup;
  readonly rows: readonly NetWorthContributionRow[];
  readonly copy: {
    readonly detailed: string;
    readonly aggregateOnly: string;
    readonly excluded: string;
  };
}

export function buildNetWorthContributionModel(
  accounts: readonly NetWorthAccountInput[],
): NetWorthContributionModel {
  const rollup = buildPrivacyAwareNetWorthRollup(accounts);
  const detailedRows = rollup.detailedAttributions.map(
    (item): NetWorthContributionRow => ({
      label: item.label,
      amountCents: item.amountCents,
      visibility: 'DETAILED',
      ownerMemberId: item.ownerMemberId,
      accountId: item.accountId,
      explanation:
        'Detailed accounts show account name and owner attribution in the shared roll-up.',
    }),
  );
  const aggregateRows = rollup.aggregateAttributions.map(
    (item): NetWorthContributionRow => ({
      label: item.label,
      amountCents: item.amountCents,
      visibility: 'AGGREGATE_ONLY',
      ownerMemberId: null,
      accountId: null,
      explanation:
        'Aggregate-only accounts add to totals without exposing account names or owners.',
    }),
  );
  const excludedRow: NetWorthContributionRow[] =
    rollup.excludedAccountCount > 0
      ? [
          {
            label: `${rollup.excludedAccountCount} excluded account${rollup.excludedAccountCount === 1 ? '' : 's'}`,
            amountCents: 0,
            visibility: 'EXCLUDED',
            ownerMemberId: null,
            accountId: null,
            explanation:
              'Excluded accounts are omitted from household assets, liabilities, and net worth.',
          },
        ]
      : [];

  return {
    rollup,
    rows: [...detailedRows, ...aggregateRows, ...excludedRow],
    copy: {
      detailed: 'Detailed: included in totals with account and owner attribution.',
      aggregateOnly:
        'Aggregate-only: included in totals, but names and owner attribution are redacted.',
      excluded: 'Excluded: omitted entirely from shared net-worth totals.',
    },
  };
}
