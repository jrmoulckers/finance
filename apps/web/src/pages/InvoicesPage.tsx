// SPDX-License-Identifier: BUSL-1.1

/**
 * InvoicesPage — invoice pipeline and expected-income forecast for freelancers.
 *
 * Tracks local-first invoices, computes net-terms expected pay dates,
 * auto-marks sent invoices overdue, and forecasts outstanding income.
 *
 * References: issue #2169
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ConfirmDialog, CurrencyDisplay, EmptyState } from '../components/common';
import { InvoicePaymentDialog } from '../components/invoices/InvoicePaymentDialog';
import { useInvoices } from '../hooks/useInvoices';
import { useLocalePreferences } from '../hooks/useLocalePreferences';
import {
  computeExpectedPayDate,
  exportInvoicesCsv,
  FOLLOW_UP_STALE_DAYS,
  getInvoicesNeedingFollowUp,
  invoiceIsFullyPaid,
  invoiceOutstandingCents,
  PAYMENT_TERM_LABELS,
  PAYMENT_TERMS,
  INVOICE_STATUSES,
  type Invoice,
  type InvoicePaymentTerm,
  type InvoiceStatus,
} from '../lib/analytics/invoices';
import { buildDatedExportFileName } from '../lib/export/simple-export';
import { formatDate } from '../utils/formatDate';
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

const StatusBadge: React.FC<{ status: InvoiceStatus }> = ({ status }) => (
  <span className={`invoice-status-badge invoice-status-badge--${status.toLowerCase()}`}>
    {status}
  </span>
);

const InvoiceCard: React.FC<{
  invoice: Invoice;
  locale: string;
  isEditing: boolean;
  onEdit: (invoice: Invoice) => void;
  onStatusChange: (invoiceId: string, status: InvoiceStatus) => void;
  onRecordPayment: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
}> = ({ invoice, locale, isEditing, onEdit, onStatusChange, onRecordPayment, onDelete }) => {
  const paidCents = invoice.amountPaidCents ?? 0;
  const outstandingCents = invoiceOutstandingCents(invoice);
  const fullyPaid = invoiceIsFullyPaid(invoice);
  const canRecordPayment = invoice.status !== 'Draft' && !fullyPaid;

  return (
    <article
      className={`invoice-card invoice-card--${invoice.status.toLowerCase()}${
        isEditing ? ' invoice-card--editing' : ''
      }`}
      role="listitem"
    >
      <div className="invoice-card__main">
        <div>
          <h3 className="invoice-card__client">{invoice.clientName}</h3>
          <p className="invoice-card__meta">
            Issued {formatDate(invoice.issueDate, { locale })} ·{' '}
            {PAYMENT_TERM_LABELS[invoice.paymentTerm]} · expected{' '}
            {formatDate(invoice.expectedPayDate, { locale })}
          </p>
        </div>
        <div className="invoice-card__amount">
          <CurrencyDisplay amount={invoice.amountCents} />
          <StatusBadge status={invoice.status} />
        </div>
      </div>
      {paidCents > 0 && (
        <p className="invoice-card__payment">
          Paid <CurrencyDisplay amount={paidCents} /> of{' '}
          <CurrencyDisplay amount={invoice.amountCents} /> ·{' '}
          {fullyPaid ? (
            'paid in full'
          ) : (
            <>
              <CurrencyDisplay amount={outstandingCents} /> outstanding
            </>
          )}
          {invoice.paidDate ? ` · last payment ${formatDate(invoice.paidDate, { locale })}` : ''}
        </p>
      )}
      <div className="invoice-card__actions">
        <label className="invoice-card__status-label">
          Status
          <select
            aria-label={`Status for ${invoice.clientName}`}
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
        {canRecordPayment && (
          <button
            className="analytics-export-btn"
            type="button"
            aria-label={`Record payment for ${invoice.clientName}`}
            onClick={() => onRecordPayment(invoice)}
          >
            Record payment
          </button>
        )}
        <button
          className="analytics-export-btn"
          type="button"
          aria-label={`Edit invoice for ${invoice.clientName}`}
          onClick={() => onEdit(invoice)}
        >
          Edit
        </button>
        <button
          className="analytics-export-btn"
          type="button"
          aria-label={`Delete invoice for ${invoice.clientName}`}
          onClick={() => onDelete(invoice)}
        >
          Delete
        </button>
      </div>
    </article>
  );
};

export const InvoicesPage: React.FC = () => {
  const {
    invoices,
    pipelineGroups,
    forecastBuckets,
    totalOutstandingCents,
    addInvoice,
    updateInvoice,
    updateInvoiceStatus,
    logInvoiceContact,
    recordPayment,
    deleteInvoice,
  } = useInvoices();
  const { locale } = useLocalePreferences();
  const [clientName, setClientName] = useState('');
  const [amount, setAmount] = useState('');
  const [issueDate, setIssueDate] = useState(todayIsoDate);
  const [paymentTerm, setPaymentTerm] = useState<InvoicePaymentTerm>('net-30');
  const [status, setStatus] = useState<InvoiceStatus>('Sent');
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);

  const resetForm = useCallback(() => {
    setEditingInvoiceId(null);
    setClientName('');
    setAmount('');
    setIssueDate(todayIsoDate());
    setPaymentTerm('net-30');
    setStatus('Sent');
    setFormError(null);
  }, []);

  const handleEdit = useCallback((invoice: Invoice) => {
    setEditingInvoiceId(invoice.id);
    setClientName(invoice.clientName);
    setAmount((invoice.amountCents / 100).toString());
    setIssueDate(invoice.issueDate);
    setPaymentTerm(invoice.paymentTerm);
    setStatus(invoice.status);
    setFormError(null);
  }, []);

  const handleConfirmDelete = () => {
    if (deletingInvoice) {
      deleteInvoice(deletingInvoice.id);
      setDeletingInvoice(null);
    }
  };

  const handleRecordPayment = useCallback(
    (paymentCents: number, paidDate: string) => {
      if (payingInvoice) {
        recordPayment(payingInvoice.id, paymentCents, paidDate);
        setPayingInvoice(null);
      }
    },
    [payingInvoice, recordPayment],
  );

  const expectedPayDate = useMemo(
    () => (issueDate ? computeExpectedPayDate(issueDate, paymentTerm) : todayIsoDate()),
    [issueDate, paymentTerm],
  );
  const maxForecastCents = Math.max(...forecastBuckets.map((bucket) => bucket.totalCents), 1);

  const clientSuggestions = useMemo(
    () =>
      Array.from(
        new Set(invoices.map((invoice) => invoice.clientName.trim()).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [invoices],
  );

  const followUpInvoices = useMemo(
    () => getInvoicesNeedingFollowUp(invoices, todayIsoDate()),
    [invoices],
  );

  const handleExportCsv = useCallback(() => {
    const csv = exportInvoicesCsv(invoices, todayIsoDate());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildDatedExportFileName('invoices', 'csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [invoices]);

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

    if (editingInvoiceId) {
      updateInvoice(editingInvoiceId, { clientName, amountCents, issueDate, paymentTerm, status });
    } else {
      addInvoice({ clientName, amountCents, issueDate, paymentTerm, status });
    }
    resetForm();
  };

  return (
    <div className="analytics-page invoices-page">
      <div className="analytics-page__header">
        <div>
          <h1 className="analytics-page__title">Invoices</h1>
          <p className="invoice-subtitle">
            Track net-terms work and forecast when freelance income should land.
          </p>
        </div>
        <button
          type="button"
          className="analytics-export-btn"
          onClick={handleExportCsv}
          disabled={invoices.length === 0}
          aria-label="Export invoices as CSV"
        >
          Export CSV
        </button>
      </div>

      <section
        className="analytics-section"
        aria-label={editingInvoiceId ? 'Edit invoice' : 'Add invoice'}
      >
        <h2 className="analytics-section__title">
          {editingInvoiceId ? 'Edit invoice' : 'Add invoice'}
        </h2>
        <form className="invoice-form" onSubmit={handleSubmit}>
          <label className="invoice-form__field">
            Client name
            <input
              type="text"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder="Acme Studio"
              list="invoice-client-suggestions"
              autoComplete="off"
              required
            />
            {clientSuggestions.length > 0 && (
              <datalist id="invoice-client-suggestions">
                {clientSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            )}
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
            Expected pay date: <strong>{formatDate(expectedPayDate, { locale })}</strong>
          </div>
          {formError && <p className="invoice-form__error">{formError}</p>}
          <button className="analytics-export-btn invoice-form__submit" type="submit">
            {editingInvoiceId ? 'Save changes' : 'Add invoice'}
          </button>
          {editingInvoiceId && (
            <button
              className="analytics-export-btn invoice-form__cancel"
              type="button"
              onClick={resetForm}
            >
              Cancel edit
            </button>
          )}
        </form>
      </section>

      <section className="analytics-section" aria-label="Expected income forecast">
        <p className="sr-only" role="status">
          Outstanding invoices total <CurrencyDisplay amount={totalOutstandingCents} />.
          {forecastBuckets.slice(0, 3).map((bucket) => (
            <React.Fragment key={bucket.id}>
              {' '}
              {bucket.label}: <CurrencyDisplay amount={bucket.totalCents} />.
            </React.Fragment>
          ))}
        </p>
        <h2 className="analytics-section__title">Expected-income forecast</h2>
        <div className="analytics-metrics-grid">
          <article className="analytics-metric-card" aria-label="Outstanding invoice total">
            <p className="analytics-metric-card__label">Outstanding</p>
            <p className="analytics-metric-card__value analytics-metric-card__value--positive">
              <CurrencyDisplay amount={totalOutstandingCents} />
            </p>
          </article>
          {forecastBuckets.slice(0, 3).map((bucket) => (
            <article
              key={bucket.id}
              className="analytics-metric-card"
              aria-label={`${bucket.label} forecast`}
            >
              <p className="analytics-metric-card__label">{bucket.label}</p>
              <p
                className={`analytics-metric-card__value ${
                  bucket.id === 'past-due'
                    ? 'analytics-metric-card__value--negative'
                    : 'analytics-metric-card__value--positive'
                }`}
              >
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

      {followUpInvoices.length > 0 && (
        <section className="analytics-section" aria-label="Invoices needing follow-up">
          <h2 className="analytics-section__title">Needs follow-up</h2>
          <p className="invoice-followup__subtitle">
            Overdue invoices you haven&rsquo;t chased in the last {FOLLOW_UP_STALE_DAYS} days.
          </p>
          <ul className="invoice-followup-list">
            {followUpInvoices.map((invoice) => (
              <li key={invoice.id} className="invoice-followup-row">
                <div className="invoice-followup-row__info">
                  <span className="invoice-followup-row__client">{invoice.clientName}</span>
                  <span className="invoice-followup-row__meta">
                    <CurrencyDisplay amount={invoice.amountCents} /> &middot; expected{' '}
                    {formatDate(invoice.expectedPayDate, { locale })} &middot; last contacted{' '}
                    {invoice.lastContactedDate
                      ? formatDate(invoice.lastContactedDate, { locale })
                      : 'never'}
                  </span>
                </div>
                <button
                  type="button"
                  className="invoice-followup-row__action"
                  aria-label={`Log follow-up for ${invoice.clientName}`}
                  onClick={() => logInvoiceContact(invoice.id)}
                >
                  Log follow-up
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="analytics-section" aria-label="Invoice pipeline">
        <h2 className="analytics-section__title">Pipeline by status</h2>
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
                    <h3>{group.label}</h3>
                    <p>
                      {group.invoices.length} {group.invoices.length === 1 ? 'invoice' : 'invoices'}
                    </p>
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
                        locale={locale}
                        isEditing={invoice.id === editingInvoiceId}
                        onEdit={handleEdit}
                        onStatusChange={updateInvoiceStatus}
                        onRecordPayment={setPayingInvoice}
                        onDelete={setDeletingInvoice}
                      />
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        isOpen={deletingInvoice !== null}
        title="Delete invoice"
        message={
          deletingInvoice
            ? `Delete the invoice for ${deletingInvoice.clientName}? This permanently removes it from your pipeline and expected-income forecast.`
            : ''
        }
        confirmLabel="Delete invoice"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingInvoice(null)}
      />

      <InvoicePaymentDialog
        isOpen={payingInvoice !== null}
        invoice={payingInvoice}
        onSubmit={handleRecordPayment}
        onCancel={() => setPayingInvoice(null)}
      />
    </div>
  );
};

export default InvoicesPage;
