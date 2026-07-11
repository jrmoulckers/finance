// SPDX-License-Identifier: BUSL-1.1

/**
 * Invoice pipeline and expected-income forecast utilities.
 *
 * Pure functions for net-terms expected pay dates, overdue detection,
 * pipeline grouping, and forward-looking cash-flow buckets. Monetary
 * values are integer cents.
 *
 * References: issue #2169
 */

import { escapeCsvField } from '../export/simple-export';
import type { Currency } from '../../kmp/bridge';
import type { CreateTransactionInput } from '../../db/repositories/transactions';

export type InvoicePaymentTerm = 'due-on-receipt' | 'net-15' | 'net-30' | 'net-45' | 'net-60';

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue';

export interface Invoice {
  readonly id: string;
  readonly clientName: string;
  readonly amountCents: number;
  /** ISO 4217 currency code the invoice is denominated in (e.g. 'USD', 'EUR'). */
  readonly currency: string;
  readonly issueDate: string;
  readonly paymentTerm: InvoicePaymentTerm;
  readonly status: InvoiceStatus;
  readonly expectedPayDate: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** ISO date of the most recent follow-up sent for an overdue invoice. */
  readonly lastContactedDate?: string;
  /** Total amount received so far, in cents (supports partial payments). */
  readonly amountPaidCents?: number;
  /** ISO date the most recent payment was received. */
  readonly paidDate?: string;
  /** Account id the most recent cash inflow for this invoice landed in (#3266). */
  readonly paymentAccountId?: string;
  /** Transaction id of the most recent cash inflow recorded for this invoice (#3266). */
  readonly paymentTransactionId?: string;
}

export interface CreateInvoiceInput {
  readonly clientName: string;
  readonly amountCents: number;
  readonly issueDate: string;
  readonly paymentTerm: InvoicePaymentTerm;
  readonly status?: InvoiceStatus;
  /** ISO 4217 currency code; defaults to {@link DEFAULT_INVOICE_CURRENCY} (#3263). */
  readonly currency?: string;
}

export interface UpdateInvoiceInput {
  readonly clientName: string;
  readonly amountCents: number;
  readonly issueDate: string;
  readonly paymentTerm: InvoicePaymentTerm;
  readonly status: InvoiceStatus;
  /** ISO 4217 currency code; when omitted the existing currency is kept (#3263). */
  readonly currency?: string;
}

/** Default currency for invoices created without an explicit currency (#3263). */
export const DEFAULT_INVOICE_CURRENCY = 'USD';

/** Normalize a user-supplied currency code to a trimmed upper-case ISO code. */
export function normalizeInvoiceCurrency(currency: string | undefined): string {
  const code = (currency ?? '').trim().toUpperCase();
  return code === '' ? DEFAULT_INVOICE_CURRENCY : code;
}

export interface InvoicePipelineGroup {
  readonly status: InvoiceStatus;
  readonly label: string;
  readonly invoices: Invoice[];
  readonly totalCents: number;
}

export type ForecastBucketId =
  'past-due' | 'next-30' | 'days-31-60' | 'days-61-90' | 'days-90-plus';

export interface ForecastBucket {
  readonly id: ForecastBucketId;
  readonly label: string;
  readonly invoices: Invoice[];
  readonly totalCents: number;
}

export const PAYMENT_TERM_LABELS: Record<InvoicePaymentTerm, string> = {
  'due-on-receipt': 'Due on receipt',
  'net-15': 'Net-15',
  'net-30': 'Net-30',
  'net-45': 'Net-45',
  'net-60': 'Net-60',
};

export const PAYMENT_TERM_DAYS: Record<InvoicePaymentTerm, number> = {
  'due-on-receipt': 0,
  'net-15': 15,
  'net-30': 30,
  'net-45': 45,
  'net-60': 60,
};

export const INVOICE_STATUSES: readonly InvoiceStatus[] = ['Draft', 'Sent', 'Paid', 'Overdue'];
export const PAYMENT_TERMS: readonly InvoicePaymentTerm[] = [
  'due-on-receipt',
  'net-15',
  'net-30',
  'net-45',
  'net-60',
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIsoDateParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error(`Invalid ISO date: ${date}`);
  }
  return { year, month, day };
}

function formatIsoDateUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysToIsoDate(date: string, days: number): string {
  const { year, month, day } = parseIsoDateParts(date);
  const utc = Date.UTC(year, month - 1, day + days);
  return formatIsoDateUtc(new Date(utc));
}

export function diffDays(startDate: string, endDate: string): number {
  const start = parseIsoDateParts(startDate);
  const end = parseIsoDateParts(endDate);
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endUtc - startUtc) / MS_PER_DAY);
}

export function computeExpectedPayDate(issueDate: string, paymentTerm: InvoicePaymentTerm): string {
  return addDaysToIsoDate(issueDate, PAYMENT_TERM_DAYS[paymentTerm]);
}

export function getEffectiveInvoiceStatus(invoice: Invoice, todayIso: string): InvoiceStatus {
  if (invoice.status === 'Sent' && invoice.expectedPayDate < todayIso) {
    return 'Overdue';
  }
  return invoice.status;
}

export function normalizeInvoiceStatuses(invoices: Invoice[], todayIso: string): Invoice[] {
  return invoices.map((invoice) => {
    const effectiveStatus = getEffectiveInvoiceStatus(invoice, todayIso);
    return effectiveStatus === invoice.status ? invoice : { ...invoice, status: effectiveStatus };
  });
}

/** Days without a follow-up before an overdue invoice is flagged for chasing. */
export const FOLLOW_UP_STALE_DAYS = 7;

/**
 * Record that a follow-up was sent for an invoice on the given date.
 *
 * @param invoice - The invoice being chased.
 * @param contactDateIso - ISO date the follow-up was sent.
 * @param nowIso - Current timestamp (ISO 8601) for updatedAt.
 * @returns A new invoice with the last-contacted date recorded.
 */
export function recordInvoiceContact(
  invoice: Invoice,
  contactDateIso: string,
  nowIso: string,
): Invoice {
  return { ...invoice, lastContactedDate: contactDateIso, updatedAt: nowIso };
}

/**
 * Whether an overdue invoice needs a follow-up: it is effectively overdue and
 * has either never been contacted or was last contacted at least
 * {@link FOLLOW_UP_STALE_DAYS} days ago.
 */
export function invoiceNeedsFollowUp(invoice: Invoice, todayIso: string): boolean {
  if (getEffectiveInvoiceStatus(invoice, todayIso) !== 'Overdue') return false;
  if (!invoice.lastContactedDate) return true;
  return diffDays(invoice.lastContactedDate, todayIso) >= FOLLOW_UP_STALE_DAYS;
}

/**
 * Overdue invoices that need a follow-up, oldest expected pay date first.
 */
export function getInvoicesNeedingFollowUp(invoices: Invoice[], todayIso: string): Invoice[] {
  return invoices
    .filter((invoice) => invoiceNeedsFollowUp(invoice, todayIso))
    .sort((a, b) => a.expectedPayDate.localeCompare(b.expectedPayDate));
}

/** Amount still owed on an invoice after any partial payments, in cents (never negative). */
export function invoiceOutstandingCents(invoice: Invoice): number {
  return Math.max(0, invoice.amountCents - (invoice.amountPaidCents ?? 0));
}

/** Whether an invoice has been paid in full (recorded payments cover the total). */
export function invoiceIsFullyPaid(invoice: Invoice): boolean {
  return (invoice.amountPaidCents ?? 0) >= invoice.amountCents;
}

/** Links an invoice payment to the cash-inflow transaction it produced (#3266). */
export interface InvoicePaymentLink {
  /** Account the cash inflow landed in. */
  readonly accountId: string;
  /** Id of the created cash-inflow transaction. */
  readonly transactionId: string;
}

/**
 * Record a (full or partial) payment against an invoice.
 *
 * Payments accumulate; the total is clamped to the invoice amount so the
 * outstanding balance never goes negative. Negative payment amounts are
 * ignored. When the cumulative payment covers the full amount the status is
 * advanced to `Paid`. When a `link` is supplied the invoice records the
 * account and transaction the cash inflow landed in so paid revenue is tied to
 * a real balance (issue #3266).
 *
 * @param invoice - The invoice receiving payment.
 * @param paymentCents - Amount received in this payment, in cents.
 * @param paidDateIso - ISO date the payment was received.
 * @param nowIso - Current timestamp (ISO 8601) for updatedAt.
 * @param link - Optional link to the cash-inflow transaction and its account.
 * @returns A new invoice with the payment recorded.
 */
