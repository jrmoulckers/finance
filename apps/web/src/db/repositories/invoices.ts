// SPDX-License-Identifier: BUSL-1.1

/**
 * Invoice persistence repository (issue #3273).
 *
 * Durable, encrypted storage for the freelancer invoice pipeline. Replaces the
 * previous `localStorage` store so invoice records survive a browser-cache clear
 * and ride the SQLite-WASM (OPFS) + sync path used by accounts/transactions —
 * no plaintext financial data on disk.
 *
 * This layer is deliberately thin: the invoice domain logic (expected pay dates,
 * overdue normalization, partial payments, the #3266 cash-inflow link) lives in
 * the pure, well-tested `lib/analytics/invoices` module. The repository only
 * reads and writes fully-formed {@link Invoice} records.
 */

import {
  computeExpectedPayDate,
  type Invoice,
  type InvoicePaymentTerm,
  type InvoiceStatus,
} from '../../lib/analytics/invoices';
import { execute, query, queryOne, type Row, type SqliteDb } from '../sqlite-wasm';
import { getPrimaryHouseholdId } from './household';
import { SQLITE_NOW_EXPRESSION, optionalString, requireNumber, requireString } from './helpers';

/** localStorage key the pre-#3273 invoice store wrote to. */
const LEGACY_INVOICES_STORAGE_KEY = 'finance:invoices';

const INVOICE_COLUMNS = [
  'id',
  'household_id',
  'client_name',
  'amount_cents',
  'issue_date',
  'payment_term',
  'status',
  'expected_pay_date',
  'last_contacted_date',
  'amount_paid_cents',
  'paid_date',
  'payment_account_id',
  'payment_transaction_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'sync_version',
  'is_synced',
].join(', ');

const INVOICE_BASE_QUERY = `SELECT ${INVOICE_COLUMNS} FROM invoice WHERE deleted_at IS NULL`;

/**
 * Map a database row to the {@link Invoice} domain shape.
 *
 * Optional fields (payment link, last-contacted date, partial-payment total) are
 * only included when present so the mapped object matches the shape produced by
 * the pure `lib/analytics/invoices` factory functions.
 */
function mapInvoice(row: Row): Invoice {
  const base: Invoice = {
    id: requireString(row.id, 'invoice.id'),
    clientName: requireString(row.client_name, 'invoice.client_name'),
    amountCents: requireNumber(row.amount_cents, 'invoice.amount_cents'),
    issueDate: requireString(row.issue_date, 'invoice.issue_date'),
    paymentTerm: requireString(row.payment_term, 'invoice.payment_term') as InvoicePaymentTerm,
    status: requireString(row.status, 'invoice.status') as InvoiceStatus,
    expectedPayDate: requireString(row.expected_pay_date, 'invoice.expected_pay_date'),
    createdAt: requireString(row.created_at, 'invoice.created_at'),
    updatedAt: requireString(row.updated_at, 'invoice.updated_at'),
  };

  const lastContactedDate = optionalString(row.last_contacted_date);
  const paidDate = optionalString(row.paid_date);
  const paymentAccountId = optionalString(row.payment_account_id);
  const paymentTransactionId = optionalString(row.payment_transaction_id);
  const amountPaidCents =
    row.amount_paid_cents == null
      ? 0
      : requireNumber(row.amount_paid_cents, 'invoice.amount_paid_cents');

  return {
    ...base,
    ...(lastContactedDate ? { lastContactedDate } : {}),
    ...(amountPaidCents > 0 ? { amountPaidCents } : {}),
    ...(paidDate ? { paidDate } : {}),
    ...(paymentAccountId ? { paymentAccountId } : {}),
    ...(paymentTransactionId ? { paymentTransactionId } : {}),
  };
}

/** Return all non-deleted invoices, newest first. */
export function getAllInvoices(db: SqliteDb): Invoice[] {
  return query<Row>(db, `${INVOICE_BASE_QUERY} ORDER BY created_at DESC, id DESC`).rows.map(
    mapInvoice,
  );
}

/** Find a single non-deleted invoice by its identifier. */
export function getInvoiceById(db: SqliteDb, invoiceId: string): Invoice | null {
  const row = queryOne<Row>(db, `${INVOICE_BASE_QUERY} AND id = ?`, [invoiceId]);
  return row ? mapInvoice(row) : null;
}

/**
 * Insert a fully-formed invoice and return the persisted record.
 *
 * The invoice's own timestamps are preserved (the domain layer is the source of
 * truth for `createdAt`/`updatedAt`). `household_id` is resolved to the primary
 * household when one exists so the record is scoped for sync/RLS; it stays null
 * in a clean-slate workspace with no household yet.
 */
