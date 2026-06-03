// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CurrencyDisplay, EmptyState, ErrorBanner, LoadingSpinner } from '../components/common';
import { AccountForm } from '../components/forms';
import { OfflineBanner } from '../components/OfflineBanner';
import { useAccounts } from '../hooks';
import { useExchangeRates } from '../hooks/useExchangeRates';
import type { AccountType } from '../kmp/bridge';
import {
  detectMixedCurrencies,
  formatCurrencyGroup,
  getSingleCurrency,
  groupByCurrency,
} from '../lib/currency-utils';
import { formatCurrencyValue } from '../lib/currency';
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

/**
 * Renders a multi-currency total display.
 * If all accounts share the same currency, shows a single CurrencyDisplay.
 * If mixed, shows per-currency breakdown with a "(multiple currencies)" indicator.
 */
const MultiCurrencyTotal: React.FC<{
  accounts: ReadonlyArray<{ currentBalance: { amount: number }; currency: { code: string } }>;
  colorize?: boolean;
}> = ({ accounts, colorize = false }) => {
  const currencyItems = accounts.map((acc) => ({
    currency: acc.currency.code,
  }));

  const isMixed = detectMixedCurrencies(currencyItems);

  if (!isMixed) {
    const singleCurrency = getSingleCurrency(currencyItems);
    const total = accounts.reduce((sum, acc) => sum + acc.currentBalance.amount, 0);
    return (
      <CurrencyDisplay amount={total} currency={singleCurrency ?? 'USD'} colorize={colorize} />
    );
  }

  const amounts = accounts.map((acc) => ({
    amount: acc.currentBalance.amount,
    currency: acc.currency.code,
  }));
  const groups = groupByCurrency(amounts);
  const formatted = formatCurrencyGroup(groups);

  return (
    <span className="multi-currency-total" aria-label={`Total: ${formatted}`}>
      <span className="multi-currency-total__amounts">{formatted}</span>
      <span className="multi-currency-total__indicator" aria-hidden="true">
        {' '}
        (multiple currencies)
      </span>
    </span>
  );
};

export const AccountsPage: React.FC = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { accounts, loading, error, refresh, createAccount } = useAccounts();
  const { convert, providerName } = useExchangeRates('USD');
  const [convertedTotal, setConvertedTotal] = useState<number | null>(null);

  const accountGroups = useMemo(
    () =>
      ACCOUNT_TYPE_ORDER.map((type) => ({
        type,
        label: ACCOUNT_TYPE_LABELS[type],
        accounts: accounts.filter((account) => account.type === type),
      })).filter((group) => group.accounts.length > 0),
    [accounts],
  );

  // Check if accounts use multiple currencies
  const currencyCodes = useMemo(
    () => [...new Set(accounts.map((a) => a.currency.code))],
    [accounts],
  );
  const isMultiCurrency = currencyCodes.length > 1;

  // Compute converted total when multi-currency
  const computeConvertedTotal = useCallback(async () => {
    if (!isMultiCurrency || accounts.length === 0) {
      setConvertedTotal(null);
      return;
    }
    try {
      let total = 0;
      for (const account of accounts) {
        if (account.currency.code === 'USD') {
          total += account.currentBalance.amount;
        } else {
          const converted = await convert(
            account.currentBalance.amount,
            account.currency.code,
            'USD',
          );
          total += converted;
        }
      }
      setConvertedTotal(total);
    } catch {
      setConvertedTotal(null);
    }
  }, [accounts, convert, isMultiCurrency]);

  useEffect(() => {
    void computeConvertedTotal();
  }, [computeConvertedTotal]);
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
  const offlineBanner = <OfflineBanner />;

  if (loading) {
    return (
      <>
        {offlineBanner}
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
        {offlineBanner}
        <h2 className="page-heading">Accounts</h2>
        <ErrorBanner message={error} onRetry={refresh} />
      </>
    );
  }

  if (accounts.length === 0) {
    return (
      <>
        {offlineBanner}
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
      {offlineBanner}
      {pageHeader}
      <p className="page-summary" aria-live="polite">
        Net worth: <MultiCurrencyTotal accounts={accounts} colorize />
        {isMultiCurrency && convertedTotal !== null && (
          <span
            className="page-summary__converted"
            title={`Using approximate ${providerName.toLowerCase()}. Connect an exchange rate provider in Settings for live rates.`}
            aria-label={`Approximately ${formatCurrencyValue(convertedTotal / 100)} USD converted at ${providerName.toLowerCase()}`}
          >
            {' '}
            ≈ {formatCurrencyValue(convertedTotal / 100)} USD
            <span className="page-summary__converted-hint">
              {' '}
              (converted at {providerName.toLowerCase()})
            </span>
          </span>
        )}
      </p>
      {accountGroups.map((group) => (
        <section key={group.type} className="page-section" aria-label={group.label}>
          <div className="page-section__header">
            <h3 className="page-section__title">{group.label}</h3>
            <MultiCurrencyTotal accounts={group.accounts} colorize />
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
      ))}
      {accountForm}
    </>
  );
};

export default AccountsPage;
