// SPDX-License-Identifier: BUSL-1.1

/**
 * Bills list page displaying upcoming, overdue, and paid bills
 * with summary statistics and notification controls.
 *
 * References: issue #1123
 */

import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ConfirmDialog,
  CurrencyDisplay,
  EmptyState,
  ErrorBanner,
  LoadingSpinner,
} from '../components/common';
import { useBills } from '../hooks';
import type { Bill, BillFrequency, BillStatus } from '../kmp/bridge';

/** Human-readable labels for bill frequency. */
const FREQUENCY_LABELS: Record<BillFrequency, string> = {
  ONE_TIME: 'One-Time',
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Bi-Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
};

/** Human-readable labels for bill status. */
const STATUS_LABELS: Record<BillStatus, string> = {
  UPCOMING: 'Upcoming',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
};

/** Status badge styling. */
function getStatusStyle(status: BillStatus): React.CSSProperties {
  switch (status) {
    case 'UPCOMING':
      return {
        color: 'var(--semantic-info, #2563eb)',
        backgroundColor: 'var(--semantic-info-bg, #dbeafe)',
      };
    case 'PAID':
      return {
        color: 'var(--semantic-positive, #059669)',
        backgroundColor: 'var(--semantic-positive-bg, #d1fae5)',
      };
    case 'OVERDUE':
      return {
        color: 'var(--semantic-negative, #dc2626)',
        backgroundColor: 'var(--semantic-negative-bg, #fee2e2)',
      };
    case 'CANCELLED':
      return {
        color: 'var(--semantic-text-secondary)',
        backgroundColor: 'var(--semantic-surface-secondary, #f3f4f6)',
      };
  }
}

/** Emoji icons for bill status. */
function getStatusIcon(status: BillStatus): string {
  switch (status) {
    case 'UPCOMING':
      return '📅';
    case 'PAID':
      return '✅';
    case 'OVERDUE':
      return '⚠️';
    case 'CANCELLED':
      return '❌';
  }
}

