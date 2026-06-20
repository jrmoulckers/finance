// SPDX-License-Identifier: BUSL-1.1

import { useMemo, type FC } from 'react';
import { useTransactions } from '../../hooks';
import type { Account } from '../../kmp/bridge';
import {
  filterTransactionsByAccountPurpose,
  type AccountPurposeFilter,
} from '../../lib/accountPurpose';
import { detectScamAlerts } from '../../lib/notifications';
import { ErrorBanner, LoadingSpinner } from '../common';

export interface DashboardThingsToCheckSectionProps {
  readonly accounts: readonly Pick<Account, 'id' | 'purpose'>[];
  readonly selectedPurposeFilter: AccountPurposeFilter;
}

const scamAlertFilters = { type: 'EXPENSE' as const };

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
            {scamAlerts.slice(0, 5).map((alert) => (
              <li key={alert.id} className="list-item" role="listitem">
                <div className="list-item__content">
                  <p className="list-item__primary">{alert.title}</p>
                  <p className="list-item__secondary">{alert.message}</p>
                  <p className="list-item__secondary">
                    <strong>NEXT STEP:</strong> {alert.nextStep}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
};

export default DashboardThingsToCheckSection;
