// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo } from 'react';
import { Link } from 'react-router';

import { CurrencyDisplay } from '../common';
import type { Account } from '../../kmp/bridge';

export interface AccountSummaryCardProps {
  /** Visible accounts (already purpose-filtered). */
  readonly accounts: readonly Account[];
  /** Fallback ISO 4217 currency code when an account has none. */
  readonly currency?: string;
}

/** User-facing labels for each account type grouping. */
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CHECKING: 'Checking',
  SAVINGS: 'Savings',
  INVESTMENT: 'Investments',
  CASH: 'Cash',
  CREDIT_CARD: 'Credit Cards',
  LOAN: 'Loans',
  OTHER: 'Other',
};

interface AccountTypeGroup {
  readonly type: string;
  readonly label: string;
  readonly totalCents: number;
  readonly count: number;
  readonly currency: string;
}

function groupAccountsByType(
  accounts: readonly Account[],
  fallbackCurrency: string,
): AccountTypeGroup[] {
  const groups = new Map<string, { total: number; count: number; currency: string }>();

  for (const account of accounts) {
    if (account.isArchived) {
      continue;
    }
    const existing = groups.get(account.type);
    if (existing) {
      existing.total += account.currentBalance.amount;
      existing.count += 1;
    } else {
      groups.set(account.type, {
        total: account.currentBalance.amount,
        count: 1,
        currency: account.currency.code ?? fallbackCurrency,
      });
    }
  }

  return Array.from(groups, ([type, value]) => ({
    type,
    label: ACCOUNT_TYPE_LABELS[type] ?? type,
    totalCents: value.total,
    count: value.count,
    currency: value.currency,
  })).sort((left, right) => Math.abs(right.totalCents) - Math.abs(left.totalCents));
}

/**
 * Breaks the visible accounts down by type (Checking, Savings, Investments,
 * Credit Cards, Loans…) with a per-type balance total and account count, so
 * users can see where their money sits without leaving the home screen.
 */
export const AccountSummaryCard: React.FC<AccountSummaryCardProps> = ({
  accounts,
  currency = 'USD',
}) => {
  const groups = useMemo(() => groupAccountsByType(accounts, currency), [accounts, currency]);

  return (
    <article className="card account-summary-card" aria-label="Account summary by type">
      <div className="card__header">
        <h3 className="card__title">Account Summary</h3>
      </div>
      {groups.length === 0 ? (
        <p className="list-item__secondary">
          No accounts yet. <Link to="/accounts">Add an account</Link> to see balances by type.
        </p>
      ) : (
        <ul className="account-summary-card__list">
          {groups.map((group) => (
            <li key={group.type} className="account-summary-card__item">
              <span className="account-summary-card__label">
                {group.label}
                <span className="account-summary-card__count">
                  {' '}
                  ({group.count} {group.count === 1 ? 'account' : 'accounts'})
                </span>
              </span>
              <span className="account-summary-card__amount">
                <CurrencyDisplay
                  amount={group.totalCents}
                  currency={group.currency}
                  context={`${group.label} balance`}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/accounts" className="auth-footer__link">
        Open Accounts
      </Link>
    </article>
  );
};

export default AccountSummaryCard;
