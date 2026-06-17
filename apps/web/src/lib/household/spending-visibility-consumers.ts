// SPDX-License-Identifier: BUSL-1.1

import type {
  SpendingVisibilityDecision,
  SpendingVisibilityRule,
  SpendingVisibilityTransaction,
} from './spending-visibility';
import { evaluateSpendingVisibility } from './spending-visibility';

export interface RedactedBudgetTransaction {
  readonly id: string;
  readonly amountCents: number;
  readonly detailLevel: SpendingVisibilityDecision['detailLevel'];
  readonly categoryId: string | null;
  readonly merchant: string | null;
  readonly label: string;
}

export interface SharedBudgetVisibilitySummary {
  readonly totalCents: number;
  readonly detailedTransactions: readonly RedactedBudgetTransaction[];
  readonly aggregateOnlyCents: number;
  readonly hiddenTransactionIds: readonly string[];
}

export interface ReconciliationVisibilitySummary {
  readonly clearedCents: number;
  readonly detailRows: readonly RedactedBudgetTransaction[];
  readonly redactedRowCount: number;
}

export interface VisibilityRuleChangeActivityInput {
  readonly actorMemberId: string;
  readonly accountId: string;
  readonly previousLevel: SpendingVisibilityRule['level'] | null;
  readonly nextLevel: SpendingVisibilityRule['level'];
  readonly updatedAt: string;
}

export interface VisibilityRuleChangeActivity {
  readonly type: 'VISIBILITY_RULE_CHANGED';
  readonly actorMemberId: string;
  readonly accountId: string;
  readonly label: string;
  readonly updatedAt: string;
}

export function summarizeSharedBudgetSpendingWithVisibility(
  rules: readonly SpendingVisibilityRule[],
  transactions: readonly SpendingVisibilityTransaction[],
  viewerMemberId: string,
): SharedBudgetVisibilitySummary {
  const detailedTransactions: RedactedBudgetTransaction[] = [];
  const hiddenTransactionIds: string[] = [];
  let totalCents = 0;
  let aggregateOnlyCents = 0;

  for (const transaction of transactions) {
    const row = redactTransactionForConsumer(rules, transaction, viewerMemberId);
    if (!row) {
      hiddenTransactionIds.push(transaction.id);
      continue;
    }

    totalCents += row.amountCents;
    if (row.detailLevel === 'AGGREGATE') {
      aggregateOnlyCents += row.amountCents;
    } else {
      detailedTransactions.push(row);
    }
  }

  return { totalCents, detailedTransactions, aggregateOnlyCents, hiddenTransactionIds };
}

export function summarizeReconciliationWithVisibility(
  rules: readonly SpendingVisibilityRule[],
  transactions: readonly SpendingVisibilityTransaction[],
  viewerMemberId: string,
): ReconciliationVisibilitySummary {
  const budgetSummary = summarizeSharedBudgetSpendingWithVisibility(rules, transactions, viewerMemberId);
  return {
    clearedCents: budgetSummary.totalCents,
    detailRows: budgetSummary.detailedTransactions,
    redactedRowCount: transactions.length - budgetSummary.detailedTransactions.length -
      budgetSummary.hiddenTransactionIds.length,
  };
}

export function buildVisibilityRuleChangeActivity(
  input: VisibilityRuleChangeActivityInput,
): VisibilityRuleChangeActivity {
  return {
    type: 'VISIBILITY_RULE_CHANGED',
    actorMemberId: input.actorMemberId,
    accountId: input.accountId,
    label: `Spending visibility changed from ${safeLevelLabel(input.previousLevel)} to ${safeLevelLabel(input.nextLevel)}. Transaction details are not shown in this activity item.`,
    updatedAt: input.updatedAt,
  };
}

function redactTransactionForConsumer(
  rules: readonly SpendingVisibilityRule[],
  transaction: SpendingVisibilityTransaction,
  viewerMemberId: string,
): RedactedBudgetTransaction | null {
  const decision = evaluateSpendingVisibility(rules, transaction, viewerMemberId);
  if (!decision.visible) return null;

  if (decision.detailLevel === 'AGGREGATE') {
    return {
      id: transaction.id,
      amountCents: transaction.amountCents,
      detailLevel: decision.detailLevel,
      categoryId: null,
      merchant: null,
      label: decision.redactionLabel ?? 'Transaction details hidden',
    };
  }

  return {
    id: transaction.id,
    amountCents: transaction.amountCents,
    detailLevel: decision.detailLevel,
    categoryId: transaction.categoryId,
    merchant: transaction.merchant,
    label: transaction.merchant ?? transaction.categoryId ?? 'Transaction',
  };
}

function safeLevelLabel(level: SpendingVisibilityRule['level'] | null): string {
  if (level === null) return 'not shared';
  if (level === 'AGGREGATE_ONLY') return 'aggregate totals only';
  if (level === 'SHARED_TRANSACTIONS') return 'shared details';
  if (level === 'CUSTOM') return 'custom sharing';
  return 'private';
}
