// SPDX-License-Identifier: BUSL-1.1

/**
 * Invoice pipeline state for freelancers, backed by the local database.
 *
 * Persists invoice records in the encrypted SQLite-WASM (OPFS) store via the
 * invoices repository — the same durable, sync-enabled path used by accounts,
 * transactions and goals — instead of browser `localStorage`, so records survive
 * a cache clear and no plaintext financial data is written to disk (issue #3273).
 * Derives pipeline totals, net-terms expected pay dates, overdue status, and
 * forecast buckets from the pure `lib/analytics/invoices` domain module.
 *
 * References: issue #2169 (feature), issue #3273 (durable persistence)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDatabase } from '../db/DatabaseProvider';
import {
  deleteInvoiceRecord,
  getAllInvoices,
  getInvoiceById,
  importLegacyInvoices,
  insertInvoice,
  updateInvoiceRecord,
} from '../db/repositories/invoices';
import {
  computeInvoiceForecast,
  createInvoice,
  applyInvoiceEdit,
  groupInvoicesByStatus,
  normalizeInvoiceStatuses,
  recordInvoiceContact,
  recordInvoicePayment,
  type CreateInvoiceInput,
  type ForecastBucket,
  type Invoice,
  type InvoicePaymentLink,
  type InvoicePipelineGroup,
  type InvoiceStatus,
  type UpdateInvoiceInput,
} from '../lib/analytics/invoices';

export interface UseInvoicesResult {
  invoices: Invoice[];
  pipelineGroups: InvoicePipelineGroup[];
  forecastBuckets: ForecastBucket[];
  totalOutstandingCents: number;
  addInvoice: (input: CreateInvoiceInput) => Promise<Invoice>;
  updateInvoice: (invoiceId: string, input: UpdateInvoiceInput) => Promise<void>;
  updateInvoiceStatus: (invoiceId: string, status: InvoiceStatus) => Promise<void>;
  logInvoiceContact: (invoiceId: string) => Promise<void>;
  recordPayment: (
    invoiceId: string,
    paymentCents: number,
    paidDate?: string,
    link?: InvoicePaymentLink,
  ) => Promise<void>;
  deleteInvoice: (invoiceId: string) => Promise<void>;
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

export function useInvoices(): UseInvoicesResult {
  const db = useDatabase();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [today, setToday] = useState(todayIsoDate);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const currentDate = todayIsoDate();
    setToday(currentDate);
    void (async () => {
      try {
        // One-time migration of any records left in the pre-#3273 localStorage
        // store, then read the durable list back from the database.
        await importLegacyInvoices(db);
        setInvoices(normalizeInvoiceStatuses(await getAllInvoices(db), currentDate));
      } catch {
        setInvoices([]);
      }
    })();
  }, [db, refreshToken]);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  const addInvoice = useCallback(
    async (input: CreateInvoiceInput): Promise<Invoice> => {
      const invoice = createInvoice(input, new Date().toISOString(), makeId());
      try {
        await insertInvoice(db, invoice);
        refresh();
      } catch {
        // Non-throwing convention: return the computed invoice even if the
        // write failed so callers keep a stable synchronous signature.
      }
      return invoice;
    },
    [db, refresh],
  );

  const updateInvoice = useCallback(
    async (invoiceId: string, input: UpdateInvoiceInput): Promise<void> => {
      try {
        const existing = await getInvoiceById(db, invoiceId);
        if (!existing) return;
        await updateInvoiceRecord(db, applyInvoiceEdit(existing, input, new Date().toISOString()));
        refresh();
      } catch {
        // Swallow — the invoices surface has no error channel.
      }
    },
    [db, refresh],
  );

  const updateInvoiceStatus = useCallback(
    async (invoiceId: string, status: InvoiceStatus): Promise<void> => {
      try {
        const existing = await getInvoiceById(db, invoiceId);
        if (!existing) return;
        await updateInvoiceRecord(db, { ...existing, status, updatedAt: new Date().toISOString() });
        refresh();
      } catch {
        // Swallow — the invoices surface has no error channel.
      }
    },
    [db, refresh],
  );

  const deleteInvoice = useCallback(
    async (invoiceId: string): Promise<void> => {
      try {
        await deleteInvoiceRecord(db, invoiceId);
        refresh();
      } catch {
        // Swallow — the invoices surface has no error channel.
      }
    },
    [db, refresh],
  );

  const logInvoiceContact = useCallback(
    async (invoiceId: string): Promise<void> => {
      try {
        const existing = await getInvoiceById(db, invoiceId);
        if (!existing) return;
        await updateInvoiceRecord(
          db,
          recordInvoiceContact(existing, todayIsoDate(), new Date().toISOString()),
        );
        refresh();
      } catch {
        // Swallow — the invoices surface has no error channel.
      }
    },
    [db, refresh],
  );

  const recordPayment = useCallback(
    async (
      invoiceId: string,
      paymentCents: number,
      paidDate?: string,
      link?: InvoicePaymentLink,
    ): Promise<void> => {
      try {
        const existing = await getInvoiceById(db, invoiceId);
        if (!existing) return;
        const currentDate = todayIsoDate();
        await updateInvoiceRecord(
          db,
          recordInvoicePayment(
            existing,
            paymentCents,
            paidDate ?? currentDate,
            new Date().toISOString(),
            link,
          ),
        );
        refresh();
      } catch {
        // Swallow — the invoices surface has no error channel.
      }
    },
    [db, refresh],
  );

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
    logInvoiceContact,
    recordPayment,
    deleteInvoice,
    refresh,
  };
}
