// SPDX-License-Identifier: BUSL-1.1

import { useMemo, type FC } from 'react';
import { Link } from 'react-router';
import { useTransactions } from '../../hooks';
import { useTaxReserve } from '../../hooks/useTaxReserve';
import type { Account, Transaction } from '../../kmp/bridge';
import { getCurrentLocale } from '../../lib/i18n';
import { getNextQuarterlyTaxDueDate } from '../../lib/tax-reserve';
import { CurrencyDisplay, ErrorBanner, LoadingSpinner } from '../common';

export interface DashboardTaxReserveSectionProps {
  readonly accounts: readonly Pick<Account, 'id' | 'purpose'>[];
  readonly currentMonthTransactions: readonly Transaction[];
  readonly fallbackCurrency: string;
}

function formatDueDate(date: Date): string {
  return date.toLocaleDateString(getCurrentLocale(), { month: 'short', day: 'numeric' });
}

function formatDueCountdown(days: number): string {
  if (days === 0) {
    return 'today';
  }

  return `in ${days} day${days === 1 ? '' : 's'}`;
}

const DashboardTaxReserveSection: FC<DashboardTaxReserveSectionProps> = ({
  accounts,
  currentMonthTransactions,
  fallbackCurrency,
}) => {
  const taxReserveAsOf = useMemo(() => new Date(), []);
  const nextTaxDueDate = useMemo(
    () => getNextQuarterlyTaxDueDate(taxReserveAsOf),
    [taxReserveAsOf],
  );
  const taxQuarterFilters = useMemo(
    () => ({
      startDate: nextTaxDueDate.periodStart,
      endDate: nextTaxDueDate.periodEnd,
    }),
    [nextTaxDueDate],
  );
  const {
    transactions: taxQuarterTransactions,
    loading,
    error,
    refresh,
  } = useTransactions(taxQuarterFilters);
  const taxReserve = useTaxReserve({
    currentMonthTransactions,
    quarterTransactions: taxQuarterTransactions,
    accounts,
    asOf: taxReserveAsOf,
  });
  const taxReserveCurrency =
    taxQuarterTransactions[0]?.currency.code ??
    currentMonthTransactions[0]?.currency.code ??
    fallbackCurrency;
  const taxReserveRatePercent = Math.round(taxReserve.summary.rate * 100);
  const taxReserveProgress =
    taxReserve.summary.quarterRecommendedCents > 0
      ? Math.min(
          100,
          Math.round(
            (taxReserve.summary.bucketBalanceCents / taxReserve.summary.quarterRecommendedCents) *
              100,
          ),
        )
      : taxReserve.summary.bucketBalanceCents > 0
        ? 100
        : 0;

  return (
    <section className="page-section" aria-label="Tax reserve guidance">
      <article className="card">
        {loading ? (
          <LoadingSpinner label="Loading tax reserve guidance" />
        ) : error ? (
          <ErrorBanner message={error} onRetry={refresh} />
        ) : (
          <>
            <div className="card__header">
              <h3 className="card__title">Tax Reserve</h3>
              <Link
                to="/goals"
                className="auth-footer__link"
                aria-label="Manage tax reserve bucket"
              >
                Manage bucket
              </Link>
            </div>
            <div className="card-grid card-grid--3">
              <div>
                <p className="list-item__secondary">Bucket balance</p>
                <p className="card__value">
                  <CurrencyDisplay
                    amount={taxReserve.summary.bucketBalanceCents}
                    currency={taxReserveCurrency}
                    context="tax reserve bucket balance"
                  />
                </p>
              </div>
              <div>
                <p className="list-item__secondary">Recommended for this quarter</p>
                <p className="card__value">
                  <CurrencyDisplay
                    amount={taxReserve.summary.quarterRecommendedCents}
                    currency={taxReserveCurrency}
                    context="recommended quarterly tax reserve"
                  />
                </p>
              </div>
              <div>
                <p className="list-item__secondary">Recommended payment</p>
                <p className="card__value">
                  <CurrencyDisplay
                    amount={taxReserve.summary.recommendedPaymentCents}
                    currency={taxReserveCurrency}
                    context="recommended estimated tax payment"
                  />
                </p>
              </div>
            </div>
            <div
              className="progress-bar"
              role="progressbar"
              aria-valuenow={taxReserveProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Tax reserve bucket is ${taxReserveProgress} percent funded`}
              style={{ marginTop: 'var(--spacing-4)' }}
            >
              <div
                className={`progress-bar__fill progress-bar__fill--${
                  taxReserveProgress >= 100
                    ? 'positive'
                    : taxReserveProgress >= 50
                      ? 'warning'
                      : 'negative'
                }`}
                style={{ width: `${taxReserveProgress}%` }}
              />
            </div>
            <p style={{ marginTop: 'var(--spacing-3)' }}>
              You earned{' '}
              <CurrencyDisplay
                amount={taxReserve.summary.currentMonthNetIncomeCents}
                currency={taxReserveCurrency}
                context="current month taxable income"
              />{' '}
              this month. Set aside{' '}
              <CurrencyDisplay
                amount={taxReserve.summary.currentMonthRecommendedCents}
                currency={taxReserveCurrency}
                context="current month recommended tax reserve"
              />{' '}
              ({taxReserveRatePercent}%).
            </p>
            <p className="list-item__secondary">
              Quarterly estimate due {formatDueCountdown(taxReserve.summary.daysUntilDue)} on{' '}
              {formatDueDate(taxReserve.summary.nextDueDate.dueDate)}. Based on income so far, set
              aside ~
              <CurrencyDisplay
                amount={taxReserve.summary.quarterRecommendedCents}
                currency={taxReserveCurrency}
                context="quarterly tax reserve"
              />
              .
            </p>
          </>
        )}
      </article>
    </section>
  );
};

export default DashboardTaxReserveSection;
