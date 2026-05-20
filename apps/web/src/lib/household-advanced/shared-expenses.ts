// SPDX-License-Identifier: BUSL-1.1

/**
 * Recurring shared expenses with auto-split.
 *
 * Define recurring shared expenses, auto-split on each recurrence,
 * track split history, handle adjustments, and generate annual summaries.
 *
 * All monetary values are in integer cents. All functions are pure.
 *
 * References: issue #1794
 */

import type {
  ExpenseSplit,
  HouseholdId,
  ISODateString,
  RecurrenceCadence,
  SharedExpense,
  SharedExpenseAnnualSummary,
  SharedExpenseOccurrence,
  SplitMethod,
  UserId,
} from './types';

import { splitEqual, splitByPercentage, splitByIncomeRatio } from './expense-groups';

// ---------------------------------------------------------------------------
// Shared Expense Definition
// ---------------------------------------------------------------------------

/**
 * Create a recurring shared expense definition.
 *
 * @param id - Unique identifier.
 * @param householdId - Household context.
 * @param description - Human-readable description.
 * @param amountCents - Recurring amount in cents.
 * @param cadence - How often the expense recurs.
 * @param splitMethod - How to split among members.
 * @param memberIds - Members sharing the expense.
 * @param startDate - When the recurrence starts (ISO string).
 * @returns A new active {@link SharedExpense}.
 */
export function createSharedExpense(
  id: string,
  householdId: HouseholdId,
  description: string,
  amountCents: number,
  cadence: RecurrenceCadence,
  splitMethod: SplitMethod,
  memberIds: readonly UserId[],
  startDate: ISODateString,
): SharedExpense {
  return {
    id,
    householdId,
    description,
    amountCents,
    cadence,
    splitMethod,
    memberIds,
    startDate,
    endDate: null,
    active: true,
  };
}

/**
 * Deactivate a shared expense (stop future recurrences).
 *
 * @param expense - The shared expense to deactivate.
 * @param endDate - The date to stop (ISO string).
 * @returns Updated shared expense with `active` set to `false`.
 */
export function deactivateSharedExpense(
  expense: SharedExpense,
  endDate: ISODateString,
): SharedExpense {
  return { ...expense, active: false, endDate };
}

/**
 * Update the recurring amount.
 *
 * @param expense - The shared expense to update.
 * @param newAmountCents - New amount in cents.
 * @returns Updated shared expense.
 */
export function updateSharedExpenseAmount(
  expense: SharedExpense,
  newAmountCents: number,
): SharedExpense {
  return { ...expense, amountCents: newAmountCents };
}

// ---------------------------------------------------------------------------
// Auto-Split on Recurrence
// ---------------------------------------------------------------------------

/**
 * Generate an auto-split occurrence for a shared expense.
 *
 * Uses the expense's configured split method. For `percentage` and
 * `income_ratio` methods, equal split is used as a fallback since
 * member-specific data is not available here — callers should use
 * {@link generateOccurrenceWithData} instead.
 *
 * @param occurrenceId - Unique occurrence identifier.
 * @param expense - The shared expense definition.
 * @param date - Date of this occurrence (ISO string).
 * @returns A {@link SharedExpenseOccurrence}.
 */
export function generateOccurrence(
  occurrenceId: string,
  expense: SharedExpense,
  date: ISODateString,
): SharedExpenseOccurrence {
  const splits = splitEqual(expense.amountCents, expense.memberIds);
  return {
    id: occurrenceId,
    sharedExpenseId: expense.id,
    date,
    splits,
    adjustmentNote: null,
  };
}

/**
 * Generate an occurrence with member-specific split data.
 *
 * Supports percentage and income-ratio splits in addition to equal.
 *
 * @param occurrenceId - Unique occurrence identifier.
 * @param expense - The shared expense definition.
 * @param date - Date of this occurrence.
 * @param memberData - Per-member data for the split calculation.
 * @returns A {@link SharedExpenseOccurrence}.
 */
