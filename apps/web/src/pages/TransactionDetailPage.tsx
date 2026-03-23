// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog, CurrencyDisplay, ErrorBanner, LoadingSpinner } from '../components/common';
import { TransactionForm } from '../components/forms';
import type { CreateTransactionInput } from '../db/repositories/transactions';
import { useAccounts, useCategories, useTransactions } from '../hooks';
import type { Transaction } from '../kmp/bridge';

const TYPE_LABELS: Record<string, string> = {
  EXPENSE: 'Expense',
  INCOME: 'Income',
  TRANSFER: 'Transfer',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  CLEARED: 'Cleared',
  RECONCILED: 'Reconciled',
  VOID: 'Void',
};

/** Detail view for a single transaction route. */
export const TransactionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);

  const {
    transactions,
    loading,
    error,
    refresh: refreshTransactions,
    updateTransaction,
    deleteTransaction,
  } = useTransactions();

  const { accounts, loading: accountsLoading } = useAccounts();
  const { categories, loading: categoriesLoading } = useCategories();

  const transaction = id ? (transactions.find((t) => t.id === id) ?? null) : null;

  const isLoading = loading || accountsLoading || categoriesLoading;

  const accountName = useMemo(
    () =>
      transaction
        ? (accounts.find((a) => a.id === transaction.accountId)?.name ?? 'Unknown account')
        : '',
    [accounts, transaction],
  );

  const categoryName = useMemo(
    () =>
      transaction?.categoryId
        ? (categories.find((c) => c.id === transaction.categoryId)?.name ?? 'Uncategorized')
        : 'Uncategorized',
    [categories, transaction],
  );

  const handleFormCancel = useCallback(() => {
    setIsFormOpen(false);
  }, []);

  const handleFormSubmit = useCallback(
    async (data: CreateTransactionInput): Promise<void> => {
      if (transaction === null) return;
      const result = updateTransaction(transaction.id, data);
      if (result === null) {
        throw new Error('Failed to update transaction. Please try again.');
      }
      setIsFormOpen(false);
      refreshTransactions();
    },
    [refreshTransactions, transaction, updateTransaction],
  );

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
        <LoadingSpinner label="Loading transaction" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refreshTransactions} />;
  }

  if (transaction === null) {
    return (
      <div>
        <Link
          to="/transactions"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-1)',
            color: 'var(--semantic-text-secondary)',
            textDecoration: 'none',
          }}
          aria-label="Back to transactions"
        >
          ← Back to Transactions
        </Link>
        <p
          role="status"
          style={{ marginTop: 'var(--spacing-4)', color: 'var(--semantic-text-secondary)' }}
        >
          Transaction not found.
        </p>
      </div>
    );
  }

  const label =
    transaction.payee?.trim() ||
    transaction.note?.trim() ||
    (transaction.type === 'TRANSFER' ? 'Transfer' : 'Transaction');

  const displayAmount =
    transaction.type === 'EXPENSE'
      ? -Math.abs(transaction.amount.amount)
      : transaction.amount.amount;

  const formattedDate = new Date(`${transaction.date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <Link
        to="/transactions"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--spacing-1)',
          color: 'var(--semantic-text-secondary)',
          textDecoration: 'none',
          marginBottom: 'var(--spacing-3)',
        }}
        aria-label="Back to transactions"
      >
        ← Back to Transactions
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
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            margin: 0,
          }}
        >
          {label}
        </h2>
        <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
          <button
            type="button"
            className="icon-button transaction-item__action"
            onClick={() => setIsFormOpen(true)}
            aria-label={`Edit ${label}`}
          >
            <span aria-hidden="true">✏️</span>
          </button>
          <button
            type="button"
            className="icon-button transaction-item__action transaction-item__action--delete"
            onClick={() => setDeletingTransaction(transaction)}
            aria-label={`Delete ${label}`}
          >
            <span aria-hidden="true">🗑️</span>
          </button>
        </div>
      </div>

      <article
        className="card"
        aria-label="Transaction details"
        style={{ marginBottom: 'var(--spacing-6)' }}
      >
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-4)' }}>
          <div>
            <dt className="card__title">Amount</dt>
            <dd className="card__value">
              <CurrencyDisplay
                amount={displayAmount}
                currency={transaction.currency.code}
                colorize
                showSign
              />
            </dd>
          </div>
          <div>
            <dt className="card__title">Type</dt>
            <dd>{TYPE_LABELS[transaction.type] ?? transaction.type}</dd>
          </div>
          <div>
            <dt className="card__title">Date</dt>
            <dd>{formattedDate}</dd>
          </div>
          <div>
            <dt className="card__title">Status</dt>
            <dd>{STATUS_LABELS[transaction.status] ?? transaction.status}</dd>
          </div>
          <div>
            <dt className="card__title">Account</dt>
            <dd>{accountName}</dd>
          </div>
          <div>
            <dt className="card__title">Category</dt>
            <dd>{categoryName}</dd>
          </div>
          {transaction.note !== null && transaction.note.trim().length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <dt className="card__title">Notes</dt>
              <dd>{transaction.note}</dd>
            </div>
          )}
          {transaction.tags.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <dt className="card__title">Tags</dt>
              <dd>{transaction.tags.join(', ')}</dd>
            </div>
          )}
        </dl>
      </article>

      <TransactionForm
        isOpen={isFormOpen}
        accounts={accounts}
        categories={categories}
        initialData={transaction}
        onSubmit={handleFormSubmit}
        onCancel={handleFormCancel}
      />

      <ConfirmDialog
        isOpen={deletingTransaction !== null}
        title="Delete Transaction"
        message={deletingTransaction !== null ? `Are you sure you want to delete "${label}"?` : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (deletingTransaction === null) return;
          const deleted = deleteTransaction(deletingTransaction.id);
          if (deleted) {
            setDeletingTransaction(null);
            refreshTransactions();
            navigate('/transactions', { replace: true });
          }
        }}
        onCancel={() => setDeletingTransaction(null)}
      />
    </>
  );
};

export default TransactionDetailPage;
