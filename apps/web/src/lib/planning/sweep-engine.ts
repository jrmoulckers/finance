// SPDX-License-Identifier: BUSL-1.1

/**
 * Sweep rule engine for automated savings transfers.
 *
 * Evaluates configurable sweep rules against current account data
 * to determine what transfers should occur. Supports simulation mode
 * for previewing rule effects without executing.
 *
 * All monetary values are in cents (integers).
 *
 * References: #1635
 */

import type { SweepRule, SweepEvaluation, SweepLogEntry } from './types';

// ---------------------------------------------------------------------------
// Account data interface
// ---------------------------------------------------------------------------

/** Simplified account data needed for sweep rule evaluation. */
export interface SweepAccountData {
  readonly id: string;
  readonly name: string;
  readonly balanceCents: number;
}

/** Recent transaction for round-up calculations. */
export interface RecentTransaction {
  readonly amountCents: number;
  readonly accountId: string;
  readonly type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
}

/** Data context for evaluating sweep rules. */
export interface SweepContext {
  readonly accounts: readonly SweepAccountData[];
  readonly goals: readonly { readonly id: string; readonly name: string }[];
  readonly recentTransactions: readonly RecentTransaction[];
  /** Current day of month (1-31). */
  readonly dayOfMonth: number;
}

// ---------------------------------------------------------------------------
// Evaluation engine
// ---------------------------------------------------------------------------

/**
 * Evaluate a single sweep rule against the current context.
 *
 * Calculates the amount to sweep based on rule type and checks feasibility.
 *
 * @param rule - The sweep rule to evaluate
 * @param context - Current account and transaction data
 * @returns Evaluation result with sweep amount and feasibility
 */
export function evaluateRule(rule: SweepRule, context: SweepContext): SweepEvaluation {
  const sourceAccount = context.accounts.find((a) => a.id === rule.sourceAccountId);
  const destination =
    rule.destinationType === 'account'
      ? context.accounts.find((a) => a.id === rule.destinationId)
      : context.goals.find((g) => g.id === rule.destinationId);

  if (!sourceAccount) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      amountCents: 0,
      sourceAccountName: 'Unknown account',
      destinationName: destination?.name ?? 'Unknown destination',
      feasible: false,
      reason: 'Source account not found.',
    };
  }

  if (!destination) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      amountCents: 0,
      sourceAccountName: sourceAccount.name,
      destinationName: 'Unknown destination',
      feasible: false,
      reason: 'Destination account or goal not found.',
    };
  }

  let amountCents = 0;

  switch (rule.type) {
    case 'round-up':
      amountCents = calculateRoundUp(context.recentTransactions, rule);
      break;
    case 'percent-of-income':
      amountCents = calculatePercentOfIncome(context.recentTransactions, rule);
      break;
    case 'threshold':
      amountCents = calculateThreshold(sourceAccount, rule);
      break;
    case 'fixed-amount':
      amountCents = rule.fixedAmountCents ?? 0;
      break;
    case 'date-based':
      amountCents = calculateDateBased(context.dayOfMonth, rule);
      break;
  }

  const feasible = amountCents > 0 && sourceAccount.balanceCents >= amountCents;
  const reason = !feasible
    ? amountCents <= 0
      ? 'No amount to sweep based on current data.'
      : 'Insufficient balance in source account.'
    : undefined;

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    amountCents: Math.max(0, amountCents),
    sourceAccountName: sourceAccount.name,
    destinationName: destination.name,
    feasible,
    reason,
  };
}

/**
 * Evaluate all enabled rules and return simulation results.
 *
 * @param rules - All configured sweep rules
 * @param context - Current account and transaction data
 * @returns Array of evaluations for enabled rules
 */
export function evaluateAllRules(
  rules: readonly SweepRule[],
  context: SweepContext,
): SweepEvaluation[] {
  return rules.filter((r) => r.enabled).map((rule) => evaluateRule(rule, context));
}

/**
 * Create a log entry for a sweep evaluation (simulation or execution).
 *
 * @param evaluation - The sweep evaluation result
 * @param mode - Whether this is simulated or executed
 * @returns A sweep log entry
 */
