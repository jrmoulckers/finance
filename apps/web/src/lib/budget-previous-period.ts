// SPDX-License-Identifier: BUSL-1.1

/**
 * Computes the previous calendar month's spending totals from transaction
 * history so the budget analytics "vs. Last Period" comparison and per-category
 * trend arrows reflect real data instead of a hardcoded empty baseline.
 *
 * The spend convention mirrors the budgets repository exactly: only `EXPENSE`
 * transactions count, and each amount is taken as its absolute value (see
 * `apps/web/src/db/repositories/budgets.ts` `SUM(CASE WHEN t.type = 'EXPENSE'
 * THEN ABS(t.amount) ...)`). See issue #3363.
 */

export interface PreviousPeriodTransaction {
  /** Transaction type; only `EXPENSE` contributes to spending. */
  readonly type: string;
  /** Signed amount in cents (absolute value is used for spend). */
  readonly amountCents: number;
  /** Calendar date as an ISO `YYYY-MM-DD` string. */
  readonly date: string;
  /** Owning category id, or null when uncategorized. */
  readonly categoryId: string | null;
  /** True when the transaction has been soft-deleted. */
  readonly deleted: boolean;
}

export interface PreviousPeriodSpending {
  /** Total previous-period spend in cents, or null when there is no prior data. */
  readonly previousPeriodSpent: number | null;
  /** Previous-period spend per category name (cents). */
  readonly previousCategorySpending: Map<string, number>;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Aggregate the previous calendar month's expenses relative to `referenceDate`.
 *
 * @param transactions - Full transaction history (already currency-normalized).
 * @param categoryNameById - Map of category id → display name.
 * @param referenceDate - Any date within the current period; only its year and
 *   month are used to locate the immediately preceding calendar month.
 */
export function computePreviousPeriodSpending(
  transactions: readonly PreviousPeriodTransaction[],
  categoryNameById: ReadonlyMap<string, string>,
  referenceDate: Date,
): PreviousPeriodSpending {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const startIso = toIsoDate(new Date(year, month - 1, 1));
  const endIso = toIsoDate(new Date(year, month, 0));

  const previousCategorySpending = new Map<string, number>();
  let total = 0;
  let matched = 0;

  for (const transaction of transactions) {
    if (transaction.deleted || transaction.type !== 'EXPENSE') continue;
    if (transaction.date < startIso || transaction.date > endIso) continue;

    const spend = Math.abs(transaction.amountCents);
    total += spend;
    matched += 1;

    const name =
      (transaction.categoryId && categoryNameById.get(transaction.categoryId)) || 'Uncategorized';
    previousCategorySpending.set(name, (previousCategorySpending.get(name) ?? 0) + spend);
  }

  return {
    previousPeriodSpent: matched > 0 ? total : null,
    previousCategorySpending,
  };
}
