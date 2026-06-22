// SPDX-License-Identifier: BUSL-1.1

/**
 * Grocery mode section — the thin dashboard adapter for {@link GroceryModeCard}.
 *
 * It maps the dashboard's domain models (bills, budgets) into the small,
 * presentation-agnostic shapes the card expects, then renders the card. Keeping
 * this glue here (rather than inline in `DashboardPage`) lets the whole feature
 * — adapter, card and pure engine — stay in a single lazily-loaded chunk so it
 * never weighs down the already-large dashboard route bundle.
 *
 * The card itself stays pure and easily testable; this wrapper owns the
 * (intentionally minimal) coupling to the app's data shapes.
 *
 * References: issue #2199
 */

import React, { useMemo } from 'react';

import { GroceryModeCard, type GroceryCategoryOption } from './GroceryModeCard';
import type { UpcomingBillInput } from '../../lib/dashboard/grocery-mode';
import { isLiabilityType } from '../../lib/analytics/net-worth';
import type { AccountType } from '../../kmp/bridge';

/** Minimal shape of an account this section needs (a superset of the bridge model). */
export interface GroceryModeSectionAccount {
  readonly type: AccountType;
  readonly currentBalance: { readonly amount: number };
}

/** Minimal shape of a transaction this section needs. */
export interface GroceryModeSectionTransaction {
  readonly type: string;
  readonly date: string;
}

/** Minimal shape of a bill this section needs (a superset of the bridge model). */
export interface GroceryModeSectionBill {
  readonly id: string;
  readonly name: string;
  readonly amount: { readonly amount: number };
  readonly dueDate: string;
  readonly status: string;
}

/** Minimal shape of a budget-with-spending this section needs. */
export interface GroceryModeSectionBudget {
  readonly categoryId: string;
  readonly name: string;
  readonly amount: { readonly amount: number };
  readonly spentAmount: { readonly amount: number };
}

export interface GroceryModeSectionProps {
  /** Accounts whose (non-liability) balances make up the spendable funds. */
  readonly accounts: readonly GroceryModeSectionAccount[];
  /** Amount already earmarked (e.g. savings goals) in integer cents. */
  readonly reservedCents: number;
  /** Bills to consider; mapped to the engine's input shape. */
  readonly bills: readonly GroceryModeSectionBill[];
  /** Active budgets, offered as pinnable categories. */
  readonly budgets: readonly GroceryModeSectionBudget[];
  /** Friendly category names, keyed by category id. */
  readonly categoryNames: ReadonlyMap<string, string>;
  /** Recent transactions; income entries seed the payday estimate. */
  readonly transactions: readonly GroceryModeSectionTransaction[];
  /** Today's date as an ISO `YYYY-MM-DD` string. */
  readonly today: string;
  /** Payday to assume when income history is inconclusive, or `null`. */
  readonly fallbackPayday: string | null;
  /** ISO 4217 currency code. */
  readonly currency: string;
}

/** Matches common high-frequency spending categories worth pinning by default. */
const DEFAULT_CATEGORY_PATTERN = /grocer|food|supermarket/i;

export const GroceryModeSection: React.FC<GroceryModeSectionProps> = ({
  accounts,
  reservedCents,
  bills,
  budgets,
  categoryNames,
  transactions,
  today,
  fallbackPayday,
  currency,
}) => {
  const availableFundsCents = useMemo(
    () =>
      accounts.reduce(
        (sum, account) =>
          isLiabilityType(account.type) ? sum : sum + account.currentBalance.amount,
        0,
      ),
    [accounts],
  );

  const incomeDates = useMemo(
    () =>
      transactions
        .filter((transaction) => transaction.type === 'INCOME')
        .map((transaction) => transaction.date),
    [transactions],
  );

  const cardBills = useMemo<UpcomingBillInput[]>(
    () =>
      bills.map((bill) => ({
        id: bill.id,
        name: bill.name,
        amountCents: bill.amount.amount,
        dueDate: bill.dueDate,
        critical: bill.status === 'UPCOMING' || bill.status === 'OVERDUE',
        paid: bill.status === 'PAID',
      })),
    [bills],
  );

  const categoryOptions = useMemo<GroceryCategoryOption[]>(
    () =>
      budgets.map((budget) => ({
        id: budget.categoryId,
        name: categoryNames.get(budget.categoryId) ?? budget.name,
        budgetCents: budget.amount.amount,
        spentCents: budget.spentAmount.amount,
      })),
    [budgets, categoryNames],
  );

  const defaultPinnedCategoryId = useMemo(
    () => categoryOptions.find((option) => DEFAULT_CATEGORY_PATTERN.test(option.name))?.id ?? null,
    [categoryOptions],
  );

  return (
    <section className="page-section grocery-mode-section" aria-label="Grocery mode">
      <GroceryModeCard
        availableFundsCents={availableFundsCents}
        reservedCents={reservedCents}
        bills={cardBills}
        categoryOptions={categoryOptions}
        today={today}
        incomeDates={incomeDates}
        fallbackPayday={fallbackPayday}
        currency={currency}
        defaultPinnedCategoryId={defaultPinnedCategoryId}
      />
    </section>
  );
};

export default GroceryModeSection;
