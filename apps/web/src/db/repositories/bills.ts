// SPDX-License-Identifier: BUSL-1.1

/**
 * SQLite-WASM repository for bill reminders.
 *
 * Handles CRUD operations for the `bill` table, following the same
 * patterns established by the accounts and goals repositories.
 *
 * References: issue #1123
 */

import type { Bill, BillFrequency, BillStatus, Currency, SyncId } from '../../kmp/bridge';
import { Currencies } from '../../kmp/bridge';
import { execute, query, queryOne, type Row, type SqliteDb } from '../sqlite-wasm';
import {
  SQLITE_NOW_EXPRESSION,
  mapCents,
  mapCurrency,
  mapSyncMetadata,
  optionalString,
  requireNumber,
  requireString,
  toBoolean,
} from './helpers';

const BILL_COLUMNS = [
  'id',
  'household_id',
  'name',
  'payee',
  'amount',
  'currency',
  'due_date',
  'frequency',
  'status',
  'category_id',
  'account_id',
  'note',
  'is_auto_pay',
  'reminder_days_before',
  'last_paid_date',
  'created_at',
  'updated_at',
  'deleted_at',
  'sync_version',
  'is_synced',
].join(', ');

const BILL_BASE_QUERY = `SELECT ${BILL_COLUMNS} FROM bill WHERE deleted_at IS NULL`;

/** Input used when creating a new bill record. */
export interface CreateBillInput {
  householdId: SyncId;
  name: string;
  payee: string;
  amount: { amount: number };
  currency?: Currency;
  dueDate: string;
  frequency: BillFrequency;
  status?: BillStatus;
  categoryId?: SyncId | null;
  accountId?: SyncId | null;
  note?: string | null;
  isAutoPay?: boolean;
  reminderDaysBefore?: number;
}

/** Input used when updating an existing bill record. */
export interface UpdateBillInput {
  name?: string;
  payee?: string;
  amount?: { amount: number };
  currency?: Currency;
  dueDate?: string;
  frequency?: BillFrequency;
  status?: BillStatus;
  categoryId?: SyncId | null;
  accountId?: SyncId | null;
  note?: string | null;
  isAutoPay?: boolean;
  reminderDaysBefore?: number;
  lastPaidDate?: string | null;
}

/** Map a raw database row to a Bill domain object. */
function mapBill(row: Row): Bill {
  return {
    id: requireString(row.id, 'bill.id'),
    householdId: requireString(row.household_id, 'bill.household_id'),
    name: requireString(row.name, 'bill.name'),
    payee: requireString(row.payee, 'bill.payee'),
    amount: mapCents(row.amount, 'bill.amount'),
    currency: mapCurrency(row.currency),
    dueDate: requireString(row.due_date, 'bill.due_date'),
    frequency: requireString(row.frequency, 'bill.frequency') as BillFrequency,
    status: requireString(row.status, 'bill.status') as BillStatus,
    categoryId: optionalString(row.category_id),
    accountId: optionalString(row.account_id),
    note: optionalString(row.note),
    isAutoPay: toBoolean(row.is_auto_pay),
    reminderDaysBefore: requireNumber(row.reminder_days_before, 'bill.reminder_days_before'),
    lastPaidDate: optionalString(row.last_paid_date),
    ...mapSyncMetadata(row),
  };
}

/** Return every non-deleted bill ordered by due date. */
export function getAllBills(db: SqliteDb): Bill[] {
  return query<Row>(db, `${BILL_BASE_QUERY} ORDER BY due_date ASC, name ASC`).rows.map(mapBill);
}

/** Find a single non-deleted bill by its identifier. */
export function getBillById(db: SqliteDb, billId: SyncId): Bill | null {
  const row = queryOne<Row>(db, `${BILL_BASE_QUERY} AND id = ?`, [billId]);
  return row ? mapBill(row) : null;
}

/** Return all non-deleted bills with a specific status. */
export function getBillsByStatus(db: SqliteDb, status: BillStatus): Bill[] {
  return query<Row>(db, `${BILL_BASE_QUERY} AND status = ? ORDER BY due_date ASC`, [
    status,
  ]).rows.map(mapBill);
}

