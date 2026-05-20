// SPDX-License-Identifier: BUSL-1.1

/**
 * Expense groups with flexible split methods.
 *
 * Supports equal, percentage, exact-amount, and income-ratio splits.
 * Tracks running balances per member and computes minimal settlements.
 *
 * All monetary values are in integer cents. Banker's rounding is used
 * for all divisions. All functions are pure.
 *
 * References: issue #1792
 */

import type {
  ExpenseGroup,
  ExpenseSplit,
  GroupExpense,
  ISODateString,
  MemberBalance,
  Settlement,
  SplitMethod,
  UserId,
} from './types';

// ---------------------------------------------------------------------------
// Group Management
// ---------------------------------------------------------------------------

/**
 * Create a new expense group.
 *
 * @param id - Unique group identifier.
 * @param name - Human-readable group name.
 * @param description - Optional group description.
 * @param memberIds - IDs of the group members.
 * @param splitMethod - Default split method for expenses in this group.
 * @param now - Current ISO timestamp.
 * @returns A new {@link ExpenseGroup}.
 */
export function createExpenseGroup(
  id: string,
  name: string,
  description: string,
  memberIds: readonly UserId[],
  splitMethod: SplitMethod,
  now: ISODateString,
): ExpenseGroup {
  return { id, name, description, memberIds, splitMethod, createdAt: now };
}

// ---------------------------------------------------------------------------
// Split Calculators
// ---------------------------------------------------------------------------

/**
 * Split an amount equally among members (banker's rounding, remainder to first).
 *
 * @param amountCents - Total amount in cents.
 * @param memberIds - Members sharing the amount.
 * @returns Array of {@link ExpenseSplit}.
 */
export function splitEqual(amountCents: number, memberIds: readonly UserId[]): ExpenseSplit[] {
  if (memberIds.length === 0) return [];

  const count = memberIds.length;
  const base = Math.floor(amountCents / count);
  const remainder = amountCents - base * count;

  return memberIds.map((userId, i) => ({
    userId,
    amountCents: base + (i < remainder ? 1 : 0),
  }));
}

/**
 * Split an amount by percentage weights (must sum to 100).
 *
 * Uses banker's rounding. Any rounding remainder is assigned to the first member.
 *
 * @param amountCents - Total amount in cents.
 * @param members - Array of `{ userId, percent }` where percent totals 100.
 * @returns Array of {@link ExpenseSplit}.
 */
export function splitByPercentage(
  amountCents: number,
  members: readonly { userId: UserId; percent: number }[],
): ExpenseSplit[] {
  if (members.length === 0) return [];

  const totalPercent = members.reduce((s, m) => s + m.percent, 0);
  if (totalPercent === 0) {
    return members.map((m) => ({ userId: m.userId, amountCents: 0 }));
  }

  const splits: ExpenseSplit[] = members.map((m) => ({
    userId: m.userId,
    amountCents: Math.floor((amountCents * m.percent) / totalPercent),
  }));

  const allocated = splits.reduce((s, sp) => s + sp.amountCents, 0);
  const diff = amountCents - allocated;
  if (diff !== 0) {
    splits[0] = { ...splits[0], amountCents: splits[0].amountCents + diff };
  }

  return splits;
}

/**
 * Split by exact amounts provided per member.
 *
 * This performs no calculation — it validates that the sum matches the total.
 *
 * @param amountCents - Expected total in cents.
 * @param splits - Pre-defined splits.
 * @returns The splits unchanged, or an empty array if the sum doesn't match.
 */
export function splitExact(amountCents: number, splits: readonly ExpenseSplit[]): ExpenseSplit[] {
  const sum = splits.reduce((s, sp) => s + sp.amountCents, 0);
  if (sum !== amountCents) return [];
  return [...splits];
}

/**
 * Split by income ratio.
 *
 * Each member pays proportionally to their income. Uses banker's rounding
 * with remainder to the first member.
 *
 * @param amountCents - Total amount in cents.
 * @param members - Array of `{ userId, incomeCents }`.
 * @returns Array of {@link ExpenseSplit}.
 */
export function splitByIncomeRatio(
  amountCents: number,
  members: readonly { userId: UserId; incomeCents: number }[],
): ExpenseSplit[] {
  if (members.length === 0) return [];

  const totalIncome = members.reduce((s, m) => s + m.incomeCents, 0);
  if (totalIncome === 0) {
    // Fall back to equal split when no income data is available
    return splitEqual(
      amountCents,
      members.map((m) => m.userId),
    );
  }

  const splits: ExpenseSplit[] = members.map((m) => ({
    userId: m.userId,
    amountCents: Math.floor((amountCents * m.incomeCents) / totalIncome),
  }));

  const allocated = splits.reduce((s, sp) => s + sp.amountCents, 0);
  const diff = amountCents - allocated;
  if (diff !== 0) {
    splits[0] = { ...splits[0], amountCents: splits[0].amountCents + diff };
  }

  return splits;
}

