// SPDX-License-Identifier: BUSL-1.1

/**
 * Bill detail page showing full bill information, payment history,
 * and management actions.
 *
 * References: issue #1123
 */

import React, { useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CurrencyDisplay, ErrorBanner, LoadingSpinner } from '../components/common';
import { useBills } from '../hooks';
import type { BillFrequency, BillStatus } from '../kmp/bridge';

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

/** Bill detail page component. */
export const BillDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { bills, loading, error, refresh, markPaid, deleteBill } = useBills();

  const bill = bills.find((b) => b.id === id) ?? null;

  const handleMarkPaid = useCallback(() => {
    if (bill) {
      markPaid(bill.id);
    }
  }, [bill, markPaid]);

  const handleDelete = useCallback(() => {
    if (bill) {
      const deleted = deleteBill(bill.id);
      if (deleted) {
        navigate('/bills');
      }
    }
  }, [bill, deleteBill, navigate]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-8) 0' }}>
        <LoadingSpinner label="Loading bill details" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner message={error} onRetry={refresh} />;
  }

  if (!bill) {
    return (
      <div style={{ padding: 'var(--spacing-6)' }}>
        <Link to="/bills" aria-label="Back to bills">
          ← Back to Bills
        </Link>
        <p style={{ marginTop: 'var(--spacing-4)', color: 'var(--semantic-text-secondary)' }}>
          Bill not found.
        </p>
      </div>
    );
  }

  const dueDate = new Date(`${bill.dueDate}T00:00:00`);
  const isOverdue = bill.status === 'OVERDUE';
  const canMarkPaid = bill.status === 'UPCOMING' || bill.status === 'OVERDUE';

  return (
    <>
      <div style={{ marginBottom: 'var(--spacing-4)' }}>
        <Link to="/bills" aria-label="Back to bills">
          ← Back to Bills
        </Link>
      </div>

      <div className="page-section__header" style={{ marginBottom: 'var(--spacing-6)' }}>
        <h2
          style={{
            fontSize: 'var(--type-scale-headline-font-size)',
            fontWeight: 'var(--type-scale-headline-font-weight)',
            marginBottom: 0,
          }}
        >
          {bill.name}
        </h2>
        <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center' }}>
          {canMarkPaid && (
            <button
              type="button"
              className="form-button form-button--primary"
              onClick={handleMarkPaid}
              aria-label={`Mark ${bill.name} as paid`}
            >
              Mark Paid
            </button>
          )}
          <button
            type="button"
            className="form-button form-button--danger"
            onClick={handleDelete}
            aria-label={`Delete ${bill.name}`}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Key Info */}
      <section className="page-section" aria-label="Bill information">
        <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 'var(--spacing-4)',
            }}
          >
            <div>
              <p className="card__title">Amount</p>
              <p className="card__value" aria-live="polite">
                <CurrencyDisplay amount={bill.amount.amount} currency={bill.currency.code} />
              </p>
            </div>
            <div>
              <p className="card__title">Status</p>
              <p
                className="card__value"
                style={{
                  color: isOverdue
                    ? 'var(--semantic-negative, #dc2626)'
                    : 'var(--semantic-text-primary)',
                }}
              >
                {STATUS_LABELS[bill.status]}
              </p>
            </div>
            <div>
              <p className="card__title">Due Date</p>
              <p className="card__value">
                {dueDate.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div>
              <p className="card__title">Frequency</p>
              <p className="card__value">{FREQUENCY_LABELS[bill.frequency]}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Details */}
      <section className="page-section" aria-label="Bill details">
        <div className="card" style={{ marginBottom: 'var(--spacing-6)' }}>
          <h3
            style={{
              fontWeight: 'var(--font-weight-semibold)',
              marginBottom: 'var(--spacing-4)',
            }}
          >
            Details
          </h3>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              gap: 'var(--spacing-2) var(--spacing-4)',
              margin: 0,
            }}
          >
            <dt style={{ color: 'var(--semantic-text-secondary)' }}>Payee</dt>
            <dd style={{ margin: 0 }}>{bill.payee}</dd>

            <dt style={{ color: 'var(--semantic-text-secondary)' }}>Auto-Pay</dt>
            <dd style={{ margin: 0 }}>{bill.isAutoPay ? 'Enabled' : 'Disabled'}</dd>

            <dt style={{ color: 'var(--semantic-text-secondary)' }}>Reminder</dt>
            <dd style={{ margin: 0 }}>
              {bill.reminderDaysBefore > 0
                ? `${bill.reminderDaysBefore} day${bill.reminderDaysBefore === 1 ? '' : 's'} before due date`
                : 'No reminder'}
            </dd>

            {bill.note && (
              <>
                <dt style={{ color: 'var(--semantic-text-secondary)' }}>Note</dt>
                <dd style={{ margin: 0 }}>{bill.note}</dd>
              </>
            )}

            {bill.lastPaidDate && (
              <>
                <dt style={{ color: 'var(--semantic-text-secondary)' }}>Last Paid</dt>
                <dd style={{ margin: 0 }}>
                  {new Date(`${bill.lastPaidDate}T00:00:00`).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </dd>
              </>
            )}

            <dt style={{ color: 'var(--semantic-text-secondary)' }}>Added</dt>
            <dd style={{ margin: 0 }}>
              {new Date(bill.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </dd>
          </dl>
        </div>
      </section>
    </>
  );
};

export default BillDetailPage;
