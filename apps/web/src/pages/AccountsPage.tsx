// SPDX-License-Identifier: BUSL-1.1

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AccountPurposeBadge } from '../components/accounts';
import {
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  LoadingSpinner,
  ReadAloudButton,
} from '../components/common';
import { AccountForm } from '../components/forms';
import { OfflineBanner } from '../components/OfflineBanner';
import { useEffectiveMaskingMode } from '../contexts/PrivacyModeContext';
import { useAccounts } from '../hooks';
import { useExchangeRates } from '../hooks/useExchangeRates';
import type { AccountType } from '../kmp/bridge';
import {
  detectMixedCurrencies,
  formatCurrencyGroup,
  getSingleCurrency,
  groupByCurrency,
} from '../lib/currency-utils';
import {
  ACCOUNT_PURPOSE_META,
  ACCOUNT_PURPOSE_ORDER,
  normalizeAccountPurpose,
} from '../lib/accountPurpose';
import { netWorthContribution } from '../lib/analytics/net-worth';
import { formatAmount, MaskingMode } from '../lib/ui/privacy';
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
 *
 * The total is a **net worth** figure: liability accounts (credit cards, loans)
 * subtract from the total via {@link netWorthContribution} rather than being
 * summed sign-blind. This keeps the Accounts page consistent with the
 * dedicated Net Worth page (see `lib/analytics/net-worth.ts`).
 */
const MultiCurrencyTotal: React.FC<{
  accounts: ReadonlyArray<{
    type: AccountType;
    currentBalance: { amount: number };
    currency: { code: string };
  }>;
  colorize?: boolean;
  readAloud?: boolean;
}> = ({ accounts, colorize = false, readAloud = false }) => {
  const maskingMode = useEffectiveMaskingMode();
  const currencyItems = accounts.map((acc) => ({
    currency: acc.currency.code,
  }));

  const isMixed = detectMixedCurrencies(currencyItems);

  if (!isMixed) {
    const singleCurrency = getSingleCurrency(currencyItems);
    const total = accounts.reduce((sum, acc) => sum + netWorthContribution(acc), 0);
    return (
      <>
        <CurrencyDisplay amount={total} currency={singleCurrency ?? 'USD'} colorize={colorize} />
        {readAloud ? (
          <ReadAloudButton
            amount={total}
            currency={singleCurrency ?? 'USD'}
            context="total net worth"
          />
        ) : null}
      </>
    );
  }

  const amounts = accounts.map((acc) => ({
    amount: netWorthContribution(acc),
    currency: acc.currency.code,
  }));
  const groups = groupByCurrency(amounts);
  const formatted =
    maskingMode === MaskingMode.Visible
      ? formatCurrencyGroup(groups)
      : Object.entries(groups)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([currency, amount]) => formatAmount(amount, maskingMode, undefined, { currency }))
          .join(' · ');
  const label =
    maskingMode === MaskingMode.Visible ? `Total: ${formatted}` : 'Total: Amount hidden';

  return (
    <span className="multi-currency-total" aria-label={label}>
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
      ACCOUNT_PURPOSE_ORDER.map((purpose) => ({
        purpose,
        label: ACCOUNT_PURPOSE_META[purpose].sectionLabel,
        accounts: accounts
          .filter((account) => normalizeAccountPurpose(account.purpose) === purpose)
          .sort(
            (left, right) =>
              ACCOUNT_TYPE_ORDER.indexOf(left.type) - ACCOUNT_TYPE_ORDER.indexOf(right.type) ||
              left.name.localeCompare(right.name),
          ),
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
        // Liabilities subtract from the converted net-worth total, matching
        // the single-currency path and the Net Worth page.
        const contribution = netWorthContribution(account);
        if (account.currency.code === 'USD') {
          total += contribution;
        } else {
          const converted = await convert(contribution, account.currency.code, 'USD');
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
        Net worth: <MultiCurrencyTotal accounts={accounts} colorize readAloud />
        {isMultiCurrency && convertedTotal !== null && (
          <span
            className="page-summary__converted"
            title={`Using approximate ${providerName.toLowerCase()}. Connect an exchange rate provider in Settings for live rates.`}
          >
            {' '}
            ≈{' '}
            <CurrencyDisplay
              amount={convertedTotal}
              currency="USD"
              context="converted net worth"
            />{' '}
            USD
            <span className="page-summary__converted-hint">
              {' '}
              (converted at {providerName.toLowerCase()})
            </span>
          </span>
        )}
      </p>
      {accountGroups.map((group) => (
        <section key={group.purpose} className="page-section" aria-label={group.label}>
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
                      <p className="list-item__primary account-list-primary">
                        <span>{account.name}</span>
                        <AccountPurposeBadge purpose={account.purpose} />
                      </p>
                      <p className="list-item__secondary">
                        {ACCOUNT_TYPE_LABELS[account.type]} · {account.currency.code}
                        {account.isArchived ? ' · Archived' : ''}
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
