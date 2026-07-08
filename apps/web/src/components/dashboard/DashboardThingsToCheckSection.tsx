// SPDX-License-Identifier: BUSL-1.1

import { useMemo, type FC } from 'react';
import { Link } from 'react-router-dom';
import { useTransactions } from '../../hooks';
import type { Account } from '../../kmp/bridge';
import {
  filterTransactionsByAccountPurpose,
  type AccountPurposeFilter,
} from '../../lib/accountPurpose';
import {
  detectScamAlerts,
  routeUnusualSpendAlert,
  type ScamSpendingAlert,
  type UnusualSpendRouteTarget,
} from '../../lib/notifications';
import { ErrorBanner, LoadingSpinner, Button } from '../common';

export interface DashboardThingsToCheckSectionProps {
  readonly accounts: readonly Pick<Account, 'id' | 'purpose'>[];
  readonly selectedPurposeFilter: AccountPurposeFilter;
}

const scamAlertFilters = { type: 'EXPENSE' as const };

/**
 * Build a concise, screen-reader-friendly accessible name for an alert's review
 * action. The visible label is always "Review", so each name starts with
 * "Review" to satisfy WCAG 2.5.3 (Label in Name) while adding the context that
 * 2.4.4 (Link Purpose) requires.
 */
function buildReviewActionLabel(alert: ScamSpendingAlert, route: UnusualSpendRouteTarget): string {
  if (route.kind === 'transaction_filter') {
    return `Review ${alert.transactionIds.length} flagged transactions: ${alert.title}`;
  }
  return alert.merchantName
    ? `Review the flagged charge from ${alert.merchantName}`
    : `Review this flagged transaction: ${alert.title}`;
}

const DashboardThingsToCheckSection: FC<DashboardThingsToCheckSectionProps> = ({
  accounts,
  selectedPurposeFilter,
}) => {
  const {
    transactions: scamAlertTransactions,
    loading,
    error,
    refresh,
  } = useTransactions(scamAlertFilters);
  const filteredScamAlertTransactions = useMemo(
    () =>
      filterTransactionsByAccountPurpose(scamAlertTransactions, accounts, selectedPurposeFilter),
    [scamAlertTransactions, accounts, selectedPurposeFilter],
  );
  const scamAlerts = useMemo(
    () => detectScamAlerts(filteredScamAlertTransactions),
    [filteredScamAlertTransactions],
  );
  const reviewableAlerts = useMemo(
    () =>
      scamAlerts.slice(0, 5).map((alert) => {
        const route = routeUnusualSpendAlert(alert);
        return { alert, to: route.path, actionLabel: buildReviewActionLabel(alert, route) };
      }),
    [scamAlerts],
  );

  return (
    <section className="page-section" aria-label="Things to check">
      <h3 className="page-section__title">Things to check</h3>
      <article className="card">
        {loading ? (
          <LoadingSpinner label="Loading things to check" />
        ) : error ? (
          <ErrorBanner message={error} onRetry={refresh} />
        ) : scamAlerts.length === 0 ? (
          <p className="list-item__secondary">Everything looks normal.</p>
        ) : (
          <ul className="list-group" role="list" aria-label="Scam-focused unusual spending alerts">
            {reviewableAlerts.map(({ alert, to, actionLabel }) => (
              <li key={alert.id} className="list-item" role="listitem">
                <div className="list-item__content">
                  <p className="list-item__primary">{alert.title}</p>
                  <p className="list-item__secondary">{alert.message}</p>
                  <p className="list-item__secondary">
                    <strong>NEXT STEP:</strong> {alert.nextStep}
                  </p>
                </div>
                <Button
                  as={Link}
                  to={to}
                  variant="secondary"
                  size="sm"
                  className="list-item__action"
                  aria-label={actionLabel}
                >
                  Review
                </Button>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
};

export default DashboardThingsToCheckSection;
