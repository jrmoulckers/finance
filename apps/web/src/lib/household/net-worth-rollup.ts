// SPDX-License-Identifier: BUSL-1.1

/**
 * Privacy-aware household net-worth roll-up helpers.
 *
 * References: issue #2251
 */

export type NetWorthAccountKind = 'ASSET' | 'LIABILITY';
export type NetWorthVisibility = 'DETAILED' | 'AGGREGATE_ONLY' | 'EXCLUDED';

export interface NetWorthAccountInput {
  readonly accountId: string;
  readonly ownerMemberId: string;
  readonly name: string;
  readonly kind: NetWorthAccountKind;
  readonly balanceCents: number;
  readonly visibility: NetWorthVisibility;
}

export interface NetWorthAttribution {
  readonly accountId: string | null;
  readonly ownerMemberId: string | null;
  readonly label: string;
  readonly kind: NetWorthAccountKind;
  readonly amountCents: number;
  readonly visibility: Exclude<NetWorthVisibility, 'EXCLUDED'>;
}

export interface NetWorthRollup {
  readonly assetCents: number;
  readonly liabilityCents: number;
  readonly netWorthCents: number;
  readonly detailedAttributions: readonly NetWorthAttribution[];
  readonly aggregateAttributions: readonly NetWorthAttribution[];
  readonly excludedAccountCount: number;
  readonly privacyExplanation: string;
}

export interface NetWorthSnapshot {
  readonly householdId: string;
  readonly month: string;
  readonly assetCents: number;
  readonly liabilityCents: number;
  readonly netWorthCents: number;
  readonly createdAt: string;
}

function signedContribution(account: Pick<NetWorthAccountInput, 'kind' | 'balanceCents'>): number {
  const amount = Math.abs(Math.round(account.balanceCents));
  return account.kind === 'ASSET' ? amount : -amount;
}

export function buildPrivacyAwareNetWorthRollup(
  accounts: readonly NetWorthAccountInput[],
): NetWorthRollup {
  let assetCents = 0;
  let liabilityCents = 0;
  let excludedAccountCount = 0;
  const detailedAttributions: NetWorthAttribution[] = [];
  const aggregateByKind = new Map<NetWorthAccountKind, number>();

  for (const account of accounts) {
    if (account.visibility === 'EXCLUDED') {
      excludedAccountCount += 1;
      continue;
    }

    const absoluteBalance = Math.abs(Math.round(account.balanceCents));
    if (account.kind === 'ASSET') assetCents += absoluteBalance;
    else liabilityCents += absoluteBalance;

    if (account.visibility === 'DETAILED') {
      detailedAttributions.push({
        accountId: account.accountId,
        ownerMemberId: account.ownerMemberId,
        label: account.name,
        kind: account.kind,
        amountCents: signedContribution(account),
        visibility: 'DETAILED',
      });
    } else {
      aggregateByKind.set(
        account.kind,
        (aggregateByKind.get(account.kind) ?? 0) + signedContribution(account),
      );
    }
  }

  const aggregateAttributions = Array.from(aggregateByKind.entries()).map(
    ([kind, amountCents]) => ({
      accountId: null,
      ownerMemberId: null,
      label: kind === 'ASSET' ? 'Redacted household assets' : 'Redacted household liabilities',
      kind,
      amountCents,
      visibility: 'AGGREGATE_ONLY' as const,
    }),
  );

  return {
    assetCents,
    liabilityCents,
    netWorthCents: assetCents - liabilityCents,
    detailedAttributions,
    aggregateAttributions,
    excludedAccountCount,
    privacyExplanation:
      'Detailed accounts show owner attribution; aggregate-only accounts contribute totals without names; excluded accounts are omitted.',
  };
}

export function createMonthlyNetWorthSnapshot(
  householdId: string,
  month: string,
  rollup: Pick<NetWorthRollup, 'assetCents' | 'liabilityCents' | 'netWorthCents'>,
  createdAt: string,
): NetWorthSnapshot {
  return {
    householdId,
    month,
    assetCents: rollup.assetCents,
    liabilityCents: rollup.liabilityCents,
    netWorthCents: rollup.netWorthCents,
    createdAt,
  };
}