export function insertInvoice(db: SqliteDb, invoice: Invoice): Invoice {
  const householdId = getPrimaryHouseholdId(db);

  execute(
    db,
    `INSERT INTO invoice (
      id,
      household_id,
      client_name,
      amount_cents,
      issue_date,
      payment_term,
      status,
      expected_pay_date,
      last_contacted_date,
      amount_paid_cents,
      paid_date,
      payment_account_id,
      payment_transaction_id,
      created_at,
      updated_at,
      deleted_at,
      sync_version,
      is_synced
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      NULL,
      1,
      0
    )`,
    [
      invoice.id,
      householdId,
      invoice.clientName,
      invoice.amountCents,
      invoice.issueDate,
      invoice.paymentTerm,
      invoice.status,
      invoice.expectedPayDate,
      invoice.lastContactedDate ?? null,
      invoice.amountPaidCents ?? 0,
      invoice.paidDate ?? null,
      invoice.paymentAccountId ?? null,
      invoice.paymentTransactionId ?? null,
      invoice.createdAt,
      invoice.updatedAt,
    ],
  );

  const created = getInvoiceById(db, invoice.id);
  if (!created) {
    throw new Error('Failed to persist invoice.');
  }
  return created;
}

/**
 * Persist an edit to an existing invoice from a fully-formed record.
 *
 * Used for edits, status changes, follow-up logging and payments — the caller
 * computes the next {@link Invoice} via the pure domain helpers and this writes
 * every mutable column. Returns `null` when the invoice does not exist.
 */
export function updateInvoiceRecord(db: SqliteDb, invoice: Invoice): Invoice | null {
  const existing = getInvoiceById(db, invoice.id);
  if (!existing) {
    return null;
  }

  execute(
    db,
    `UPDATE invoice
        SET client_name = ?,
            amount_cents = ?,
            issue_date = ?,
            payment_term = ?,
            status = ?,
            expected_pay_date = ?,
            last_contacted_date = ?,
            amount_paid_cents = ?,
            paid_date = ?,
            payment_account_id = ?,
            payment_transaction_id = ?,
            updated_at = ?,
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [
      invoice.clientName,
      invoice.amountCents,
      invoice.issueDate,
      invoice.paymentTerm,
      invoice.status,
      invoice.expectedPayDate,
      invoice.lastContactedDate ?? null,
      invoice.amountPaidCents ?? 0,
      invoice.paidDate ?? null,
      invoice.paymentAccountId ?? null,
      invoice.paymentTransactionId ?? null,
      invoice.updatedAt,
      invoice.id,
    ],
  );

  return getInvoiceById(db, invoice.id);
}

/** Soft-delete an invoice by marking its deleted timestamp. */
export function deleteInvoiceRecord(db: SqliteDb, invoiceId: string): boolean {
  const existing = getInvoiceById(db, invoiceId);
  if (!existing) {
    return false;
  }

  execute(
    db,
    `UPDATE invoice
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [invoiceId],
  );

  return true;
}

/** Narrow an unknown legacy localStorage entry to an invoice-like record. */
function isLegacyInvoice(value: unknown): value is Invoice {
  if (!value || typeof value !== 'object') return false;
  const invoice = value as Partial<Invoice>;
  return (
    typeof invoice.id === 'string' &&
    typeof invoice.clientName === 'string' &&
    typeof invoice.amountCents === 'number' &&
    typeof invoice.issueDate === 'string' &&
    typeof invoice.paymentTerm === 'string' &&
    typeof invoice.status === 'string'
  );
}

/** Coerce a legacy record into a complete {@link Invoice}, filling derived gaps. */
function normalizeLegacyInvoice(entry: Invoice): Invoice {
  const nowIso = new Date().toISOString();
  return {
    ...entry,
    expectedPayDate:
      entry.expectedPayDate || computeExpectedPayDate(entry.issueDate, entry.paymentTerm),
    createdAt: entry.createdAt || nowIso,
    updatedAt: entry.updatedAt || nowIso,
  };
}

/**
 * One-time migration of any invoices left in the pre-#3273 `localStorage` store
 * into the database, then clear the legacy key so it is never read again.
 *
 * Best-effort and idempotent: the key is removed before importing so concurrent
 * hook instances cannot double-import, and records whose id already exists are
 * skipped. Returns the number of records imported.
 */
export function importLegacyInvoices(db: SqliteDb): number {
  let raw: string | null;
  try {
    raw = globalThis.localStorage?.getItem(LEGACY_INVOICES_STORAGE_KEY) ?? null;
  } catch {
    return 0;
  }
  if (!raw) return 0;

  // Remove first so a second concurrent caller sees nothing to import.
  try {
    globalThis.localStorage?.removeItem(LEGACY_INVOICES_STORAGE_KEY);
  } catch {
    // Ignore: storage may be unavailable (private mode, quota).
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!Array.isArray(parsed)) return 0;

  let imported = 0;
  for (const entry of parsed) {
    if (!isLegacyInvoice(entry)) continue;
    try {
      if (getInvoiceById(db, entry.id)) continue;
      insertInvoice(db, normalizeLegacyInvoice(entry));
      imported += 1;
    } catch {
      // Best-effort per record — a single bad row must not abort the migration.
    }
  }
  return imported;
}
