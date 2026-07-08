// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppIcon } from '../components/icons';
import { pluralize } from '../lib/ui/pluralize';

import { CurrencyDisplay, ErrorBanner, LoadingSpinner } from '../components/common';
import { Checkbox } from '../components/common/Checkbox';
import { AccountDeleteDialog, AccountPurposeBadge } from '../components/accounts';
import { AccountForm } from '../components/forms';
import { Breadcrumb } from '../components/navigation';
import { useAccountReconciliation, useAccounts, useTransactions } from '../hooks';
import type { Account } from '../kmp/bridge';
import '../components/navigation/breadcrumb.css';
import '../styles/pages.css';
import { getAccountPurposeLabel } from '../lib/accountPurpose';
import {
  getHsaCoverageLabel,
  getRetirementAccountTypeLabel,
  getRetirementTaxTreatmentLabel,
} from '../lib/tax/retirement-contribution-metadata';
import {
  calculateReconciliationDifference,
  getReconciliationCandidates,
  getTransactionReconciliationAmount,
} from '../lib/reconciliation';
import { formatDate } from '../utils/formatDate';
import { dollarsToCents } from '../lib/currency';

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CHECKING: 'Checking',
  SAVINGS: 'Savings',
  CREDIT_CARD: 'Credit Card',
  CASH: 'Cash',
  INVESTMENT: 'Investment',
  LOAN: 'Loan',
  OTHER: 'Other',
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseMoneyInput(value: string): number | null {
  const normalized = value.replace(/[$,\s]/g, '');
  if (!/^[-+]?\d*(\.\d{0,2})?$/.test(normalized) || normalized === '' || normalized === '.') {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? dollarsToCents(parsed) : null;
}

function transactionLabel(transaction: {
  payee: string | null;
  note: string | null;
  type: string;
}): string {
  return (
    transaction.payee?.trim() ||
    transaction.note?.trim() ||
    (transaction.type === 'TRANSFER' ? 'Transfer' : 'Transaction')
  );
}

/** Detail view for a single account route. */
export const AccountDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [statementDate, setStatementDate] = useState(todayISO);
  const [statementBalanceInput, setStatementBalanceInput] = useState('');
  const [clearedTransactionIds, setClearedTransactionIds] = useState<Set<string>>(new Set());
  const [reconciliationMessage, setReconciliationMessage] = useState<string | null>(null);

  const { accounts, loading, error, refresh, updateAccount, deleteAccount } = useAccounts();

  const recentFilters = useMemo(() => (id ? { accountId: id, limit: 5 } : {}), [id]);
  const allAccountFilters = useMemo(() => (id ? { accountId: id } : {}), [id]);
  const {
    transactions: recentTransactions,
    loading: recentTransactionsLoading,
    error: recentTransactionsError,
    refresh: refreshRecentTransactions,
  } = useTransactions(recentFilters);
  const { transactions: allAccountTransactions, refresh: refreshAllAccountTransactions } =
    useTransactions(allAccountFilters);
  const {
    history: reconciliationHistory,
    lastReconciliation,
    unclearedTransactionCount,
    loading: reconciliationLoading,
    error: reconciliationError,
    closeReconciliation,
  } = useAccountReconciliation(id);

  const account = id ? (accounts.find((a) => a.id === id) ?? null) : null;

  const handleCloseForm = useCallback(() => {
    setIsFormOpen(false);
  }, []);

  const statementBalanceCents = useMemo(
    () => parseMoneyInput(statementBalanceInput),
    [statementBalanceInput],
  );
  const reconciliationCandidates = useMemo(
    () => getReconciliationCandidates(allAccountTransactions, statementDate),
    [allAccountTransactions, statementDate],
  );
  const startingBalance = lastReconciliation?.statementBalance.amount ?? 0;
  const reconciliationCalculation = useMemo(
    () =>
      calculateReconciliationDifference({
        startingBalance,
        statementEndingBalance: statementBalanceCents ?? 0,
        transactions: reconciliationCandidates,
        clearedTransactionIds,
      }),
    [clearedTransactionIds, reconciliationCandidates, startingBalance, statementBalanceCents],
  );

  useEffect(() => {
    if (!isReconciling) {
      return;
    }

    setClearedTransactionIds(
      new Set(
        reconciliationCandidates
          .filter((transaction) => transaction.status === 'CLEARED')
          .map((transaction) => transaction.id),
      ),
    );
  }, [isReconciling, reconciliationCandidates]);

  const handleStartReconciliation = useCallback(() => {
    setStatementDate(todayISO());
    setStatementBalanceInput('');
    setReconciliationMessage(null);
    setIsReconciling(true);
  }, []);

  const handleToggleCleared = useCallback((transactionId: string) => {
    setClearedTransactionIds((current) => {
      const next = new Set(current);
      if (next.has(transactionId)) {
        next.delete(transactionId);
      } else {
        next.add(transactionId);
      }
      return next;
    });
  }, []);

  const handleCloseReconciliation = useCallback(() => {
    if (!account) {
      return;
    }

    if (statementBalanceCents === null) {
      setReconciliationMessage('Enter a valid statement ending balance.');
      return;
    }

    if (statementDate.trim() === '') {
      setReconciliationMessage('Enter a valid statement date.');
      return;
    }

    if (!reconciliationCalculation.canClose) {
      setReconciliationMessage('Difference must be zero before reconciliation can close.');
      return;
    }

    const snapshot = closeReconciliation({
      householdId: account.householdId,
      statementDate,
      statementBalance: { amount: statementBalanceCents },
      startingBalance: { amount: startingBalance },
      transactionIds: [...clearedTransactionIds],
    });

    if (snapshot === null) {
      setReconciliationMessage('Failed to close reconciliation.');
      return;
    }

    setReconciliationMessage('Reconciliation closed and transactions locked.');
    setIsReconciling(false);
    refreshRecentTransactions();
    refreshAllAccountTransactions();
  }, [
    account,
    clearedTransactionIds,
    closeReconciliation,
    reconciliationCalculation.canClose,
    refreshAllAccountTransactions,
    refreshRecentTransactions,
    startingBalance,
    statementBalanceCents,
    statementDate,
  ]);

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
        <div className="page-heading-row">
          <h2 className="page-heading">{account.name}</h2>
          <AccountPurposeBadge purpose={account.purpose} />
        </div>
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
          <div>
            <dt className="card__title">Purpose</dt>
            <dd>{getAccountPurposeLabel(account.purpose)}</dd>
          </div>
          <div>
            <dt className="card__title">Retirement classification</dt>
            <dd>
              {getRetirementAccountTypeLabel(account.retirementAccountType)}
              {account.retirementAccountType
                ? ' · ' + getRetirementTaxTreatmentLabel(account.retirementTaxTreatment)
                : ''}
              {account.retirementAccountType === 'HSA'
                ? ' · ' + getHsaCoverageLabel(account.hsaCoverageLevel) + ' coverage'
                : ''}
            </dd>
          </div>
          {account.isArchived && (
            <div>
              <dt className="card__title">Status</dt>
              <dd>Archived</dd>
            </div>
          )}
        </dl>
      </article>

      <section className="card page-card--spaced" aria-label="Account reconciliation">
        <div className="page-heading-row">
          <div>
            <h3 className="page-section-heading">Reconciliation</h3>
            <p className="page-muted-text">
              Last reconciled:{' '}
              {lastReconciliation
                ? formatDate(lastReconciliation.statementDate)
                : 'Not reconciled yet'}
            </p>
            <p className="page-muted-text">
              {reconciliationLoading
                ? 'Loading reconciliation status…'
                : `${unclearedTransactionCount} ${pluralize(unclearedTransactionCount, 'transaction')} uncleared`}
            </p>
          </div>
          <button type="button" className="form-button" onClick={handleStartReconciliation}>
            Start reconciliation
          </button>
        </div>

        {reconciliationError && <ErrorBanner message={reconciliationError} />}
        {reconciliationMessage && (
          <p role="status" className="page-status-text">
            {reconciliationMessage}
          </p>
        )}

        {isReconciling && (
          <div className="page-card--spaced">
            <div className="page-detail-grid">
              <div className="form-group">
                <label className="form-group__label" htmlFor="statement-ending-balance">
                  Statement ending balance
                </label>
                <input
                  id="statement-ending-balance"
                  className="form-input"
                  inputMode="decimal"
                  value={statementBalanceInput}
                  onChange={(event) => setStatementBalanceInput(event.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label className="form-group__label" htmlFor="statement-date">
                  Statement date
                </label>
                <input
                  id="statement-date"
                  className="form-input"
                  type="date"
                  value={statementDate}
                  onChange={(event) => setStatementDate(event.target.value)}
                />
              </div>
            </div>

            <dl className="page-detail-grid" aria-label="Reconciliation math">
              <div>
                <dt className="card__title">Starting balance</dt>
                <dd>
                  <CurrencyDisplay amount={startingBalance} currency={account.currency.code} />
                </dd>
              </div>
              <div>
                <dt className="card__title">Cleared total</dt>
                <dd>
                  <CurrencyDisplay
                    amount={reconciliationCalculation.clearedTotal}
                    currency={account.currency.code}
                    colorize
                    showSign
                  />
                </dd>
              </div>
              <div>
                <dt className="card__title">Computed balance</dt>
                <dd>
                  <CurrencyDisplay
                    amount={reconciliationCalculation.computedEndingBalance}
                    currency={account.currency.code}
                  />
                </dd>
              </div>
              <div>
                <dt className="card__title">Difference</dt>
                <dd>
                  <CurrencyDisplay
                    amount={reconciliationCalculation.difference}
                    currency={account.currency.code}
                    colorize
                    showSign
                  />
                </dd>
              </div>
            </dl>

            <div className="card" aria-label="Transactions to clear">
              {reconciliationCandidates.length === 0 ? (
                <p className="page-empty-text">
                  No unreconciled transactions through this statement date.
                </p>
              ) : (
                <ul className="list-group" role="list">
                  {reconciliationCandidates.map((transaction) => {
                    const label = transactionLabel(transaction);
                    const signedAmount = getTransactionReconciliationAmount(transaction);

                    return (
                      <li key={transaction.id} role="listitem" className="list-item">
                        <Checkbox
                          className="list-item__content"
                          checked={clearedTransactionIds.has(transaction.id)}
                          onChange={() => handleToggleCleared(transaction.id)}
                          aria-label={`Cleared ${label}`}
                          label={
                            <span>
                              <span className="list-item__primary">{label}</span>
                              <span className="list-item__secondary">
                                {formatDate(transaction.date)} · {transaction.status.toLowerCase()}
                              </span>
                            </span>
                          }
                        />
                        <div className="list-item__trailing">
                          <CurrencyDisplay
                            amount={signedAmount}
                            currency={transaction.currency.code}
                            colorize
                            showSign
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="page-actions">
              <button
                type="button"
                className="form-button form-button--secondary"
                onClick={() => setIsReconciling(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="form-button"
                onClick={handleCloseReconciliation}
                disabled={
                  statementBalanceCents === null ||
                  statementDate.trim() === '' ||
                  !reconciliationCalculation.canClose
                }
              >
                Finish/Reconcile
              </button>
            </div>
          </div>
        )}

        {reconciliationHistory.length > 0 && (
          <section aria-label="Reconciliation history">
            <h4 className="card__title">History</h4>
            <ul className="list-group" role="list">
              {reconciliationHistory.map((snapshot) => (
                <li key={snapshot.id} role="listitem" className="list-item">
                  <div className="list-item__content">
                    <p className="list-item__primary">{formatDate(snapshot.statementDate)}</p>
                    <p className="list-item__secondary">
                      Closed by {snapshot.createdBy} on{' '}
                      {formatDate(snapshot.createdAt.slice(0, 10))} ·{' '}
                      {snapshot.clearedTransactionCount} cleared
                    </p>
                  </div>
                  <div className="list-item__trailing">
                    <CurrencyDisplay
                      amount={snapshot.statementBalance.amount}
                      currency={account.currency.code}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>

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
                const label = transactionLabel(transaction);
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
                        <p className="list-item__secondary">
                          {formatDate(transaction.date)}
                          {transaction.status === 'RECONCILED' ? ' · Reconciled · locked' : ''}
                        </p>
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
            purpose: data.purpose,
            retirementAccountType: data.retirementAccountType,
            retirementTaxTreatment: data.retirementTaxTreatment,
            hsaCoverageLevel: data.hsaCoverageLevel,
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