export function recordInvoicePayment(
  invoice: Invoice,
  paymentCents: number,
  paidDateIso: string,
  nowIso: string,
  link?: InvoicePaymentLink,
): Invoice {
  const priorPaid = invoice.amountPaidCents ?? 0;
  const nextPaid = Math.min(priorPaid + Math.max(0, paymentCents), invoice.amountCents);
  const fullyPaid = nextPaid >= invoice.amountCents;
  return {
    ...invoice,
    amountPaidCents: nextPaid,
    paidDate: paidDateIso,
    status: fullyPaid ? 'Paid' : invoice.status,
    updatedAt: nowIso,
    ...(link ? { paymentAccountId: link.accountId, paymentTransactionId: link.transactionId } : {}),
  };
}

/** Context needed to turn an invoice payment into a cash-inflow transaction. */
export interface InvoiceCashInflowContext {
  /** Account the money landed in. */
  readonly accountId: string;
  /** Household that owns the receiving account. */
  readonly householdId: string;
  /** Currency of the receiving account. */
  readonly currency: Currency;
  /** Amount received in this payment, in cents. */
  readonly paymentCents: number;
  /** ISO date the payment was received. */
  readonly paidDateIso: string;
}

/**
 * Build the cash-inflow transaction for an invoice payment.
 *
 * Marking an invoice paid should move real money: this produces an `INCOME`
 * transaction against the chosen account so paid revenue shows up in balances,
 * net worth and reconciliation instead of living only in the invoice pipeline
 * (issue #3266). Amounts are positive cents (the app's income convention) and
 * the transaction adopts the receiving account's currency — the invoice's own
 * currency (#3263) records what was billed, but the cash actually lands in the
 * receiving account, so that account's currency is the source of truth here.
 */
export function buildInvoiceCashInflow(
  invoice: Invoice,
  context: InvoiceCashInflowContext,
): CreateTransactionInput {
  return {
    householdId: context.householdId,
    accountId: context.accountId,
    type: 'INCOME',
    amount: { amount: Math.abs(Math.round(context.paymentCents)) },
    currency: context.currency,
    payee: invoice.clientName,
    note: `Invoice payment from ${invoice.clientName}`,
    date: context.paidDateIso,
  };
}

