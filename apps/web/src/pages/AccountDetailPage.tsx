// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog, CurrencyDisplay, ErrorBanner, LoadingSpinner } from '../components/common';
import { AccountForm } from '../components/forms';
import { useAccounts, useTransactions } from '../hooks';
import type { Account } from '../kmp/bridge';

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CHECKING: 'Checking',
  SAVINGS: 'Savings',
  CREDIT_CARD: 'Credit Card',
  CASH: 'Cash',
  INVESTMENT: 'Investment',
  LOAN: 'Loan',
  OTHER: 'Other',
};

const headingStyle = {
  fontSize: 'var(--type-scale-headline-font-size)',
  fontWeight: 'var(--type-scale-headline-font-weight)',
  margin: 0,
} as const;

/** Detail view for a single account route. */
export const AccountDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);

  const { accounts, loading, error, refresh, updateAccount, deleteAccount } = useAccounts();

  const recentFilters = useMemo(() => (id ? { accountId: id, limit: 5 } : {}), [id]);
  const {
    transactions: recentTransactions,
    loading: recentTransactionsLoading,
    error: recentTransactionsError,
    refresh: refreshRecentTransactions,
  } = useTransactions(recentFilters);

  const account = id ? (accounts.find((a) => a.id === id) ?? null) : null;

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
        <LoadingSpinner label="Loading account" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  if (account === null) {
    return (
      <div>
        <Link
          to="/accounts"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-1)',
            color: 'var(--semantic-text-secondary)',
            textDecoration: 'none',
          }}
          aria-label="Back to accounts"
        >
          ← Back to Accounts
        </Link>
        <p
          role="status"
          style={{ marginTop: 'var(--spacing-4)', color: 'var(--semantic-text-secondary)' }}
        >
          Account not found.
        </p>
      </div>
    );
  }

  return (
    <>
      <Link
        to="/accounts"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--spacing-1)',
          color: 'var(--semantic-text-secondary)',
          textDecoration: 'none',
          marginBottom: 'var(--spacing-3)',
        }}
        aria-label="Back to accounts"
      >
        ← Back to Accounts
      </Link>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--spacing-3)',
          flexWrap: 'wrap',
          marginBottom: 'var(--spacing-4)',
        }}
      >
        <h2 style={headingStyle}>{account.name}</h2>
        <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
          <button
            type="button"
            className="form-button form-button--secondary"
            onClick={() => setIsFormOpen(true)}
            aria-label={`Edit ${account.name}`}
          >
            ✏️ Edit
          </button>
          <button
            type="button"
            className="form-button confirm-dialog__confirm confirm-dialog__confirm--danger"
            onClick={() => setDeletingAccount(account)}
            aria-label={`Delete ${account.name}`}
          >
            🗑️ Delete
          </button>
        </div>
      </div>

      <article
        className="card"
        aria-label="Account details"
        style={{ marginBottom: 'var(--spacing-6)' }}
      >
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-4)' }}>
          <div>
            <dt className="card__title">Balance</dt>
            <dd className="card__value">
              <CurrencyDisplay
                amount={account.currentBalance.amount}
                currency={account.currency.code}
                colorize
              />
            </dd>
          </div>
          <div>
            <dt className="card__title">Type</dt>
            <dd>{ACCOUNT_TYPE_LABELS[account.type] ?? account.type}</dd>
          </div>
          <div>
            <dt className="card__title">Currency</dt>
            <dd>{account.currency.code}</dd>
          </div>
          {account.isArchived && (
            <div>
              <dt className="card__title">Status</dt>
              <dd>Archived</dd>
            </div>
          )}
        </dl>
      </article>

      <section aria-label="Recent transactions">
        <h3
          style={{
            fontWeight: 'var(--font-weight-semibold)',
            marginBottom: 'var(--spacing-2)',
          }}
        >
          Recent Transactions
        </h3>
        {recentTransactionsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-4) 0' }}>
            <LoadingSpinner label="Loading recent transactions" />
          </div>
        ) : recentTransactionsError ? (
          <ErrorBanner message={recentTransactionsError} onRetry={refreshRecentTransactions} />
        ) : recentTransactions.length === 0 ? (
          <div className="card">
            <p
              style={{
                margin: 0,
                color: 'var(--semantic-text-secondary)',
              }}
            >
              No recent transactions for this account.
            </p>
          </div>
        ) : (
          <div className="card">
            <ul className="list-group" role="list">
              {recentTransactions.map((transaction) => {
                const label =
                  transaction.payee?.trim() ||
                  transaction.note?.trim() ||
                  (transaction.type === 'TRANSFER' ? 'Transfer' : 'Transaction');
                const displayAmount =
                  transaction.type === 'EXPENSE'
                    ? -Math.abs(transaction.amount.amount)
                    : transaction.amount.amount;

                return (
                  <li key={transaction.id} role="listitem">
                    <Link
                      to={`/transactions/${transaction.id}`}
                      className="list-item"
                      style={{
                        display: 'flex',
                        width: '100%',
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                      aria-label={`View details for ${label}`}
                    >
                      <div className="list-item__content">
                        <p className="list-item__primary">{label}</p>
                        <p className="list-item__secondary">{transaction.date}</p>
                      </div>
                      <div className="list-item__trailing">
                        <CurrencyDisplay
                          amount={displayAmount}
                          currency={transaction.currency.code}
                          colorize
                          showSign
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <AccountForm
        isOpen={isFormOpen}
        initialData={account}
        onCancel={handleCloseForm}
        onSubmit={async (data) => {
          const updated = updateAccount(account.id, {
            householdId: account.householdId,
            name: data.name,
            type: data.type,
            currency: data.currency,
            currentBalance: data.currentBalance,
          });
          if (updated === null) {
            throw new Error('Failed to update account.');
          }
          handleCloseForm();
        }}
      />

      <ConfirmDialog
        isOpen={deletingAccount !== null}
        title="Delete account"
        message={
          deletingAccount !== null ? `Are you sure you want to delete ${deletingAccount.name}?` : ''
        }
        confirmLabel="Delete"
        onCancel={() => setDeletingAccount(null)}
        onConfirm={() => {
          if (deletingAccount === null) return;
          const deleted = deleteAccount(deletingAccount.id);
          if (deleted) {
            setDeletingAccount(null);
            navigate('/accounts', { replace: true });
          }
        }}
      />
    </>
  );
};

export default AccountDetailPage;
