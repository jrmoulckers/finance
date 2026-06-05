// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppIcon } from '../components/icons';

import { ConfirmDialog, CurrencyDisplay, ErrorBanner, LoadingSpinner } from '../components/common';
import { TransactionForm } from '../components/forms';
import { Breadcrumb } from '../components/navigation';
import { TagList } from '../components/tags';
import type { CreateTransactionInput } from '../db/repositories/transactions';
import { useAccounts, useCategories, useTransactions } from '../hooks';
import {
  BNPL_CUSTOM_FIELD_KEYS,
  bnplInstallmentCount,
  isBnplInstallmentPaid,
  isBnplLiabilityTransaction,
} from '../lib/bnpl-liability';
import type { Transaction } from '../kmp/bridge';
import '../components/navigation/breadcrumb.css';

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
  const [additionalDetailsOpen, setAdditionalDetailsOpen] = useState(false);
  const [copiedRefId, setCopiedRefId] = useState(false);

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

  /** Whether the transaction has any additional detail fields populated. */
  const hasAdditionalDetails = useMemo(() => {
    if (!transaction) return false;
    return !!(
      transaction.merchantAddress ||
      transaction.merchantCity ||
      transaction.merchantState ||
      transaction.merchantZip ||
      transaction.merchantCountry ||
      transaction.externalReferenceId ||
      transaction.statementDescription ||
      (transaction.customFields && Object.keys(transaction.customFields).length > 0) ||
      transaction.extraNotes
    );
  }, [transaction]);

  /** Format merchant location as a single-line address. */
  const formattedMerchantLocation = useMemo(() => {
    if (!transaction) return null;
    const parts: string[] = [];
    if (transaction.merchantAddress) parts.push(transaction.merchantAddress);
    const cityStateZip = [
      transaction.merchantCity,
      transaction.merchantState
        ? transaction.merchantZip
          ? `${transaction.merchantState} ${transaction.merchantZip}`
          : transaction.merchantState
        : transaction.merchantZip,
    ]
      .filter(Boolean)
      .join(', ');
    if (cityStateZip) parts.push(cityStateZip);
    if (transaction.merchantCountry) parts.push(transaction.merchantCountry);
    return parts.length > 0 ? parts.join(', ') : null;
  }, [transaction]);

  /** Copy external reference ID to clipboard. */
  const handleCopyRefId = useCallback(() => {
    if (!transaction?.externalReferenceId) return;
    navigator.clipboard.writeText(transaction.externalReferenceId).then(() => {
      setCopiedRefId(true);
      setTimeout(() => setCopiedRefId(false), 2000);
    });
  }, [transaction]);

  const isBnplLiability = transaction ? isBnplLiabilityTransaction(transaction) : false;
  const bnplPaid = transaction ? isBnplInstallmentPaid(transaction) : false;
  const bnplCount = transaction ? bnplInstallmentCount(transaction) : null;

  const handleMarkBnplPaid = useCallback(async (): Promise<void> => {
    if (!transaction) return;
    const customFields = {
      ...(transaction.customFields ?? {}),
      [BNPL_CUSTOM_FIELD_KEYS.liabilityType]: 'BNPL',
      [BNPL_CUSTOM_FIELD_KEYS.installmentStatus]: 'PAID',
    };
    const result = updateTransaction(transaction.id, { customFields });
    if (result === null) {
      throw new Error('Failed to mark BNPL installment paid.');
    }
    refreshTransactions();
  }, [refreshTransactions, transaction, updateTransaction]);

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
      <Breadcrumb segments={[{ label: 'Transactions', href: '/transactions' }, { label }]} />

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
            <AppIcon name="edit" />
          </button>
          <button
            type="button"
            className="icon-button transaction-item__action transaction-item__action--delete"
            onClick={() => setDeletingTransaction(transaction)}
            aria-label={`Delete ${label}`}
          >
            <AppIcon name="trash" />
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
          {transaction.counterpartyName !== null &&
            transaction.counterpartyName.trim().length > 0 && (
              <div>
                <dt className="card__title">Counterparty</dt>
                <dd>{transaction.counterpartyName}</dd>
              </div>
            )}
          {transaction.tags.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <dt className="card__title">Tags</dt>
              <dd>
                <TagList tags={transaction.tags} size="md" maxVisible={5} />
              </dd>
            </div>
          )}
        </dl>
      </article>

      {isBnplLiability && (
        <article
          className="card"
          aria-label="BNPL liability details"
          style={{ marginBottom: 'var(--spacing-6)' }}
        >
          <h3 className="card__title">BNPL Liability</h3>
          <p>
            This transaction is tracked as a first-class BNPL liability
            {bnplCount ? ` with ${bnplCount} installments` : ''}.
          </p>
          <p>Status: {bnplPaid ? 'Installment paid' : 'Installment due'}</p>
          {!bnplPaid && (
            <button type="button" className="btn btn--primary" onClick={handleMarkBnplPaid}>
              Mark installment paid
            </button>
          )}
        </article>
      )}

      {hasAdditionalDetails && (
        <article
          className="card"
          aria-label="Additional transaction details"
          style={{ marginBottom: 'var(--spacing-6)' }}
        >
          <button
            type="button"
            onClick={() => setAdditionalDetailsOpen((prev) => !prev)}
            aria-expanded={additionalDetailsOpen}
            aria-controls="additional-details-content"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-2)',
              width: '100%',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 'var(--spacing-2) 0',
              fontSize: 'var(--type-scale-subheading-font-size)',
              fontWeight: 'var(--type-scale-subheading-font-weight)',
              color: 'var(--semantic-text-primary)',
              textAlign: 'left',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                transition: 'transform 0.2s',
                transform: additionalDetailsOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            >
              ▶
            </span>
            Additional Details
          </button>

          {additionalDetailsOpen && (
            <dl
              id="additional-details-content"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--spacing-4)',
                marginTop: 'var(--spacing-3)',
              }}
            >
              {formattedMerchantLocation && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <dt className="card__title">Merchant Location</dt>
                  <dd>{formattedMerchantLocation}</dd>
                </div>
              )}

              {transaction.externalReferenceId && (
                <div>
                  <dt className="card__title">External Reference ID</dt>
                  <dd
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--spacing-2)',
                    }}
                  >
                    <code
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 'var(--type-scale-caption-font-size)',
                      }}
                    >
                      {transaction.externalReferenceId}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyRefId}
                      aria-label="Copy reference ID to clipboard"
                      className="icon-button"
                      style={{ fontSize: '0.875rem', padding: 'var(--spacing-1)' }}
                    >
                      {copiedRefId ? <AppIcon name="check" /> : <AppIcon name="clipboard" />}
                    </button>
                  </dd>
                </div>
              )}

              {transaction.statementDescription && (
                <div>
                  <dt className="card__title">Statement Description</dt>
                  <dd>{transaction.statementDescription}</dd>
                </div>
              )}

              {transaction.customFields && Object.keys(transaction.customFields).length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <dt className="card__title">Custom Fields</dt>
                  <dd>
                    <table
                      aria-label="Custom fields"
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        marginTop: 'var(--spacing-1)',
                      }}
                    >
                      <thead>
                        <tr>
                          <th
                            scope="col"
                            style={{
                              textAlign: 'left',
                              padding: 'var(--spacing-1) var(--spacing-2)',
                              borderBottom: '1px solid var(--semantic-border-primary)',
                              fontWeight: 600,
                            }}
                          >
                            Field
                          </th>
                          <th
                            scope="col"
                            style={{
                              textAlign: 'left',
                              padding: 'var(--spacing-1) var(--spacing-2)',
                              borderBottom: '1px solid var(--semantic-border-primary)',
                              fontWeight: 600,
                            }}
                          >
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(transaction.customFields).map(([key, value]) => (
                          <tr key={key}>
                            <td
                              style={{
                                padding: 'var(--spacing-1) var(--spacing-2)',
                                borderBottom: '1px solid var(--semantic-border-primary)',
                              }}
                            >
                              {key}
                            </td>
                            <td
                              style={{
                                padding: 'var(--spacing-1) var(--spacing-2)',
                                borderBottom: '1px solid var(--semantic-border-primary)',
                              }}
                            >
                              {value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </dd>
                </div>
              )}

              {transaction.extraNotes && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <dt className="card__title">Extra Notes</dt>
                  <dd>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontFamily: 'monospace',
                        fontSize: 'var(--type-scale-caption-font-size)',
                        margin: 0,
                        padding: 'var(--spacing-2)',
                        backgroundColor: 'var(--semantic-background-secondary)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      {transaction.extraNotes}
                    </pre>
                  </dd>
                </div>
              )}
            </dl>
          )}
        </article>
      )}

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