export function generateOccurrenceWithData(
  occurrenceId: string,
  expense: SharedExpense,
  date: ISODateString,
  memberData: readonly { userId: UserId; percent?: number; incomeCents?: number }[],
): SharedExpenseOccurrence {
  let splits: ExpenseSplit[];

  switch (expense.splitMethod) {
    case 'percentage':
      splits = splitByPercentage(
        expense.amountCents,
        memberData.map((m) => ({ userId: m.userId, percent: m.percent ?? 0 })),
      );
      break;
    case 'income_ratio':
      splits = splitByIncomeRatio(
        expense.amountCents,
        memberData.map((m) => ({ userId: m.userId, incomeCents: m.incomeCents ?? 0 })),
      );
      break;
    case 'equal':
    case 'exact':
    default:
      splits = splitEqual(expense.amountCents, expense.memberIds);
      break;
  }

  return {
    id: occurrenceId,
    sharedExpenseId: expense.id,
    date,
    splits,
    adjustmentNote: null,
  };
}

// ---------------------------------------------------------------------------
// Adjustments
// ---------------------------------------------------------------------------

/**
 * Apply an adjustment to an occurrence (e.g. a one-time override).
 *
 * @param occurrence - The occurrence to adjust.
 * @param newSplits - Updated splits.
 * @param note - Explanation for the adjustment.
 * @returns Updated occurrence.
 */
export function adjustOccurrence(
  occurrence: SharedExpenseOccurrence,
  newSplits: readonly ExpenseSplit[],
  note: string,
): SharedExpenseOccurrence {
  return { ...occurrence, splits: [...newSplits], adjustmentNote: note };
}

// ---------------------------------------------------------------------------
// Split History
// ---------------------------------------------------------------------------

/**
 * Get all occurrences for a given shared expense.
 *
 * @param occurrences - All occurrences.
 * @param sharedExpenseId - The shared expense to filter by.
 * @returns Filtered occurrences.
 */
export function getOccurrencesForExpense(
  occurrences: readonly SharedExpenseOccurrence[],
  sharedExpenseId: string,
): SharedExpenseOccurrence[] {
  return occurrences.filter((o) => o.sharedExpenseId === sharedExpenseId);
}

/**
 * Compute total split for a specific member across occurrences (in cents).
 *
 * @param occurrences - Occurrences to aggregate.
 * @param userId - Member to total.
 * @returns Total amount in cents.
 */
export function computeMemberTotal(
  occurrences: readonly SharedExpenseOccurrence[],
  userId: UserId,
): number {
  let total = 0;
  for (const occ of occurrences) {
    for (const split of occ.splits) {
      if (split.userId === userId) {
        total += split.amountCents;
      }
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Annual Summary
// ---------------------------------------------------------------------------

/**
 * Generate an annual summary of shared expenses.
 *
 * @param occurrences - All occurrences (pre-filtered to relevant expense IDs).
 * @param year - Calendar year to summarise.
 * @param memberIds - All member IDs to include.
 * @returns A {@link SharedExpenseAnnualSummary}.
 */
export function computeAnnualSummary(
  occurrences: readonly SharedExpenseOccurrence[],
  year: number,
  memberIds: readonly UserId[],
): SharedExpenseAnnualSummary {
  const yearOccurrences = occurrences.filter((o) => {
    const d = new Date(o.date);
    return d.getFullYear() === year;
  });

  const totalCents = yearOccurrences.reduce(
    (sum, o) => sum + o.splits.reduce((s, sp) => s + sp.amountCents, 0),
    0,
  );

  const perMember = memberIds.map((userId) => ({
    userId,
    totalCents: computeMemberTotal(yearOccurrences, userId),
  }));

  return {
    year,
    totalCents,
    occurrenceCount: yearOccurrences.length,
    perMember,
  };
}

// ---------------------------------------------------------------------------
// Recurrence Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the next occurrence date given a cadence and the last occurrence date.
 *
 * @param lastDate - ISO date string of the last occurrence.
 * @param cadence - Recurrence cadence.
 * @returns ISO date string of the next occurrence.
 */
export function computeNextOccurrenceDate(
  lastDate: ISODateString,
  cadence: RecurrenceCadence,
): ISODateString {
  const d = new Date(lastDate);

  switch (cadence) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'biweekly':
      d.setDate(d.getDate() + 14);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'annually':
      d.setFullYear(d.getFullYear() + 1);
      break;
  }

  return d.toISOString();
}
