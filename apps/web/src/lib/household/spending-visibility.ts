// SPDX-License-Identifier: BUSL-1.1

/**
 * Granular household spending visibility rules.
 *
 * References: issue #2249
 */

export type SpendingVisibilityLevel =
  'PRIVATE' | 'AGGREGATE_ONLY' | 'SHARED_TRANSACTIONS' | 'CUSTOM';

export interface SpendingVisibilityRule {
  readonly id: string;
  readonly accountId: string;
  readonly ownerMemberId: string;
  readonly level: SpendingVisibilityLevel;
  readonly categoryIds?: readonly string[];
  readonly merchants?: readonly string[];
  readonly tags?: readonly string[];
  readonly minimumAmountCents?: number;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly recurringOnly?: boolean;
  readonly updatedAt: string;
}

export interface SpendingVisibilityTransaction {
  readonly id: string;
  readonly accountId: string;
  readonly ownerMemberId: string;
  readonly amountCents: number;
  readonly date: string;
  readonly categoryId: string | null;
  readonly merchant: string | null;
  readonly tags: readonly string[];
  readonly isRecurringBill: boolean;
}

export interface SpendingVisibilityDecision {
  readonly visible: boolean;
  readonly detailLevel: 'NONE' | 'AGGREGATE' | 'DETAIL';
  readonly redactionLabel: string | null;
  readonly matchedRuleId: string | null;
}

export interface SpendingVisibilityPreview {
  readonly visibleTransactionIds: readonly string[];
  readonly redactedTransactionIds: readonly string[];
  readonly hiddenTransactionIds: readonly string[];
  readonly aggregateVisibleCents: number;
  readonly detailVisibleCents: number;
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function hasIntersection(left: readonly string[] | undefined, right: readonly string[]): boolean {
  if (!left || left.length === 0) return true;
  const allowed = new Set(left.map(normalized));
  return right.some((value) => allowed.has(normalized(value)));
}

function customRuleMatches(
  rule: SpendingVisibilityRule,
  transaction: SpendingVisibilityTransaction,
): boolean {
  if (rule.categoryIds?.length && !transaction.categoryId) return false;
  if (rule.categoryIds?.length && !rule.categoryIds.includes(transaction.categoryId ?? ''))
    return false;
  if (rule.merchants?.length && !transaction.merchant) return false;
  if (
    rule.merchants?.length &&
    !rule.merchants.map(normalized).includes(normalized(transaction.merchant ?? ''))
  ) {
    return false;
  }
  if (!hasIntersection(rule.tags, transaction.tags)) return false;
  if (rule.minimumAmountCents !== undefined && transaction.amountCents < rule.minimumAmountCents)
    return false;
  if (rule.startDate && transaction.date.localeCompare(rule.startDate) < 0) return false;
  if (rule.endDate && transaction.date.localeCompare(rule.endDate) > 0) return false;
  if (rule.recurringOnly && !transaction.isRecurringBill) return false;
  return true;
}

export function evaluateSpendingVisibility(
  rules: readonly SpendingVisibilityRule[],
  transaction: SpendingVisibilityTransaction,
  viewerMemberId: string,
): SpendingVisibilityDecision {
  if (viewerMemberId === transaction.ownerMemberId) {
    return { visible: true, detailLevel: 'DETAIL', redactionLabel: null, matchedRuleId: null };
  }

  const candidates = rules.filter(
    (rule) =>
      rule.accountId === transaction.accountId && rule.ownerMemberId === transaction.ownerMemberId,
  );
  const detailRule = candidates.find((rule) => rule.level === 'SHARED_TRANSACTIONS');
  if (detailRule) {
    return {
      visible: true,
      detailLevel: 'DETAIL',
      redactionLabel: null,
      matchedRuleId: detailRule.id,
    };
  }

  const customRule = candidates.find(
    (rule) => rule.level === 'CUSTOM' && customRuleMatches(rule, transaction),
  );
  if (customRule) {
    return {
      visible: true,
      detailLevel: 'DETAIL',
      redactionLabel: null,
      matchedRuleId: customRule.id,
    };
  }

  const aggregateRule = candidates.find((rule) => rule.level === 'AGGREGATE_ONLY');
  if (aggregateRule) {
    return {
      visible: true,
      detailLevel: 'AGGREGATE',
      redactionLabel: 'Transaction details hidden by account visibility settings',
      matchedRuleId: aggregateRule.id,
    };
  }

  return {
    visible: false,
    detailLevel: 'NONE',
    redactionLabel: 'Private transaction',
    matchedRuleId: candidates.find((rule) => rule.level === 'PRIVATE')?.id ?? null,
  };
}

export function buildSpendingVisibilityPreview(
  rules: readonly SpendingVisibilityRule[],
  transactions: readonly SpendingVisibilityTransaction[],
  viewerMemberId: string,
): SpendingVisibilityPreview {
  const visibleTransactionIds: string[] = [];
  const redactedTransactionIds: string[] = [];
  const hiddenTransactionIds: string[] = [];
  let aggregateVisibleCents = 0;
  let detailVisibleCents = 0;

  for (const transaction of transactions) {
    const decision = evaluateSpendingVisibility(rules, transaction, viewerMemberId);
    if (!decision.visible) {
      hiddenTransactionIds.push(transaction.id);
    } else if (decision.detailLevel === 'AGGREGATE') {
      redactedTransactionIds.push(transaction.id);
      aggregateVisibleCents += transaction.amountCents;
    } else {
      visibleTransactionIds.push(transaction.id);
      detailVisibleCents += transaction.amountCents;
      aggregateVisibleCents += transaction.amountCents;
    }
  }

  return {
    visibleTransactionIds,
    redactedTransactionIds,
    hiddenTransactionIds,
    aggregateVisibleCents,
    detailVisibleCents,
  };
}
