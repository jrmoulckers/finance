// SPDX-License-Identifier: BUSL-1.1

/**
 * Category-based spending limits & parent approval workflow.
 *
 * Pure functions for evaluating spending limits, generating approval
 * requests, and processing parent approve/deny decisions.
 * All monetary values in integer cents.
 *
 * References: #1800, #1728
 */

import type { SpendingLimit, LimitPeriod, ApprovalRequest } from './types';
import { bankersRound } from './utils';

// ---------------------------------------------------------------------------
// Types local to this module
// ---------------------------------------------------------------------------

/** A spending transaction to evaluate against limits. */
export interface SpendingTransaction {
  /** Amount in cents. */
  readonly amountCents: number;
  /** Category ID (null = uncategorized). */
  readonly categoryId: string | null;
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
}

/** Result of evaluating a transaction against spending limits. */
export interface LimitCheckResult {
  /** Whether the transaction is allowed. */
  readonly allowed: boolean;
  /** Which limit was exceeded, if any. */
  readonly exceededLimit: SpendingLimit | null;
  /** Amount over the limit in cents (0 if allowed). */
  readonly overageCents: number;
  /** Remaining budget in cents for the applicable limit period. */
  readonly remainingCents: number;
}

/** Summary of spending within a limit period. */
export interface PeriodSpendingSummary {
  /** Limit ID. */
  readonly limitId: string;
  /** Category name. */
  readonly categoryName: string;
  /** Total spent in cents in the current period. */
  readonly spentCents: number;
  /** Maximum allowed in cents. */
  readonly maxCents: number;
  /** Remaining in cents. */
  readonly remainingCents: number;
  /** Usage percentage (0-100). */
  readonly usagePercent: number;
}

// ---------------------------------------------------------------------------
// Limit evaluation
// ---------------------------------------------------------------------------

/**
 * Computes the start of the current period for a given limit.
 *
 * @param period - The limit period type
 * @param now - Current ISO-8601 timestamp
 * @returns ISO-8601 date string for the period start
 */
export function getPeriodStart(period: LimitPeriod, now: string): string {
  const date = new Date(now);
  switch (period) {
    case 'daily':
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
    case 'weekly': {
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      return new Date(date.getFullYear(), date.getMonth(), diff).toISOString();
    }
    case 'monthly':
      return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
  }
}

/**
 * Filters transactions to those within the current period for a limit.
 *
 * @param transactions - All transactions to consider
 * @param limit - The spending limit to filter for
 * @param now - Current ISO-8601 timestamp
 * @returns Transactions matching the limit's category and period
 */
export function getTransactionsInPeriod(
  transactions: readonly SpendingTransaction[],
  limit: SpendingLimit,
  now: string,
): readonly SpendingTransaction[] {
  const periodStart = getPeriodStart(limit.period, now);
  return transactions.filter((t) => {
    const inPeriod = t.timestamp >= periodStart && t.timestamp <= now;
    const matchesCategory = limit.categoryId === null || t.categoryId === limit.categoryId;
    return inPeriod && matchesCategory;
  });
}

/**
 * Calculates total spending in cents for the current limit period.
 *
 * @param transactions - All transactions
 * @param limit - The spending limit
 * @param now - Current ISO-8601 timestamp
 * @returns Total spent in cents
 */
export function calculatePeriodSpending(
  transactions: readonly SpendingTransaction[],
  limit: SpendingLimit,
  now: string,
): number {
  const periodTxns = getTransactionsInPeriod(transactions, limit, now);
  return periodTxns.reduce((sum, t) => sum + t.amountCents, 0);
}

/**
 * Checks a proposed transaction against all applicable spending limits.
 *
 * @param transaction - The proposed transaction
 * @param limits - All spending limits for the account
 * @param existingTransactions - Existing transactions for period calculation
 * @param now - Current ISO-8601 timestamp
 * @returns The limit check result
 */
export function checkSpendingLimits(
  transaction: SpendingTransaction,
  limits: readonly SpendingLimit[],
  existingTransactions: readonly SpendingTransaction[],
  now: string,
): LimitCheckResult {
  const applicableLimits = limits.filter(
    (l) => l.enabled && (l.categoryId === null || l.categoryId === transaction.categoryId),
  );

  for (const limit of applicableLimits) {
    // Per-transaction check
    if (
      limit.perTransactionMaxCents > 0 &&
      transaction.amountCents > limit.perTransactionMaxCents
    ) {
      return {
        allowed: false,
        exceededLimit: limit,
        overageCents: transaction.amountCents - limit.perTransactionMaxCents,
        remainingCents: 0,
      };
    }

    // Period check
    const periodSpent = calculatePeriodSpending(existingTransactions, limit, now);
    const remaining = limit.maxAmountCents - periodSpent;

    if (transaction.amountCents > remaining) {
      return {
        allowed: false,
        exceededLimit: limit,
        overageCents: transaction.amountCents - Math.max(0, remaining),
        remainingCents: Math.max(0, remaining),
      };
    }
  }

  // Find the tightest remaining budget
  let minRemaining = Number.MAX_SAFE_INTEGER;
  for (const limit of applicableLimits) {
    const periodSpent = calculatePeriodSpending(existingTransactions, limit, now);
    const remaining = limit.maxAmountCents - periodSpent - transaction.amountCents;
    if (remaining < minRemaining) minRemaining = remaining;
  }

  return {
    allowed: true,
    exceededLimit: null,
    overageCents: 0,
    remainingCents: minRemaining === Number.MAX_SAFE_INTEGER ? 0 : Math.max(0, minRemaining),
  };
}