export function createLogEntry(
  evaluation: SweepEvaluation,
  mode: 'simulated' | 'executed',
): SweepLogEntry {
  return {
    id: crypto.randomUUID(),
    ruleId: evaluation.ruleId,
    ruleName: evaluation.ruleName,
    amountCents: evaluation.amountCents,
    timestamp: new Date().toISOString(),
    mode,
    success: evaluation.feasible,
  };
}

// ---------------------------------------------------------------------------
// Rule-type calculators
// ---------------------------------------------------------------------------

/**
 * Calculate round-up amount from recent expense transactions.
 *
 * For each expense, rounds up to the nearest target amount and sums the differences.
 */
function calculateRoundUp(transactions: readonly RecentTransaction[], rule: SweepRule): number {
  const target = rule.roundUpTargetCents ?? 100; // Default: round to $1
  const expenses = transactions.filter(
    (t) => t.type === 'EXPENSE' && t.accountId === rule.sourceAccountId,
  );

  return expenses.reduce((total, t) => {
    const remainder = t.amountCents % target;
    if (remainder === 0) return total;
    return total + (target - remainder);
  }, 0);
}

/**
 * Calculate percentage of recent income to sweep.
 */
function calculatePercentOfIncome(
  transactions: readonly RecentTransaction[],
  rule: SweepRule,
): number {
  const percent = rule.percentOfIncome ?? 10;
  const incomeTotal = transactions
    .filter((t) => t.type === 'INCOME' && t.accountId === rule.sourceAccountId)
    .reduce((sum, t) => sum + t.amountCents, 0);

  return Math.round((incomeTotal * percent) / 100);
}

/**
 * Calculate excess above threshold to sweep.
 */
function calculateThreshold(account: SweepAccountData, rule: SweepRule): number {
  const threshold = rule.thresholdCents ?? 0;
  const excess = account.balanceCents - threshold;
  return Math.max(0, excess);
}

/**
 * Calculate date-based sweep amount (only triggers on matching day).
 */
function calculateDateBased(currentDay: number, rule: SweepRule): number {
  if (currentDay !== (rule.dayOfMonth ?? 1)) {
    return 0;
  }
  return rule.fixedAmountCents ?? 0;
}

// ---------------------------------------------------------------------------
// Rule factory helpers
// ---------------------------------------------------------------------------

/** Create a new round-up sweep rule. */
export function createRoundUpRule(
  name: string,
  sourceAccountId: string,
  destinationId: string,
  destinationType: 'account' | 'goal',
  roundUpTargetCents: number = 100,
): SweepRule {
  return {
    id: crypto.randomUUID(),
    name,
    type: 'round-up',
    enabled: true,
    sourceAccountId,
    destinationId,
    destinationType,
    roundUpTargetCents,
    createdAt: new Date().toISOString(),
  };
}

/** Create a new percent-of-income sweep rule. */
export function createPercentRule(
  name: string,
  sourceAccountId: string,
  destinationId: string,
  destinationType: 'account' | 'goal',
  percentOfIncome: number = 10,
): SweepRule {
  return {
    id: crypto.randomUUID(),
    name,
    type: 'percent-of-income',
    enabled: true,
    sourceAccountId,
    destinationId,
    destinationType,
    percentOfIncome,
    createdAt: new Date().toISOString(),
  };
}

/** Create a new threshold-based sweep rule. */
export function createThresholdRule(
  name: string,
  sourceAccountId: string,
  destinationId: string,
  destinationType: 'account' | 'goal',
  thresholdCents: number,
): SweepRule {
  return {
    id: crypto.randomUUID(),
    name,
    type: 'threshold',
    enabled: true,
    sourceAccountId,
    destinationId,
    destinationType,
    thresholdCents,
    createdAt: new Date().toISOString(),
  };
}

/** Create a new fixed-amount sweep rule. */
export function createFixedAmountRule(
  name: string,
  sourceAccountId: string,
  destinationId: string,
  destinationType: 'account' | 'goal',
  fixedAmountCents: number,
  dayOfMonth?: number,
): SweepRule {
  return {
    id: crypto.randomUUID(),
    name,
    type: dayOfMonth ? 'date-based' : 'fixed-amount',
    enabled: true,
    sourceAccountId,
    destinationId,
    destinationType,
    fixedAmountCents,
    dayOfMonth,
    createdAt: new Date().toISOString(),
  };
}
