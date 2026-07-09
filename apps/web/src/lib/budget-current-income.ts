// SPDX-License-Identifier: BUSL-1.1

/**
 * Computes the current calendar month's actual income from transaction history
 * so the budget analytics "Savings Rate" widget reflects real income vs.
 * spending instead of substituting the total budgeted amount for income.
 *
 * The income convention mirrors the spend convention used elsewhere: only
 * `INCOME` transactions count, soft-deleted rows are ignored, and each amount is
 * taken as its absolute value in cents. See issue #3774.
 */

export interface CurrentIncomeTransaction {
  /** Transaction type; only `INCOME` contributes. */
  readonly type: string;
  /** Signed amount in cents (absolute value is used). */
  readonly amountCents: number;
  /** Calendar date as an ISO `YYYY-MM-DD` string. */
  readonly date: string;
  /** True when the transaction has been soft-deleted. */
  readonly deleted: boolean;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Aggregate the current calendar month's income relative to `referenceDate`.
 *
 * @param transactions - Full transaction history (already currency-normalized).
 * @param referenceDate - Any date within the current period; only its year and
 *   month are used to locate the current calendar month.
 * @returns Total income in cents for the current month (0 when none matched).
 */
export function computeCurrentPeriodIncome(
  transactions: readonly CurrentIncomeTransaction[],
  referenceDate: Date,
): number {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const startIso = toIsoDate(new Date(year, month, 1));
  const endIso = toIsoDate(new Date(year, month + 1, 0));

  let total = 0;
  for (const transaction of transactions) {
    if (transaction.deleted || transaction.type !== 'INCOME') continue;
    if (transaction.date < startIso || transaction.date > endIso) continue;
    total += Math.abs(transaction.amountCents);
  }

  return total;
}
