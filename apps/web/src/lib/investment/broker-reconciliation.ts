// SPDX-License-Identifier: BUSL-1.1

/** Source-agnostic brokerage reconciliation and duplicate detection engine. References: issue #2629 */
export type BrokerActivityType = 'BUY' | 'SELL' | 'DIVIDEND' | 'TRANSFER' | 'FEE' | 'CASH';
export type ReconciliationSeverity = 'info' | 'warning' | 'critical';
export type ReconciliationIssueType =
  'duplicate-activity' | 'position-mismatch' | 'cash-mismatch' | 'possible-transfer';

export interface BrokerActivity {
  readonly id: string;
  readonly source: string;
  readonly accountId: string;
  readonly type: BrokerActivityType;
  readonly tradeDate: string;
  readonly symbol?: string;
  readonly symbolAlias?: string;
  readonly quantity?: number;
  readonly amountCents: number;
  readonly currency: string;
  readonly feeCents?: number;
}

export interface BrokerPosition {
  readonly source: string;
  readonly accountId: string;
  readonly symbol: string;
  readonly quantity: number;
  readonly marketValueCents: number;
  readonly currency: string;
}

export interface CashBalance {
  readonly source: string;
  readonly accountId: string;
  readonly currency: string;
  readonly balanceCents: number;
}

export interface ReconciliationIssue {
  readonly type: ReconciliationIssueType;
  readonly severity: ReconciliationSeverity;
  readonly reason: string;
  readonly activityIds: readonly string[];
  readonly accountIds: readonly string[];
  readonly symbol?: string;
  readonly deltaCents?: number;
  readonly deltaQuantity?: number;
}

export interface ReconciliationSummary {
  readonly duplicateGroups: readonly (readonly string[])[];
  readonly issues: readonly ReconciliationIssue[];
  readonly positionsChecked: number;
  readonly cashBalancesChecked: number;
  readonly criticalCount: number;
  readonly warningCount: number;
}

export interface ReconcileInput {
  readonly activities: readonly BrokerActivity[];
  readonly positions: readonly BrokerPosition[];
  readonly cashBalances: readonly CashBalance[];
  readonly symbolAliases?: Readonly<Record<string, string>>;
  readonly quantityTolerance?: number;
  readonly cashToleranceCents?: number;
}

function canonicalSymbol(
  symbol: string | undefined,
  aliases: Readonly<Record<string, string>>,
): string {
  if (!symbol) return '';
  const upper = symbol.toUpperCase();
  return (aliases[upper] ?? upper).toUpperCase();
}

function activityKey(activity: BrokerActivity, aliases: Readonly<Record<string, string>>): string {
  return [
    activity.accountId,
    activity.type,
    activity.tradeDate,
    canonicalSymbol(activity.symbolAlias ?? activity.symbol, aliases),
    Math.round((activity.quantity ?? 0) * 1_000_000),
    activity.amountCents + (activity.feeCents ?? 0),
    activity.currency.toUpperCase(),
  ].join('|');
}

export function reconcileBrokerageData(input: ReconcileInput): ReconciliationSummary {
  const aliases = input.symbolAliases ?? {};
  const quantityTolerance = input.quantityTolerance ?? 0.000001;
  const cashToleranceCents = input.cashToleranceCents ?? 1;
  const issues: ReconciliationIssue[] = [];
  const duplicateGroups: string[][] = [];
  const activityGroups = new Map<string, BrokerActivity[]>();

  for (const activity of input.activities) {
    const key = activityKey(activity, aliases);
    activityGroups.set(key, [...(activityGroups.get(key) ?? []), activity]);
  }

  for (const group of activityGroups.values()) {
    if (group.length > 1 && new Set(group.map((activity) => activity.source)).size > 1) {
      const ids = group.map((activity) => activity.id);
      duplicateGroups.push(ids);
      issues.push({
        type: 'duplicate-activity',
        severity: 'warning',
        reason: 'Same normalized activity appears in more than one import source.',
        activityIds: ids,
        accountIds: [...new Set(group.map((activity) => activity.accountId))],
        symbol: canonicalSymbol(group[0]?.symbol, aliases),
      });
    }
  }

  const transferCandidates = input.activities.filter(
    (activity) => activity.type === 'TRANSFER' || !activity.symbol,
  );
  for (const outgoing of transferCandidates) {
    for (const incoming of transferCandidates) {
      if (outgoing.id >= incoming.id || outgoing.accountId === incoming.accountId) continue;
      if (
        outgoing.currency.toUpperCase() !== incoming.currency.toUpperCase() ||
        outgoing.tradeDate !== incoming.tradeDate
      )
        continue;
      if (outgoing.amountCents + incoming.amountCents === 0) {
        issues.push({
          type: 'possible-transfer',
          severity: 'info',
          reason:
            'Equal and opposite same-day cash movement likely represents an internal transfer.',
          activityIds: [outgoing.id, incoming.id],
          accountIds: [outgoing.accountId, incoming.accountId],
        });
      }
    }
  }

  const positionGroups = new Map<string, BrokerPosition[]>();
  for (const position of input.positions) {
    const key = [
      position.accountId,
      canonicalSymbol(position.symbol, aliases),
      position.currency.toUpperCase(),
    ].join('|');
    positionGroups.set(key, [...(positionGroups.get(key) ?? []), position]);
  }

  for (const [key, group] of positionGroups) {
    if (new Set(group.map((position) => position.source)).size < 2) continue;
    const quantities = group.map((position) => position.quantity);
    const values = group.map((position) => position.marketValueCents);
    const deltaQuantity = Math.max(...quantities) - Math.min(...quantities);
    const deltaCents = Math.max(...values) - Math.min(...values);
    if (deltaQuantity > quantityTolerance || deltaCents > cashToleranceCents) {
      issues.push({
        type: 'position-mismatch',
        severity: deltaCents > 10_00 || deltaQuantity > 0.001 ? 'critical' : 'warning',
        reason: 'Same account and symbol disagree across brokerage sources.',
        activityIds: [],
        accountIds: [...new Set(group.map((position) => position.accountId))],
        symbol: key.split('|')[1],
        deltaCents,
        deltaQuantity,
      });
    }
  }

  const cashGroups = new Map<string, CashBalance[]>();
  for (const balance of input.cashBalances) {
    const key = [balance.accountId, balance.currency.toUpperCase()].join('|');
    cashGroups.set(key, [...(cashGroups.get(key) ?? []), balance]);
  }

  for (const group of cashGroups.values()) {
    if (new Set(group.map((balance) => balance.source)).size < 2) continue;
    const values = group.map((balance) => balance.balanceCents);
    const deltaCents = Math.max(...values) - Math.min(...values);
    if (deltaCents > cashToleranceCents) {
      issues.push({
        type: 'cash-mismatch',
        severity: deltaCents > 100_00 ? 'critical' : 'warning',
        reason: 'Cash balance differs across sources after tolerance.',
        activityIds: [],
        accountIds: [...new Set(group.map((balance) => balance.accountId))],
        deltaCents,
      });
    }
  }

  return {
    duplicateGroups,
    issues,
    positionsChecked: input.positions.length,
    cashBalancesChecked: input.cashBalances.length,
    criticalCount: issues.filter((issue) => issue.severity === 'critical').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
  };
}
