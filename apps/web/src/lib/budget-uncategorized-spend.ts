// SPDX-License-Identifier: BUSL-1.1

/**
 * Computes the current calendar month's expense spend that no budget can
 * claim because it has no category, so the budget "Spent" total can surface it
 * explicitly instead of understating real spending. See issue #4613.
 *
 * The spend convention mirrors the budgets repository: only `EXPENSE`
 * transactions count, soft-deleted rows are ignored, and amounts are integer
 * minor units taken as absolute values (no rounding is involved). A split
 * transaction contributes only the portions whose category is missing.
 */

export interface UncategorizedSpendSplit {
  /** Split category id, or null/empty when the portion is uncategorized. */
  readonly categoryId: string | null | undefined;
  /** Split amount in cents (absolute value is used). */
  readonly amountCents: number;
}

export interface UncategorizedSpendTransaction {
  readonly type: string;
  /** Signed amount in cents (absolute value is used). */
  readonly amountCents: number;
  /** Calendar date as an ISO `YYYY-MM-DD` string. */
  readonly date: string;
  readonly categoryId: string | null | undefined;
  readonly deleted: boolean;
  readonly splits?: readonly UncategorizedSpendSplit[] | null;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Total uncategorized expense (cents) in the calendar month of `referenceDate`.
 */
export function computeUncategorizedSpend(
  transactions: readonly UncategorizedSpendTransaction[],
  referenceDate: Date,
): number {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const startIso = toIsoDate(new Date(year, month, 1));
  const endIso = toIsoDate(new Date(year, month + 1, 0));

  let total = 0;
  for (const transaction of transactions) {
    if (transaction.deleted || transaction.type !== 'EXPENSE') continue;
    if (transaction.date < startIso || transaction.date > endIso) continue;

    if (transaction.splits && transaction.splits.length > 0) {
      for (const split of transaction.splits) {
        if (!split.categoryId) total += Math.abs(split.amountCents);
      }
    } else if (!transaction.categoryId) {
      total += Math.abs(transaction.amountCents);
    }
  }

  return total;
}
