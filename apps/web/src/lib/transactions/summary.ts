// SPDX-License-Identifier: BUSL-1.1

/**
 * Transaction summary helpers.
 *
 * Produces at-a-glance totals for a set of transactions so the ledger can
 * surface a results summary (count + income / expense / net totals) and
 * per-day subtotals.
 *
 * Net total = income − expenses. Transfers are excluded from the net because
 * they move money between the user's own accounts and are not spend or income.
 * Totals are computed per ISO 4217 currency so mixed-currency lists never sum
 * unlike currencies into a misleading single figure.
 *
 * References: issue #3772
 * @module lib/transactions/summary
 */

import type { Transaction } from '../../kmp/bridge';

/** Income, expense, and net totals (in integer cents) for a single currency. */
export interface CurrencyTotal {
  /** ISO 4217 currency code. */
  readonly currency: string;
  /** Total income in integer cents (positive magnitude). */
  readonly income: number;
  /** Total expenses in integer cents (positive magnitude). */
  readonly expenses: number;
  /** Net amount in integer cents (income positive, expenses negative). */
  readonly net: number;
}

/** Aggregate summary of a set of transactions. */
export interface TransactionSummary {
  /** Number of transactions in the set (all types, including transfers). */
  readonly count: number;
  /** Net totals per currency, sorted by currency code. Transfers excluded. */
  readonly totalsByCurrency: readonly CurrencyTotal[];
  /** True when more than one currency contributes to the net total. */
  readonly isMixedCurrency: boolean;
  /**
   * The net total when every net-contributing transaction shares a single
   * currency; `null` when the set spans multiple currencies or contains no
   * net-contributing transactions (e.g. transfers only).
   */
  readonly singleCurrencyNet: CurrencyTotal | null;
}

/** Running income/expense tallies for one currency, in integer cents. */
interface CurrencyTally {
  income: number;
  expenses: number;
}

/**
 * Summarize a set of transactions into a count and per-currency income,
 * expense, and net totals.
 *
 * @param transactions Transactions to summarize (order-independent).
 * @returns A {@link TransactionSummary}.
 */
export function summarizeTransactions(transactions: readonly Transaction[]): TransactionSummary {
  const tallyByCurrency = new Map<string, CurrencyTally>();

  for (const transaction of transactions) {
    if (transaction.type === 'TRANSFER') {
      continue;
    }
    const code = transaction.currency.code;
    const tally = tallyByCurrency.get(code) ?? { income: 0, expenses: 0 };
    const magnitude = Math.abs(transaction.amount.amount);
    if (transaction.type === 'INCOME') {
      tally.income += magnitude;
    } else if (transaction.type === 'EXPENSE') {
      tally.expenses += magnitude;
    }
    tallyByCurrency.set(code, tally);
  }

  const totalsByCurrency: CurrencyTotal[] = Array.from(tallyByCurrency, ([currency, tally]) => ({
    currency,
    income: tally.income,
    expenses: tally.expenses,
    net: tally.income - tally.expenses,
  })).sort((a, b) => a.currency.localeCompare(b.currency));

  const isMixedCurrency = totalsByCurrency.length > 1;
  const singleCurrencyNet = totalsByCurrency.length === 1 ? totalsByCurrency[0] : null;

  return {
    count: transactions.length,
    totalsByCurrency,
    isMixedCurrency,
    singleCurrencyNet,
  };
}
