// SPDX-License-Identifier: BUSL-1.1

/**
 * Local-first invoice pipeline state for freelancers.
 *
 * Persists invoice records in localStorage and derives pipeline totals,
 * net-terms expected pay dates, overdue status, and forecast buckets.
 *
 * References: issue #2169
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  computeInvoiceForecast,
  createInvoice,
  applyInvoiceEdit,
  groupInvoicesByStatus,
  normalizeInvoiceStatuses,
  type CreateInvoiceInput,
  type ForecastBucket,
  type Invoice,
  type InvoicePipelineGroup,
  type InvoiceStatus,
  type UpdateInvoiceInput,
} from '../lib/analytics/invoices';

const STORAGE_KEY = 'finance:invoices';

export interface UseInvoicesResult {
  invoices: Invoice[];
  pipelineGroups: InvoicePipelineGroup[];
  forecastBuckets: ForecastBucket[];
  totalOutstandingCents: number;
  addInvoice: (input: CreateInvoiceInput) => Invoice;
  updateInvoice: (invoiceId: string, input: UpdateInvoiceInput) => void;
  updateInvoiceStatus: (invoiceId: string, status: InvoiceStatus) => void;
  deleteInvoice: (invoiceId: string) => void;
  refresh: () => void;
}

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function makeId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `invoice-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function isInvoice(value: unknown): value is Invoice {
  if (!value || typeof value !== 'object') return false;
  const invoice = value as Partial<Invoice>;
  return (
    typeof invoice.id === 'string' &&
    typeof invoice.clientName === 'string' &&
    typeof invoice.amountCents === 'number' &&
    typeof invoice.issueDate === 'string' &&
    typeof invoice.paymentTerm === 'string' &&
    typeof invoice.status === 'string' &&
    typeof invoice.expectedPayDate === 'string'
  );
}

function loadInvoices(): Invoice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isInvoice) : [];
  } catch {
    return [];
  }
}

function persistInvoices(invoices: Invoice[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
  } catch {
    // Local storage may be unavailable or full.
  }
}

export function useInvoices(): UseInvoicesResult {
  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    normalizeInvoiceStatuses(loadInvoices(), todayIsoDate()),
  );
  const [today, setToday] = useState(todayIsoDate);

  useEffect(() => {
    persistInvoices(invoices);
  }, [invoices]);

  const refresh = useCallback(() => {
    const currentDate = todayIsoDate();
    setToday(currentDate);
    setInvoices((prev) => normalizeInvoiceStatuses(prev, currentDate));
  }, []);

  const addInvoice = useCallback((input: CreateInvoiceInput) => {
    const now = new Date().toISOString();
    const invoice = createInvoice(input, now, makeId());
    setInvoices((prev) => normalizeInvoiceStatuses([invoice, ...prev], todayIsoDate()));
    return invoice;
  }, []);

  const updateInvoice = useCallback((invoiceId: string, input: UpdateInvoiceInput) => {
    const currentDate = todayIsoDate();
    setToday(currentDate);
    setInvoices((prev) =>
      normalizeInvoiceStatuses(
        prev.map((invoice) =>
          invoice.id === invoiceId
            ? applyInvoiceEdit(invoice, input, new Date().toISOString())
            : invoice,
        ),
        currentDate,
      ),
    );
  }, []);

  const updateInvoiceStatus = useCallback((invoiceId: string, status: InvoiceStatus) => {
    const currentDate = todayIsoDate();
    setToday(currentDate);
    setInvoices((prev) =>
      normalizeInvoiceStatuses(
        prev.map((invoice) =>
          invoice.id === invoiceId
            ? { ...invoice, status, updatedAt: new Date().toISOString() }
            : invoice,
        ),
        currentDate,
      ),
    );
  }, []);

  const deleteInvoice = useCallback((invoiceId: string) => {
    setInvoices((prev) => prev.filter((invoice) => invoice.id !== invoiceId));
  }, []);

  const pipelineGroups = useMemo(() => groupInvoicesByStatus(invoices, today), [invoices, today]);
  const forecastBuckets = useMemo(() => computeInvoiceForecast(invoices, today), [invoices, today]);
  const totalOutstandingCents = useMemo(
    () => forecastBuckets.reduce((sum, bucket) => sum + bucket.totalCents, 0),
    [forecastBuckets],
  );

  return {
    invoices,
    pipelineGroups,
    forecastBuckets,
    totalOutstandingCents,
    addInvoice,
    updateInvoice,
    updateInvoiceStatus,
    deleteInvoice,
    refresh,
  };
}
