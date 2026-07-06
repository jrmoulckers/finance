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

export type InvoicePaymentTerm = 'due-on-receipt' | 'net-15' | 'net-30' | 'net-45' | 'net-60';

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue';

export interface Invoice {
  readonly id: string;
  readonly clientName: string;
  readonly amountCents: number;
  readonly issueDate: string;
  readonly paymentTerm: InvoicePaymentTerm;
  readonly status: InvoiceStatus;
  readonly expectedPayDate: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateInvoiceInput {
  readonly clientName: string;
  readonly amountCents: number;
  readonly issueDate: string;
  readonly paymentTerm: InvoicePaymentTerm;
  readonly status?: InvoiceStatus;
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

export function createInvoice(input: CreateInvoiceInput, nowIso: string, id: string): Invoice {
  const invoice: Invoice = {
    id,
    clientName: input.clientName.trim(),
    amountCents: input.amountCents,
    issueDate: input.issueDate,
    paymentTerm: input.paymentTerm,
    status: input.status ?? 'Sent',
    expectedPayDate: computeExpectedPayDate(input.issueDate, input.paymentTerm),
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return { ...invoice, status: getEffectiveInvoiceStatus(invoice, nowIso.slice(0, 10)) };
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
      (bucket as { totalCents: number }).totalCents += invoice.amountCents;
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
  'Client,Amount,Issue date,Payment term,Status,Expected pay date,Aging bucket';

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
        invoice.issueDate,
        PAYMENT_TERM_LABELS[invoice.paymentTerm],
        invoice.status,
        invoice.expectedPayDate,
        bucketByInvoiceId.get(invoice.id) ?? '',
      ].join(','),
    );

  const totalCents = normalized.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const totalRow = ['Total', invoiceAmountDollars(totalCents), '', '', '', '', ''].join(',');

  return [INVOICE_CSV_HEADER, ...rows, totalRow].join('\n');
}
