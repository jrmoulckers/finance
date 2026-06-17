// SPDX-License-Identifier: BUSL-1.1

import {
  routeTransactionsToAccounts,
  type AccountMappingAction,
  type AccountRouteOverride,
  type AccountRoutingPlan,
  type ExistingImportAccount,
  type RoutedImportTransaction,
  type SourceAccountTransaction,
} from './multi-account-routing';

export interface AccountMappingReviewRow {
  readonly sourceKey: string;
  readonly sourceName: string;
  readonly transactionCount: number;
  readonly amountCentsTotal: number;
  readonly proposedAccountId: string | null;
  readonly selectedAccountId: string | null;
  readonly selectedAccountName: string | null;
  readonly action: AccountMappingAction;
  readonly matchConfidence: number;
  readonly createNewName: string | null;
}

export interface AccountMappingReviewState {
  readonly rows: readonly AccountMappingReviewRow[];
  readonly unroutedRowIndexes: readonly number[];
  readonly reviewed: boolean;
  readonly mappingFingerprint: string;
}

export function buildAccountMappingReview(
  plan: AccountRoutingPlan,
  existingAccounts: readonly ExistingImportAccount[],
  overrides: readonly AccountRouteOverride[] = [],
): AccountMappingReviewState {
  const overrideMap = new Map(overrides.map((override) => [override.sourceKey, override]));
  const rows = plan.accounts.map((account) => {
    const override = overrideMap.get(account.sourceKey);
    const selectedAccountId = override ? override.accountId : account.matchedAccountId;
    const selectedAccount = selectedAccountId
      ? existingAccounts.find((existing) => existing.id === selectedAccountId)
      : undefined;
    const action = override?.action ?? account.action;

    return {
      sourceKey: account.sourceKey,
      sourceName: account.sourceName,
      transactionCount: account.transactionCount,
      amountCentsTotal: account.amountCentsTotal,
      proposedAccountId: account.matchedAccountId,
      selectedAccountId,
      selectedAccountName: selectedAccount?.name ?? null,
      action,
      matchConfidence: account.matchConfidence,
      createNewName: action === 'create' ? account.sourceName : null,
    };
  });

  return {
    rows,
    unroutedRowIndexes: plan.unroutedRowIndexes,
    reviewed: rows.every((row) => row.action !== 'needs_review' || row.selectedAccountId !== null),
    mappingFingerprint: fingerprintRows(rows),
  };
}

export function createAccountRouteOverrides(
  rows: readonly AccountMappingReviewRow[],
): readonly AccountRouteOverride[] {
  return rows.map((row) => ({
    sourceKey: row.sourceKey,
    accountId: row.selectedAccountId,
    action: row.action,
  }));
}

export function applyAccountMappingReview(input: {
  readonly transactions: readonly SourceAccountTransaction[];
  readonly plan: AccountRoutingPlan;
  readonly reviewRows: readonly AccountMappingReviewRow[];
}): {
  readonly overrides: readonly AccountRouteOverride[];
  readonly routedTransactions: readonly RoutedImportTransaction[];
  readonly mappingFingerprint: string;
} {
  const overrides = createAccountRouteOverrides(input.reviewRows);
  return {
    overrides,
    routedTransactions: routeTransactionsToAccounts(input.transactions, input.plan, overrides),
    mappingFingerprint: fingerprintRows(input.reviewRows),
  };
}

function fingerprintRows(rows: readonly AccountMappingReviewRow[]): string {
  let hash = 2166136261;
  for (const row of [...rows].sort((left, right) => left.sourceKey.localeCompare(right.sourceKey))) {
    const part = `${row.sourceKey}|${row.selectedAccountId ?? ''}|${row.action}`;
    for (let index = 0; index < part.length; index++) {
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