// ---------------------------------------------------------------------------
// Expense Creation
// ---------------------------------------------------------------------------

/**
 * Create a group expense with pre-computed splits.
 *
 * @param id - Unique expense identifier.
 * @param groupId - The group this expense belongs to.
 * @param paidBy - User who paid.
 * @param amountCents - Total amount in cents.
 * @param description - What the expense was for.
 * @param date - Date of the expense (ISO string).
 * @param splits - Pre-computed splits for each member.
 * @returns A new {@link GroupExpense}.
 */
export function createGroupExpense(
  id: string,
  groupId: string,
  paidBy: UserId,
  amountCents: number,
  description: string,
  date: ISODateString,
  splits: readonly ExpenseSplit[],
): GroupExpense {
  return { id, groupId, paidBy, amountCents, description, date, splits };
}

// ---------------------------------------------------------------------------
// Running Balances
// ---------------------------------------------------------------------------

/**
 * Compute running balances for all members in a group.
 *
 * Positive balance = owed money by others. Negative = owes money to others.
 *
 * @param expenses - All expenses in the group.
 * @param memberIds - All member IDs in the group.
 * @returns Array of {@link MemberBalance} (one per member).
 */
export function computeBalances(
  expenses: readonly GroupExpense[],
  memberIds: readonly UserId[],
): MemberBalance[] {
  const balanceMap = new Map<UserId, number>();
  for (const id of memberIds) {
    balanceMap.set(id, 0);
  }

  for (const expense of expenses) {
    // The payer is owed the total minus their own share
    for (const split of expense.splits) {
      if (split.userId === expense.paidBy) {
        // Payer's share — they paid but also owe this to themselves = net positive for rest
        balanceMap.set(
          expense.paidBy,
          (balanceMap.get(expense.paidBy) ?? 0) + (expense.amountCents - split.amountCents),
        );
      } else {
        // Non-payer owes their split to the payer
        balanceMap.set(split.userId, (balanceMap.get(split.userId) ?? 0) - split.amountCents);
      }
    }

    // If the payer is not in the splits, they are owed the full amount
    if (!expense.splits.some((s) => s.userId === expense.paidBy)) {
      balanceMap.set(expense.paidBy, (balanceMap.get(expense.paidBy) ?? 0) + expense.amountCents);
    }
  }

  return memberIds.map((userId) => ({
    userId,
    balanceCents: balanceMap.get(userId) ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Settlement Calculator
// ---------------------------------------------------------------------------

/**
 * Compute minimal settlements to balance all members.
 *
 * Uses a greedy algorithm: repeatedly settle the largest debtor with the
 * largest creditor until all balances are zero.
 *
 * @param balances - Current member balances.
 * @returns Array of {@link Settlement} needed to reach zero balances.
 */
export function computeSettlements(balances: readonly MemberBalance[]): Settlement[] {
  // Work with mutable copies
  const work = balances.map((b) => ({ userId: b.userId, balance: b.balanceCents }));
  const settlements: Settlement[] = [];

  while (true) {
    // Find max creditor and max debtor
    let maxCreditor = { userId: '', balance: 0 };
    let maxDebtor = { userId: '', balance: 0 };

    for (const w of work) {
      if (w.balance > maxCreditor.balance) maxCreditor = w;
      if (w.balance < maxDebtor.balance) maxDebtor = w;
    }

    if (maxCreditor.balance <= 0 || maxDebtor.balance >= 0) break;

    const settleAmount = Math.min(maxCreditor.balance, -maxDebtor.balance);
    if (settleAmount === 0) break;

    settlements.push({
      from: maxDebtor.userId,
      to: maxCreditor.userId,
      amountCents: settleAmount,
    });

    maxCreditor.balance -= settleAmount;
    maxDebtor.balance += settleAmount;
  }

  return settlements;
}

// ---------------------------------------------------------------------------
// Group Expense History
// ---------------------------------------------------------------------------

/**
 * Filter expenses by group.
 *
 * @param expenses - All expenses.
 * @param groupId - Group to filter by.
 * @returns Expenses belonging to the group.
 */
export function getExpensesByGroup(
  expenses: readonly GroupExpense[],
  groupId: string,
): GroupExpense[] {
  return expenses.filter((e) => e.groupId === groupId);
}

/**
 * Compute total spent in a group (in cents).
 *
 * @param expenses - All expenses in the group.
 * @returns Total in cents.
 */
export function computeGroupTotal(expenses: readonly GroupExpense[]): number {
  return expenses.reduce((sum, e) => sum + e.amountCents, 0);
}