export function createInvoice(input: CreateInvoiceInput, nowIso: string, id: string): Invoice {
  const invoice: Invoice = {
    id,
    clientName: input.clientName.trim(),
    amountCents: input.amountCents,
    currency: normalizeInvoiceCurrency(input.currency),
    issueDate: input.issueDate,
    paymentTerm: input.paymentTerm,
    status: input.status ?? 'Sent',
    expectedPayDate: computeExpectedPayDate(input.issueDate, input.paymentTerm),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return { ...invoice, status: getEffectiveInvoiceStatus(invoice, nowIso.slice(0, 10)) };
}

/**
 * Apply an edit to an existing invoice, recomputing the derived expected pay
 * date and effective status while preserving the original id and createdAt.
 *
 * @param invoice - The existing invoice being edited.
 * @param input - The full set of user-editable invoice fields.
 * @param nowIso - Current timestamp (ISO 8601) used for updatedAt and status.
 * @returns A new invoice with the edits applied.
 */
export function applyInvoiceEdit(
  invoice: Invoice,
  input: UpdateInvoiceInput,
  nowIso: string,
): Invoice {
  const updated: Invoice = {
    ...invoice,
    clientName: input.clientName.trim(),
    amountCents: input.amountCents,
    currency: input.currency !== undefined ? normalizeInvoiceCurrency(input.currency) : invoice.currency,
    issueDate: input.issueDate,
    paymentTerm: input.paymentTerm,
    status: input.status,
    expectedPayDate: computeExpectedPayDate(input.issueDate, input.paymentTerm),
    updatedAt: nowIso,
  };

  return { ...updated, status: getEffectiveInvoiceStatus(updated, nowIso.slice(0, 10)) };
}

export function groupInvoicesByStatus(
  invoices: Invoice[],
  todayIso: string,
): InvoicePipelineGroup[] {
  const normalized = normalizeInvoiceStatuses(invoices, todayIso);

  return INVOICE_STATUSES.map((status) => {
    const statusInvoices = normalized
      .filter((invoice) => invoice.status === status)
      .sort((a, b) => a.expectedPayDate.localeCompare(b.expectedPayDate));

    return {
      status,
      label: status,
      invoices: statusInvoices,
      totalCents: statusInvoices.reduce((sum, invoice) => sum + invoice.amountCents, 0),
    };
  });
}

export function computeInvoiceForecast(invoices: Invoice[], todayIso: string): ForecastBucket[] {
  const buckets: ForecastBucket[] = [
    { id: 'past-due', label: 'Past due', invoices: [], totalCents: 0 },
    { id: 'next-30', label: 'Next 30 days', invoices: [], totalCents: 0 },
    { id: 'days-31-60', label: '30–60 days', invoices: [], totalCents: 0 },
    { id: 'days-61-90', label: '60–90 days', invoices: [], totalCents: 0 },
    { id: 'days-90-plus', label: '90+ days', invoices: [], totalCents: 0 },
  ];

  const bucketById = new Map<ForecastBucketId, ForecastBucket>(
    buckets.map((bucket) => [bucket.id, bucket]),
  );

  for (const invoice of normalizeInvoiceStatuses(invoices, todayIso)) {
    if (invoice.status === 'Draft' || invoice.status === 'Paid') continue;

    const outstandingCents = invoiceOutstandingCents(invoice);
    if (outstandingCents <= 0) continue;

    const daysUntilPay = diffDays(todayIso, invoice.expectedPayDate);
    let bucketId: ForecastBucketId;
    if (daysUntilPay < 0) bucketId = 'past-due';
    else if (daysUntilPay <= 30) bucketId = 'next-30';
    else if (daysUntilPay <= 60) bucketId = 'days-31-60';
    else if (daysUntilPay <= 90) bucketId = 'days-61-90';
    else bucketId = 'days-90-plus';

    const bucket = bucketById.get(bucketId);
    if (bucket) {
      bucket.invoices.push(invoice);
      (bucket as { totalCents: number }).totalCents += outstandingCents;
    }
  }

  return buckets.map((bucket) => ({
    ...bucket,
    invoices: [...bucket.invoices].sort((a, b) =>
      a.expectedPayDate.localeCompare(b.expectedPayDate),
    ),
  }));
}

/** CSV header for {@link exportInvoicesCsv}. */
export const INVOICE_CSV_HEADER =
  'Client,Amount,Currency,Issue date,Payment term,Status,Expected pay date,Aging bucket';

function invoiceAmountDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Serialize the invoice pipeline to CSV for bookkeeping/reconciliation outside
 * the app. One row per invoice (with its effective status and aging bucket)
 * plus a trailing totals row. Draft and paid invoices have a blank aging
 * bucket because they are not part of the receivables forecast.
 */
export function exportInvoicesCsv(invoices: Invoice[], todayIso: string): string {
  const normalized = normalizeInvoiceStatuses(invoices, todayIso);

  const bucketByInvoiceId = new Map<string, string>();
  for (const bucket of computeInvoiceForecast(invoices, todayIso)) {
    for (const invoice of bucket.invoices) {
      bucketByInvoiceId.set(invoice.id, bucket.label);
    }
  }

  const rows = [...normalized]
    .sort(
      (a, b) =>
        a.expectedPayDate.localeCompare(b.expectedPayDate) ||
        a.clientName.localeCompare(b.clientName),
    )
    .map((invoice) =>
      [
        escapeCsvField(invoice.clientName),
        invoiceAmountDollars(invoice.amountCents),
        invoice.currency,
        invoice.issueDate,
        PAYMENT_TERM_LABELS[invoice.paymentTerm],
        invoice.status,
        invoice.expectedPayDate,
        bucketByInvoiceId.get(invoice.id) ?? '',
      ].join(','),
    );

  const totalCents = normalized.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const totalRow = ['Total', invoiceAmountDollars(totalCents), '', '', '', '', '', ''].join(',');

  return [INVOICE_CSV_HEADER, ...rows, totalRow].join('\n');
}
