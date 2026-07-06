// SPDX-License-Identifier: BUSL-1.1

/**
 * Estimated Taxes page: a discoverable home for self-employment quarterly
 * estimated-tax planning. Surfaces the recommended set-aside per IRS quarter,
 * the next due date, and current reserve progress without routing the user
 * through the Goals screen or the investment-only Tax Center.
 */

import { useMemo, type FC } from 'react';
import { Link } from 'react-router-dom';

import { ErrorBanner, LoadingSpinner } from '../components/common';
import DashboardTaxReserveSection from '../components/dashboard/DashboardTaxReserveSection';
import { useAccounts, useTransactions } from '../hooks';
import { getCurrentMonthBounds } from '../lib/tax-reserve';
import './EstimatedTaxPage.css';

export const EstimatedTaxPage: FC = () => {
  const asOf = useMemo(() => new Date(), []);
  const currentMonthRange = useMemo(() => getCurrentMonthBounds(asOf), [asOf]);
  const currentMonthFilters = useMemo(
    () => ({ startDate: currentMonthRange.startDate, endDate: currentMonthRange.endDate }),
    [currentMonthRange],
  );

  const {
    accounts,
    loading: accountsLoading,
    error: accountsError,
    refresh: refreshAccounts,
  } = useAccounts();
  const {
    transactions: currentMonthTransactions,
    loading: transactionsLoading,
    error: transactionsError,
    refresh: refreshTransactions,
  } = useTransactions(currentMonthFilters);

  const loading = accountsLoading || transactionsLoading;
  const error = accountsError ?? transactionsError;
  const fallbackCurrency = currentMonthTransactions[0]?.currency.code ?? 'USD';

  const handleRetry = () => {
    refreshAccounts();
    refreshTransactions();
  };

  return (
    <main className="estimated-tax" aria-labelledby="estimated-tax-title">
      <header className="estimated-tax__header">
        <p className="estimated-tax__eyebrow">Self-employment taxes</p>
        <h1 id="estimated-tax-title" className="estimated-tax__title">
          Estimated Taxes
        </h1>
        <p className="estimated-tax__description">
          See how much to set aside for each IRS quarter based on your self-employment income, and
          when the next estimated payment is due. Adjust your reserve rate or record a payment from
          the <Link to="/goals">tax reserve bucket in Goals</Link>.
        </p>
      </header>

      {loading ? (
        <LoadingSpinner label="Loading estimated tax guidance" />
      ) : error ? (
        <ErrorBanner message={error} onRetry={handleRetry} />
      ) : (
        <DashboardTaxReserveSection
          accounts={accounts}
          currentMonthTransactions={currentMonthTransactions}
          fallbackCurrency={fallbackCurrency}
        />
      )}
    </main>
  );
};

export default EstimatedTaxPage;