/**
 * Creates a spending limit configuration.
 *
 * @param params - Limit creation parameters
 * @returns A new SpendingLimit object
 */
export function createSpendingLimit(params: {
  readonly id: string;
  readonly accountId: string;
  readonly categoryId: string | null;
  readonly categoryName: string;
  readonly maxAmountCents: number;
  readonly period: LimitPeriod;
  readonly perTransactionMaxCents?: number;
}): SpendingLimit {
  return {
    id: params.id,
    accountId: params.accountId,
    categoryId: params.categoryId,
    categoryName: params.categoryName,
    maxAmountCents: params.maxAmountCents,
    period: params.period,
    perTransactionMaxCents: params.perTransactionMaxCents ?? 0,
    enabled: true,
  };
}

// ---------------------------------------------------------------------------
// Approval workflow
// ---------------------------------------------------------------------------

/**
 * Generates an approval request when a spending limit is exceeded.
 *
 * @param params - Request parameters
 * @returns A new ApprovalRequest in pending status
 */
export function createApprovalRequest(params: {
  readonly id: string;
  readonly accountId: string;
  readonly requestorName: string;
  readonly amountCents: number;
  readonly categoryId: string | null;
  readonly description: string;
  readonly now: string;
}): ApprovalRequest {
  return {
    id: params.id,
    accountId: params.accountId,
    requestorName: params.requestorName,
    amountCents: params.amountCents,
    categoryId: params.categoryId,
    description: params.description,
    status: 'pending',
    reviewedBy: null,
    reviewReason: '',
    requestedAt: params.now,
    reviewedAt: '',
  };
}

/**
 * Processes a parent's approval or denial of a spending request.
 *
 * @param request - The pending approval request
 * @param decision - Approve or deny
 * @param reviewerId - ID of the parent reviewing
 * @param reason - Reason for the decision
 * @param now - Current ISO-8601 timestamp
 * @returns Updated approval request with the decision applied
 * @throws If the request is not in pending status
 */
export function reviewApprovalRequest(
  request: ApprovalRequest,
  decision: 'approved' | 'denied',
  reviewerId: string,
  reason: string,
  now: string,
): ApprovalRequest {
  if (request.status !== 'pending') {
    throw new Error(
      `Cannot review request ${request.id}: status is '${request.status}', expected 'pending'`,
    );
  }
  return {
    ...request,
    status: decision,
    reviewedBy: reviewerId,
    reviewReason: reason,
    reviewedAt: now,
  };
}

/**
 * Overrides a spending limit with a new maximum and records the reason.
 *
 * @param limit - The existing spending limit
 * @param newMaxCents - New maximum in cents
 * @param _reason - Reason for the override (for audit logging)
 * @returns Updated spending limit
 */
export function overrideLimit(
  limit: SpendingLimit,
  newMaxCents: number,
  _reason: string,
): SpendingLimit {
  return { ...limit, maxAmountCents: newMaxCents };
}

/**
 * Builds a spending summary for each active limit.
 *
 * @param limits - All spending limits for an account
 * @param transactions - Existing transactions
 * @param now - Current ISO-8601 timestamp
 * @returns Array of period spending summaries
 */
export function buildSpendingSummaries(
  limits: readonly SpendingLimit[],
  transactions: readonly SpendingTransaction[],
  now: string,
): readonly PeriodSpendingSummary[] {
  return limits
    .filter((l) => l.enabled)
    .map((limit) => {
      const spent = calculatePeriodSpending(transactions, limit, now);
      const remaining = Math.max(0, limit.maxAmountCents - spent);
      const usagePercent =
        limit.maxAmountCents === 0 ? 0 : bankersRound((spent / limit.maxAmountCents) * 100);
      return {
        limitId: limit.id,
        categoryName: limit.categoryName,
        spentCents: spent,
        maxCents: limit.maxAmountCents,
        remainingCents: remaining,
        usagePercent: Math.min(100, usagePercent),
      };
    });
}
