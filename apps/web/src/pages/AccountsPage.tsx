// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo, useState } from 'react';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { useAccounts } from '../hooks';
import type { AccountType } from '../kmp/bridge';

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
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const { accounts, loading, error, refresh } = useAccounts();

  const accountGroups = useMemo(
    () =>
      ACCOUNT_TYPE_ORDER.map((type) => ({
        type,
        label: ACCOUNT_TYPE_LABELS[type],
        accounts: accounts.filter((account) => account.type === type),
      })).filter((group) => group.accounts.length > 0),
    [accounts],
  );

  const selectedAccount =
    selectedAccountId !== null
      ? (accounts.find((account) => account.id === selectedAccountId) ?? null)
      : null;
  const netWorth = accounts.reduce((sum, account) => sum + account.currentBalance.amount, 0);

  if (loading) {
    return (
      <>
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            marginBottom: 'var(--spacing-2)',
          }}
        >
          Accounts
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
          <LoadingSpinner label="Loading accounts" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            marginBottom: 'var(--spacing-2)',
          }}
        >
          Accounts
        </h2>
        <ErrorBanner message={error} onRetry={refresh} />
      </>
    );
  }

  if (accounts.length === 0) {
    return (
      <>
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            marginBottom: 'var(--spacing-2)',
          }}
        >
          Accounts
        </h2>
        <EmptyState
          title="No accounts yet"
          description="Add your first account to start tracking your balances."
        />
      </>
    );
  }

  if (selectedAccount !== null) {
    return (
      <>
        <button
          type="button"
          className="icon-button"
          onClick={() => setSelectedAccountId(null)}
          aria-label="Back"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2>{selectedAccount.name}</h2>
        <article className="card" aria-label="Account details">
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-4)' }}>
            <div>
              <dt className="card__title">Balance</dt>
              <dd className="card__value">
                <CurrencyDisplay
                  amount={selectedAccount.currentBalance.amount}
                  currency={selectedAccount.currency.code}
                  colorize
                />
              </dd>
            </div>
            <div>
              <dt className="card__title">Type</dt>
              <dd>{ACCOUNT_TYPE_LABELS[selectedAccount.type]}</dd>
            </div>
          </dl>
        </article>
      </>
    );
  }

  return (
    <>
      <h2
        style={{
          fontSize: 'var(--type-scale-headline-font-size)',
          fontWeight: 'var(--type-scale-headline-font-weight)',
          marginBottom: 'var(--spacing-2)',
        }}
      >
        Accounts
      </h2>
      <p
        style={{ marginBottom: 'var(--spacing-6)', color: 'var(--semantic-text-secondary)' }}
        aria-live="polite"
      >
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
                    <button
                      type="button"
                      className="list-item"
                      style={{
                        width: '100%',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onClick={() => setSelectedAccountId(account.id)}
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
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}
    </>
  );
};

export default AccountsPage;