/** Return all non-deleted bills due within a given number of days. */
export function getUpcomingBills(db: SqliteDb, withinDays: number): Bill[] {
  return query<Row>(
    db,
    `${BILL_BASE_QUERY} AND status IN ('UPCOMING', 'OVERDUE')
       AND due_date <= date('now', '+' || ? || ' days')
       ORDER BY due_date ASC`,
    [withinDays],
  ).rows.map(mapBill);
}

/** Insert a new bill row and return the created bill. */
export function createBill(db: SqliteDb, input: CreateBillInput): Bill {
  const id = crypto.randomUUID();
  const currency = input.currency ?? Currencies.USD;

  execute(
    db,
    `INSERT INTO bill (
      id,
      household_id,
      name,
      payee,
      amount,
      currency,
      due_date,
      frequency,
      status,
      category_id,
      account_id,
      note,
      is_auto_pay,
      reminder_days_before,
      last_paid_date,
      created_at,
      updated_at,
      deleted_at,
      sync_version,
      is_synced
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, NULL,
      ${SQLITE_NOW_EXPRESSION},
      ${SQLITE_NOW_EXPRESSION},
      NULL,
      1,
      0
    )`,
    [
      id,
      input.householdId,
      input.name,
      input.payee,
      input.amount.amount,
      currency.code,
      input.dueDate,
      input.frequency,
      input.status ?? 'UPCOMING',
      input.categoryId ?? null,
      input.accountId ?? null,
      input.note ?? null,
      input.isAutoPay ? 1 : 0,
      input.reminderDaysBefore ?? 3,
    ],
  );

  const created = getBillById(db, id);
  if (!created) {
    throw new Error('Failed to create bill.');
  }

  return created;
}

/** Update a bill row and return the refreshed bill. */
export function updateBill(db: SqliteDb, billId: SyncId, updates: UpdateBillInput): Bill | null {
  const existing = getBillById(db, billId);
  if (!existing) {
    return null;
  }

  const merged = {
    name: updates.name ?? existing.name,
    payee: updates.payee ?? existing.payee,
    amount: updates.amount ?? existing.amount,
    currency: updates.currency ?? existing.currency,
    dueDate: updates.dueDate ?? existing.dueDate,
    frequency: updates.frequency ?? existing.frequency,
    status: updates.status ?? existing.status,
    categoryId: updates.categoryId !== undefined ? updates.categoryId : existing.categoryId,
    accountId: updates.accountId !== undefined ? updates.accountId : existing.accountId,
    note: updates.note !== undefined ? updates.note : existing.note,
    isAutoPay: updates.isAutoPay ?? existing.isAutoPay,
    reminderDaysBefore: updates.reminderDaysBefore ?? existing.reminderDaysBefore,
    lastPaidDate: updates.lastPaidDate !== undefined ? updates.lastPaidDate : existing.lastPaidDate,
  };

  execute(
    db,
    `UPDATE bill
        SET name = ?,
            payee = ?,
            amount = ?,
            currency = ?,
            due_date = ?,
            frequency = ?,
            status = ?,
            category_id = ?,
            account_id = ?,
            note = ?,
            is_auto_pay = ?,
            reminder_days_before = ?,
            last_paid_date = ?,
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [
      merged.name,
      merged.payee,
      merged.amount.amount,
      merged.currency.code,
      merged.dueDate,
      merged.frequency,
      merged.status,
      merged.categoryId,
      merged.accountId,
      merged.note,
      merged.isAutoPay ? 1 : 0,
      merged.reminderDaysBefore,
      merged.lastPaidDate,
      billId,
    ],
  );

  return getBillById(db, billId);
}

/** Soft-delete a bill row by marking its deleted timestamp. */
export function deleteBill(db: SqliteDb, billId: SyncId): boolean {
  const existing = getBillById(db, billId);
  if (!existing) {
    return false;
  }

  execute(
    db,
    `UPDATE bill
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [billId],
  );

  return true;
}

/** Mark a bill as paid, updating its status and last paid date. */
export function markBillPaid(db: SqliteDb, billId: SyncId): Bill | null {
  return updateBill(db, billId, {
    status: 'PAID',
    lastPaidDate: new Date().toISOString().split('T')[0],
  });
}