/** Format a due date relative to today. */
function formatDueDate(dueDate: string): string {
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays === -1) return '1 day overdue';
  if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
  if (diffDays <= 7) return `Due in ${diffDays} days`;
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Bills list page component. */
export const BillsPage: React.FC = () => {
  const {
    bills,
    summary,
    loading,
    error,
    notificationPermission,
    refresh,
    markPaid,
    deleteBill,
    requestNotificationPermission,
  } = useBills();

  const [deletingBill, setDeletingBill] = useState<Bill | null>(null);
  const [isDeletingBill, setIsDeletingBill] = useState(false);
  const [statusFilter, setStatusFilter] = useState<BillStatus | 'ALL'>('ALL');

  const filteredBills =
    statusFilter === 'ALL' ? bills : bills.filter((b) => b.status === statusFilter);

  const handleMarkPaid = useCallback(
    (billId: string) => {
      markPaid(billId);
    },
    [markPaid],
  );

  const handleRequestDelete = useCallback((bill: Bill) => {
    setDeletingBill(bill);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setDeletingBill(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (deletingBill === null) return;

    setIsDeletingBill(true);
    try {
      deleteBill(deletingBill.id);
      setDeletingBill(null);
    } finally {
      setIsDeletingBill(false);
    }
  }, [deleteBill, deletingBill]);

  const handleEnableNotifications = useCallback(async () => {
    await requestNotificationPermission();
  }, [requestNotificationPermission]);

  return (
    <>
      <div className="page-section__header" style={{ marginBottom: 'var(--spacing-6)' }}>
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            marginBottom: 0,
          }}
        >
          Bills & Reminders
        </h2>
        <Link
          to="/bills/new"
          className="form-button form-button--primary"
          aria-label="Add a new bill"
          style={{ textDecoration: 'none' }}
        >
          Add Bill
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
          <LoadingSpinner label="Loading bills" />
        </div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={refresh} />
      ) : bills.length === 0 ? (
        <EmptyState
          title="No bills yet"
          description="Add your recurring bills to track due dates and never miss a payment."
        />
      ) : (
        <>
          {/* Notification Banner */}
          {notificationPermission === 'default' && (
            <div
              className="card"
              role="status"
              style={{
                marginBottom: 'var(--spacing-4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 'var(--spacing-3)',
                backgroundColor: 'var(--semantic-info-bg, #dbeafe)',
                border: '1px solid var(--semantic-info, #2563eb)',
              }}
            >
              <p style={{ margin: 0, fontSize: 'var(--type-scale-body-font-size)' }}>
                🔔 Enable notifications to get reminded before bills are due.
              </p>
              <button
                type="button"
                className="form-button form-button--primary"
                onClick={handleEnableNotifications}
                aria-label="Enable bill reminder notifications"
              >
                Enable Notifications
              </button>
            </div>
          )}

          {/* Summary Cards */}
          <section className="page-section" aria-label="Bills summary">
            <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 'var(--spacing-4)',
                }}
              >
                <div>
                  <p className="card__title">Upcoming</p>
                  <p className="card__value" aria-live="polite">
                    {summary.upcomingCount} bills
                  </p>
                  <p
                    style={{
                      fontSize: 'var(--type-scale-caption-font-size)',
                      color: 'var(--semantic-text-secondary)',
                    }}
                  >
                    <CurrencyDisplay amount={summary.totalUpcoming} /> total
                  </p>
                </div>
                <div>
                  <p className="card__title">Overdue</p>
                  <p
                    className="card__value"
                    style={{
                      color:
                        summary.overdueCount > 0 ? 'var(--semantic-negative, #dc2626)' : 'inherit',
                    }}
                  >
                    {summary.overdueCount} bills
                  </p>
                  <p
                    style={{
                      fontSize: 'var(--type-scale-caption-font-size)',
                      color: 'var(--semantic-text-secondary)',
                    }}
                  >
                    <CurrencyDisplay amount={summary.totalOverdue} /> total
                  </p>
                </div>
                <div>
                  <p className="card__title">Total Bills</p>
                  <p className="card__value">{bills.length}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Filter */}
          <div
            style={{
              marginBottom: 'var(--spacing-4)',
              display: 'flex',
              gap: 'var(--spacing-2)',
              flexWrap: 'wrap',
            }}
          >
            <label htmlFor="bill-status-filter" className="sr-only">
              Filter by status
            </label>
            <select
              id="bill-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as BillStatus | 'ALL')}
              aria-label="Filter bills by status"
              style={{
                padding: 'var(--spacing-2) var(--spacing-3)',
                borderRadius: 'var(--radius-sm, 4px)',
                border: '1px solid var(--semantic-border, #d1d5db)',
                backgroundColor: 'var(--semantic-background-primary)',
                color: 'var(--semantic-text-primary)',
                fontSize: 'var(--type-scale-body-font-size)',
              }}
            >
              <option value="ALL">All Bills</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="OVERDUE">Overdue</option>
              <option value="PAID">Paid</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Bills List */}
          <section aria-label="Bill list">
            <div className="card-grid">
              {filteredBills.map((bill) => (
                <article
                  key={bill.id}
                  className="card"
                  aria-label={`${bill.name}: ${STATUS_LABELS[bill.status]}`}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 'var(--spacing-3)',
                      marginBottom: 'var(--spacing-3)',
                    }}
                  >
                    <h3 style={{ fontWeight: 'var(--font-weight-semibold)', margin: 0 }}>
                      <Link
                        to={`/bills/${bill.id}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                        aria-label={`View details for ${bill.name}`}
                      >
                        <span aria-hidden="true">{getStatusIcon(bill.status)} </span>
                        {bill.name}
                      </Link>
                    </h3>
                    <span
                      style={{
                        ...getStatusStyle(bill.status),
                        padding: 'var(--spacing-1) var(--spacing-2)',
                        borderRadius: 'var(--radius-sm, 4px)',
                        fontSize: 'var(--type-scale-caption-font-size)',
                        fontWeight: 'var(--font-weight-semibold)',
                        flexShrink: 0,
                      }}
                    >
                      {STATUS_LABELS[bill.status]}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      marginBottom: 'var(--spacing-2)',
                    }}
                  >
                    <p className="card__value" style={{ margin: 0 }}>
                      <CurrencyDisplay amount={bill.amount.amount} currency={bill.currency.code} />
                    </p>
                    <span
                      style={{
                        fontSize: 'var(--type-scale-caption-font-size)',
                        color: 'var(--semantic-text-secondary)',
                      }}
                    >
                      {FREQUENCY_LABELS[bill.frequency]}
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: 'var(--type-scale-caption-font-size)',
                      color: 'var(--semantic-text-secondary)',
                      marginBottom: 'var(--spacing-2)',
                    }}
                  >
                    {bill.payee} · {formatDueDate(bill.dueDate)}
                  </p>

                  {bill.isAutoPay && (
                    <p
                      style={{
                        fontSize: 'var(--type-scale-caption-font-size)',
                        color: 'var(--semantic-positive, #059669)',
                        marginBottom: 'var(--spacing-2)',
                      }}
                    >
                      ⚡ Auto-pay enabled
                    </p>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      gap: 'var(--spacing-2)',
                      marginTop: 'var(--spacing-3)',
                    }}
                  >
                    {bill.status === 'UPCOMING' || bill.status === 'OVERDUE' ? (
                      <button
                        type="button"
                        className="form-button form-button--primary"
                        onClick={() => handleMarkPaid(bill.id)}
                        aria-label={`Mark ${bill.name} as paid`}
                        style={{ fontSize: 'var(--type-scale-caption-font-size)' }}
                      >
                        Mark Paid
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => handleRequestDelete(bill)}
                      aria-label={`Delete ${bill.name}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      <ConfirmDialog
        isOpen={deletingBill !== null}
        title="Delete bill?"
        message={
          deletingBill === null
            ? ''
            : `Are you sure you want to delete "${deletingBill.name}"? This action cannot be undone.`
        }
        confirmLabel="Delete Bill"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        isLoading={isDeletingBill}
      />
    </>
  );
};

export default BillsPage;
