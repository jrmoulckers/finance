// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppIcon } from '../components/icons';

import { CurrencyDisplay, ErrorBanner, LoadingSpinner } from '../components/common';
import { AccountDeleteDialog } from '../components/accounts';
import { AccountForm } from '../components/forms';
import { Breadcrumb } from '../components/navigation';
import { useAccounts, useTransactions } from '../hooks';
import type { Account } from '../kmp/bridge';
import '../components/navigation/breadcrumb.css';
import '../styles/pages.css';
import { formatDate } from '../utils/formatDate';

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CHECKING: 'Checking',
  SAVINGS: 'Savings',
  CREDIT_CARD: 'Credit Card',
  CASH: 'Cash',
  INVESTMENT: 'Investment',
  LOAN: 'Loan',
  OTHER: 'Other',
};

/** Detail view for a single account route. */
export const AccountDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);

  const { accounts, loading, error, refresh, updateAccount, deleteAccount } = useAccounts();

  const recentFilters = useMemo(() => (id ? { accountId: id, limit: 5 } : {}), [id]);
  const allAccountFilters = useMemo(() => (id ? { accountId: id } : {}), [id]);
  const {
    transactions: recentTransactions,
    loading: recentTransactionsLoading,
    error: recentTransactionsError,
    refresh: refreshRecentTransactions,
  } = useTransactions(recentFilters);
  const { transactions: allAccountTransactions } = useTransactions(allAccountFilters);

  const account = id ? (accounts.find((a) => a.id === id) ?? null) : null;

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
  }, []);

  if (loading) {
    return (
      <div className="page-loading">
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
        <Link to="/accounts" className="page-back-link" aria-label="Back to accounts">
          ← Back to Accounts
        </Link>
        <p role="status" className="page-status-text">
          Account not found.
        </p>
      </div>
    );
  }

  return (
    <>
      <Breadcrumb segments={[{ label: 'Accounts', href: '/accounts' }, { label: account.name }]} />

      <div className="page-header">
        <h2 className="page-heading">{account.name}</h2>
        <div className="page-actions">
          <button
            type="button"
            className="form-button form-button--secondary"
            onClick={() => setIsFormOpen(true)}
            aria-label={`Edit ${account.name}`}
          >
            <AppIcon name="edit" /> Edit
          </button>
          <button
            type="button"
            className="form-button confirm-dialog__confirm confirm-dialog__confirm--danger"
            onClick={() => setDeletingAccount(account)}
            aria-label={`Delete ${account.name}`}
          >
            <AppIcon name="trash" /> Delete
          </button>
        </div>
      </div>

      <article className="card page-card--spaced" aria-label="Account details">
        <dl className="page-detail-grid">
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
        <h3 className="page-section-heading">Recent Transactions</h3>
        {recentTransactionsLoading ? (
          <div className="page-loading">
            <LoadingSpinner label="Loading recent transactions" />
          </div>
        ) : recentTransactionsError ? (
          <ErrorBanner message={recentTransactionsError} onRetry={refreshRecentTransactions} />
        ) : recentTransactions.length === 0 ? (
          <div className="card">
            <p className="page-empty-text">No recent transactions for this account.</p>
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
                      className="list-item page-list-link"
                      aria-label={`View details for ${label}`}
                    >
                      <div className="list-item__content">
                        <p className="list-item__primary">{label}</p>
                        <p className="list-item__secondary">{formatDate(transaction.date)}</p>
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

      <AccountDeleteDialog
        isOpen={deletingAccount !== null}
        accountName={deletingAccount?.name ?? ''}
        transactionCount={allAccountTransactions.length}
        onCancel={() => setDeletingAccount(null)}
        onConfirm={(_deleteTransactions) => {
          if (deletingAccount === null) return;
          // TODO: If _deleteTransactions is true, cascade delete via hook
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
