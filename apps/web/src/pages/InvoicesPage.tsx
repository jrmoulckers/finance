// SPDX-License-Identifier: BUSL-1.1

/**
 * InvoicesPage — invoice pipeline and expected-income forecast for freelancers.
 *
 * Tracks local-first invoices, computes net-terms expected pay dates,
 * auto-marks sent invoices overdue, and forecasts outstanding income.
 *
 * References: issue #2169
 */

import React, { useMemo, useState } from 'react';
import { CurrencyDisplay, EmptyState } from '../components/common';
import { useInvoices } from '../hooks/useInvoices';
import {
  computeExpectedPayDate,
  PAYMENT_TERM_LABELS,
  PAYMENT_TERMS,
  INVOICE_STATUSES,
  type Invoice,
  type InvoicePaymentTerm,
  type InvoiceStatus,
} from '../lib/analytics/invoices';
import './analytics.css';

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseAmountToCents(value: string): number | null {
  const amount = Number(value.replace(/[$,]/g, '').trim());
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

const StatusBadge: React.FC<{ status: InvoiceStatus }> = ({ status }) => (
  <span className={`invoice-status-badge invoice-status-badge--${status.toLowerCase()}`}>
    {status}
  </span>
);

const InvoiceCard: React.FC<{
  invoice: Invoice;
  onStatusChange: (invoiceId: string, status: InvoiceStatus) => void;
  onDelete: (invoiceId: string) => void;
}> = ({ invoice, onStatusChange, onDelete }) => (
  <article className={`invoice-card invoice-card--${invoice.status.toLowerCase()}`} role="listitem">
    <div className="invoice-card__main">
      <div>
        <h4 className="invoice-card__client">{invoice.clientName}</h4>
        <p className="invoice-card__meta">
          Issued {formatDate(invoice.issueDate)} · {PAYMENT_TERM_LABELS[invoice.paymentTerm]} ·
          expected {formatDate(invoice.expectedPayDate)}
        </p>
      </div>
      <div className="invoice-card__amount">
        <CurrencyDisplay amount={invoice.amountCents} />
        <StatusBadge status={invoice.status} />
      </div>
    </div>
    <div className="invoice-card__actions">
      <label className="invoice-card__status-label">
        Status
        <select
          value={invoice.status}
          onChange={(event) => onStatusChange(invoice.id, event.target.value as InvoiceStatus)}
        >
          {INVOICE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <button className="analytics-export-btn" type="button" onClick={() => onDelete(invoice.id)}>
        Delete
      </button>
    </div>
  </article>
);

export const InvoicesPage: React.FC = () => {
  const {
    invoices,
    pipelineGroups,
    forecastBuckets,
    totalOutstandingCents,
    addInvoice,
    updateInvoiceStatus,
    deleteInvoice,
  } = useInvoices();
  const [clientName, setClientName] = useState('');
  const [amount, setAmount] = useState('');
  const [issueDate, setIssueDate] = useState(todayIsoDate);
  const [paymentTerm, setPaymentTerm] = useState<InvoicePaymentTerm>('net-30');
  const [status, setStatus] = useState<InvoiceStatus>('Sent');
  const [formError, setFormError] = useState<string | null>(null);

  const expectedPayDate = useMemo(
    () => (issueDate ? computeExpectedPayDate(issueDate, paymentTerm) : todayIsoDate()),
    [issueDate, paymentTerm],
  );
  const maxForecastCents = Math.max(...forecastBuckets.map((bucket) => bucket.totalCents), 1);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountCents = parseAmountToCents(amount);
    if (!clientName.trim()) {
      setFormError('Client name is required.');
      return;
    }
    if (amountCents === null) {
      setFormError('Enter a positive invoice amount.');
      return;
    }
    if (!issueDate) {
      setFormError('Issue date is required.');
      return;
    }

    addInvoice({ clientName, amountCents, issueDate, paymentTerm, status });
    setClientName('');
    setAmount('');
    setIssueDate(todayIsoDate());
    setPaymentTerm('net-30');
    setStatus('Sent');
    setFormError(null);
  };

  return (
    <div className="analytics-page invoices-page">
      <div className="analytics-page__header">
        <div>
          <h2 className="analytics-page__title">Invoices</h2>
          <p className="invoice-subtitle">
            Track net-terms work and forecast when freelance income should land.
          </p>
        </div>
      </div>

      <section className="analytics-section" aria-label="Add invoice">
        <form className="invoice-form" onSubmit={handleSubmit}>
          <label className="invoice-form__field">
            Client name
            <input
              type="text"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder="Acme Studio"
              required
            />
          </label>
          <label className="invoice-form__field">
            Amount
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="4200.00"
              required
            />
          </label>
          <label className="invoice-form__field">
            Issue date
            <input
              type="date"
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
              required
            />
          </label>
          <label className="invoice-form__field">
            Payment terms
            <select
              value={paymentTerm}
              onChange={(event) => setPaymentTerm(event.target.value as InvoicePaymentTerm)}
            >
              {PAYMENT_TERMS.map((term) => (
                <option key={term} value={term}>
                  {PAYMENT_TERM_LABELS[term]}
                </option>
              ))}
            </select>
          </label>
          <label className="invoice-form__field">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as InvoiceStatus)}
            >
              {INVOICE_STATUSES.map((invoiceStatus) => (
                <option key={invoiceStatus} value={invoiceStatus}>
                  {invoiceStatus}
                </option>
              ))}
            </select>
          </label>
          <div className="invoice-form__preview" aria-live="polite">
            Expected pay date: <strong>{formatDate(expectedPayDate)}</strong>
          </div>
          {formError && <p className="invoice-form__error">{formError}</p>}
          <button className="analytics-export-btn invoice-form__submit" type="submit">
            Add invoice
          </button>
        </form>
      </section>

      <section
        className="analytics-section"
        aria-label="Expected income forecast"
        aria-live="polite"
      >
        <h3 className="analytics-section__title">Expected-income forecast</h3>
        <div className="analytics-metrics-grid">
          <article className="analytics-metric-card" aria-label="Outstanding invoice total">
            <p className="analytics-metric-card__label">Outstanding</p>
            <p className="analytics-metric-card__value analytics-metric-card__value--positive">
              <CurrencyDisplay amount={totalOutstandingCents} />
            </p>
          </article>
          {forecastBuckets.slice(1, 3).map((bucket) => (
            <article
              key={bucket.id}
              className="analytics-metric-card"
              aria-label={`${bucket.label} forecast`}
            >
              <p className="analytics-metric-card__label">{bucket.label}</p>
              <p className="analytics-metric-card__value analytics-metric-card__value--positive">
                <CurrencyDisplay amount={bucket.totalCents} />
              </p>
            </article>
          ))}
        </div>
        <div className="invoice-forecast-list" role="list">
          {forecastBuckets.map((bucket) => (
            <div key={bucket.id} className="invoice-forecast-row" role="listitem">
              <div className="invoice-forecast-row__header">
                <span>{bucket.label}</span>
                <span>
                  <CurrencyDisplay amount={bucket.totalCents} /> expected
                </span>
              </div>
              <div className="invoice-forecast-row__track" aria-hidden="true">
                <div
                  className="invoice-forecast-row__fill"
                  style={{
                    width: `${Math.max((bucket.totalCents / maxForecastCents) * 100, bucket.totalCents > 0 ? 4 : 0)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="analytics-section" aria-label="Invoice pipeline">
        <h3 className="analytics-section__title">Pipeline by status</h3>
        {invoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="Add sent or draft invoices to see status totals and payment timing forecasts."
          />
        ) : (
          <div className="invoice-pipeline-grid">
            {pipelineGroups.map((group) => (
              <article key={group.status} className="invoice-pipeline-group">
                <div className="invoice-pipeline-group__header">
                  <div>
                    <h4>{group.label}</h4>
                    <p>{group.invoices.length} invoices</p>
                  </div>
                  <CurrencyDisplay amount={group.totalCents} />
                </div>
                {group.invoices.length === 0 ? (
                  <p className="invoice-pipeline-group__empty">
                    No {group.label.toLowerCase()} invoices.
                  </p>
                ) : (
                  <div className="invoice-pipeline-group__list" role="list">
                    {group.invoices.map((invoice) => (
                      <InvoiceCard
                        key={invoice.id}
                        invoice={invoice}
                        onStatusChange={updateInvoiceStatus}
                        onDelete={deleteInvoice}
                      />
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default InvoicesPage;
