// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { AccountForm } from '../components/forms';
import { useAccounts } from '../hooks';
import type { AccountType } from '../kmp/bridge';
import '../styles/pages.css';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: 'Checking',
  SAVINGS: 'Savings',
  CREDIT_CARD: 'Credit Cards',
  CASH: 'Cash',
  INVESTMENT: 'Investments',
  LOAN: 'Loans',
  OTHER: 'Other Accounts',
};

const ACCOUNT_TYPE_ORDER: AccountType[] = [
  'CHECKING',
  'SAVINGS',
  'CREDIT_CARD',
  'CASH',
  'INVESTMENT',
  'LOAN',
  'OTHER',
];

export const AccountsPage: React.FC = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { accounts, loading, error, refresh, createAccount } = useAccounts();

  const accountGroups = useMemo(
    () =>
      ACCOUNT_TYPE_ORDER.map((type) => ({
        type,
        label: ACCOUNT_TYPE_LABELS[type],
        accounts: accounts.filter((account) => account.type === type),
      })).filter((group) => group.accounts.length > 0),
    [accounts],
  );

  const netWorth = accounts.reduce((sum, account) => sum + account.currentBalance.amount, 0);
  const handleCloseForm = () => {
    setIsFormOpen(false);
  };

  const pageHeader = (
    <div className="page-header">
      <h2 className="page-heading">Accounts</h2>
      <button
        type="button"
        className="add-button"
        onClick={() => {
          setIsFormOpen(true);
        }}
        aria-label="Add new account"
      >
        + Add Account
      </button>
    </div>
  );
  const accountForm = (
    <AccountForm
      isOpen={isFormOpen}
      onCancel={handleCloseForm}
      onSubmit={async (data) => {
        const createdAccount = createAccount(data);
        if (createdAccount === null) {
          throw new Error('Failed to create account.');
        }
        handleCloseForm();
      }}
    />
  );

  if (loading) {
    return (
      <>
        <h2 className="page-heading">Accounts</h2>
        <div className="page-loading">
          <LoadingSpinner label="Loading accounts" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <h2 className="page-heading">Accounts</h2>
        <ErrorBanner message={error} onRetry={refresh} />
      </>
    );
  }

  if (accounts.length === 0) {
    return (
      <>
        {pageHeader}
        <EmptyState
          title="No accounts yet"
          description="Add your first account to start tracking your balances."
        />
        {accountForm}
      </>
    );
  }

  return (
    <>
      {pageHeader}
      <p className="page-summary" aria-live="polite">
        Net worth: <CurrencyDisplay amount={netWorth} colorize />
      </p>
      {accountGroups.map((group) => {
        const groupTotal = group.accounts.reduce(
          (sum, account) => sum + account.currentBalance.amount,
          0,
        );

        return (
          <section key={group.type} className="page-section" aria-label={group.label}>
            <div className="page-section__header">
              <h3 className="page-section__title">{group.label}</h3>
              <CurrencyDisplay amount={groupTotal} colorize />
            </div>
            <div className="card">
              <ul className="list-group" role="list">
                {group.accounts.map((account) => (
                  <li key={account.id} role="listitem">
                    <Link
                      to={`/accounts/${account.id}`}
                      className="list-item page-list-link"
                      aria-label={account.name}
                    >
                      <div className="list-item__content">
                        <p className="list-item__primary">{account.name}</p>
                        <p className="list-item__secondary">
                          {account.isArchived
                            ? `${account.currency.code} · Archived`
                            : account.currency.code}
                        </p>
                      </div>
                      <div className="list-item__trailing">
                        <CurrencyDisplay
                          amount={account.currentBalance.amount}
                          currency={account.currency.code}
                          colorize
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}
      {accountForm}
    </>
  );
};

export default AccountsPage;
