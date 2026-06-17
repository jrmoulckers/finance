// SPDX-License-Identifier: BUSL-1.1

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTransactions } from '../../hooks';
import {
  filterWarrantyEntries,
  getUpcomingDeadlines,
  getWarrantyStatus,
  searchWarrantyEntries,
  useWarrantyEntries,
} from '../../lib/warranty';
import { CurrencyDisplay, EmptyState, LoadingSpinner } from '../common';
import { ExpiringWarranties } from './ExpiringWarranties';

export const WarrantyDashboard: React.FC = () => {
  const warrantyEntries = useWarrantyEntries();
  const { transactions, loading, error, refresh } = useTransactions();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring-soon' | 'expired'>(
    'all',
  );

  const transactionLookup = useMemo(
    () => new Map(transactions.map((transaction) => [transaction.id, transaction])),
    [transactions],
  );

  const filteredEntries = useMemo(() => {
    const searched = searchWarrantyEntries(warrantyEntries, query);
    const filtered = filterWarrantyEntries(searched, statusFilter);

    return filtered.sort((left, right) => {
      const leftStatus = getWarrantyStatus(left);
      const rightStatus = getWarrantyStatus(right);
      if (leftStatus !== rightStatus) {
        const statusOrder = {
          'expiring-soon': 0,
          active: 1,
          expired: 2,
        } as const;
        return statusOrder[leftStatus] - statusOrder[rightStatus];
      }

      return left.purchaseDate.localeCompare(right.purchaseDate) * -1;
    });
  }, [query, statusFilter, warrantyEntries]);

  const upcomingDeadlines = useMemo(() => getUpcomingDeadlines(warrantyEntries), [warrantyEntries]);

  const summary = useMemo(() => {
    const activeEntries = filterWarrantyEntries(warrantyEntries, 'active');
    const expiringSoonEntries = filterWarrantyEntries(warrantyEntries, 'expiring-soon');
    const expiredEntries = filterWarrantyEntries(warrantyEntries, 'expired');

    return {
      activeCount: activeEntries.length,
      expiringSoonCount: expiringSoonEntries.length,
      expiredCount: expiredEntries.length,
      coveredValueCents: [...activeEntries, ...expiringSoonEntries].reduce(
        (sum, entry) => sum + entry.amountCents,
        0,
      ),
    };
  }, [warrantyEntries]);

  return (
    <section className="page-section" aria-label="Warranty dashboard">
      <h3 className="page-section__title">Warranty & return reminders</h3>
      <div className="card" style={{ padding: 'var(--spacing-4)' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-4) 0' }}>
            <LoadingSpinner label="Loading warranty dashboard" />
          </div>
        ) : error ? (
          <div role="alert">
            <p style={{ marginTop: 0 }}>{error}</p>
            <button type="button" className="btn btn--secondary" onClick={refresh}>
              Retry
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 'var(--spacing-3)',
                marginBottom: 'var(--spacing-4)',
              }}
            >
              <article className="card" aria-label="Covered value">
                <div className="card__header">
                  <h4 className="card__title">Covered value</h4>
                </div>
                <div className="card__value">
                  <CurrencyDisplay
                    amount={summary.coveredValueCents}
                    context="covered warranty value"
                  />
                </div>
              </article>
              <article className="card" aria-label="Active warranties">
                <div className="card__header">
                  <h4 className="card__title">Active</h4>
                </div>
                <div className="card__value">{summary.activeCount}</div>
              </article>
              <article className="card" aria-label="Expiring soon warranties">
                <div className="card__header">
                  <h4 className="card__title">Expiring soon</h4>
                </div>
                <div className="card__value">{summary.expiringSoonCount}</div>
              </article>
              <article className="card" aria-label="Expired warranties">
                <div className="card__header">
                  <h4 className="card__title">Expired</h4>
                </div>
                <div className="card__value">{summary.expiredCount}</div>
              </article>
            </div>

            <div style={{ marginBottom: 'var(--spacing-4)' }}>
              <h4 style={{ marginTop: 0 }}>Approaching deadlines</h4>
              <ExpiringWarranties
                deadlines={upcomingDeadlines}
                transactionLookup={transactionLookup}
              />
            </div>

            <div
              style={{
                display: 'flex',
                gap: 'var(--spacing-3)',
                flexWrap: 'wrap',
                alignItems: 'center',
                marginBottom: 'var(--spacing-4)',
              }}
            >
              <label style={{ display: 'grid', gap: 'var(--spacing-1)', minWidth: '220px' }}>
                <span>Search tracked purchases</span>
                <input
                  type="search"
                  className="form-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by item, merchant, note, or receipt link"
                />
              </label>
              <label style={{ display: 'grid', gap: 'var(--spacing-1)', minWidth: '180px' }}>
                <span>Status</span>
                <select
                  className="form-input"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as 'all' | 'active' | 'expiring-soon' | 'expired',
                    )
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="expiring-soon">Expiring soon</option>
                  <option value="expired">Expired</option>
                </select>
              </label>
            </div>

            {filteredEntries.length === 0 ? (
              <EmptyState
                title="No tracked warranties match"
                description="Save warranty details on a transaction to start tracking deadlines."
              />
            ) : (
              <ul className="list-group" role="list" aria-label="Tracked warranties">
                {filteredEntries.map((entry) => {
                  const status = getWarrantyStatus(entry);
                  const transaction = transactionLookup.get(entry.transactionId);

                  return (
                    <li key={entry.id} className="list-item" role="listitem">
                      <Link
                        to={`/transactions/${entry.transactionId}`}
                        className="list-item__link"
                        aria-label={`View ${entry.itemName}`}
                      >
                        <div className="list-item__content">
                          <p className="list-item__primary">{entry.itemName}</p>
                          <p className="list-item__secondary">
                            {entry.merchantName ?? transaction?.payee ?? 'Manual purchase'} ·
                            Purchased {entry.purchaseDate}
                          </p>
                        </div>
                        <div className="list-item__trailing">
                          <div style={{ textAlign: 'right' }}>
                            <CurrencyDisplay
                              amount={entry.amountCents}
                              currency={entry.currencyCode}
                              context={`${entry.itemName} tracked amount`}
                            />
                          </div>
                          <span
                            style={{
                              display: 'inline-flex',
                              justifyContent: 'center',
                              marginTop: 'var(--spacing-1)',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '999px',
                              backgroundColor:
                                status === 'expired'
                                  ? 'rgba(127, 29, 29, 0.12)'
                                  : status === 'expiring-soon'
                                    ? 'rgba(146, 64, 14, 0.12)'
                                    : 'rgba(21, 128, 61, 0.12)',
                              color:
                                status === 'expired'
                                  ? '#991b1b'
                                  : status === 'expiring-soon'
                                    ? '#9a3412'
                                    : '#166534',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            {status === 'expiring-soon'
                              ? 'Expiring soon'
                              : status === 'expired'
                                ? 'Expired'
                                : 'Active'}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
};
