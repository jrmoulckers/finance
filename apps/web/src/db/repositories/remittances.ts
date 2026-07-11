// SPDX-License-Identifier: BUSL-1.1

/**
 * Remittance persistence repository (issue #3273).
 *
 * Durable, encrypted storage for the cross-border remittance history. Replaces
 * the previous `localStorage` store so records survive a browser-cache clear and
 * ride the SQLite-WASM (OPFS) + sync path used by accounts/transactions — no
 * plaintext financial data on disk.
 *
 * All FX/fee math and aggregation stays in the pure `lib/remittance` module; the
 * repository only reads and writes fully-formed {@link RemittanceRecord}s. Money
 * is stored in integer minor units and FX rates as reals.
 */

import type {
  RemittanceFeeModel,
  RemittanceFrequency,
  RemittanceRecord,
} from '../../lib/remittance';
import { execute, query, queryOne, type Row, type SqliteDb } from '../sqlite-wasm';
import { getPrimaryHouseholdId } from './household';
import { SQLITE_NOW_EXPRESSION, optionalString, requireNumber, requireString } from './helpers';

/** localStorage key the pre-#3273 remittance store wrote to. */
const LEGACY_REMITTANCES_STORAGE_KEY = 'finance-remittances';

const REMITTANCE_COLUMNS = [
  'id',
  'household_id',
  'date',
  'source_currency',
  'dest_currency',
  'send_amount_minor',
  'fee_minor',
  'fx_rate',
  'fee_model',
  'reference_rate',
  'recipient_name',
  'recipient_country',
  'note',
  'recurrence_frequency',
  'recurrence_next_date',
  'created_at',
  'updated_at',
  'deleted_at',
  'sync_version',
  'is_synced',
].join(', ');

const REMITTANCE_BASE_QUERY = `SELECT ${REMITTANCE_COLUMNS} FROM remittance WHERE deleted_at IS NULL`;

/** Map a database row to the {@link RemittanceRecord} domain shape. */
function mapRemittance(row: Row): RemittanceRecord {
  return {
    id: requireString(row.id, 'remittance.id'),
    date: requireString(row.date, 'remittance.date'),
    sourceCurrency: requireString(row.source_currency, 'remittance.source_currency'),
    destCurrency: requireString(row.dest_currency, 'remittance.dest_currency'),
    sendAmountMinor: requireNumber(row.send_amount_minor, 'remittance.send_amount_minor'),
    feeMinor: requireNumber(row.fee_minor, 'remittance.fee_minor'),
    fxRate: requireNumber(row.fx_rate, 'remittance.fx_rate'),
    feeModel: requireString(row.fee_model, 'remittance.fee_model') as RemittanceFeeModel,
    referenceRate:
      row.reference_rate == null
        ? null
        : requireNumber(row.reference_rate, 'remittance.reference_rate'),
    recipient: {
      name: requireString(row.recipient_name, 'remittance.recipient_name'),
      country: requireString(row.recipient_country, 'remittance.recipient_country'),
    },
    note: optionalString(row.note),
    recurrence: mapRecurrence(row),
    createdAt: requireString(row.created_at, 'remittance.created_at'),
  };
}

/** Reconstruct the recurrence schedule from its two persisted columns, or null. */
function mapRecurrence(row: Row): RemittanceRecord['recurrence'] {
  const frequency = optionalString(row.recurrence_frequency);
  const nextDate = optionalString(row.recurrence_next_date);
  if (!frequency || !nextDate) {
    return null;
  }
  return { frequency: frequency as RemittanceFrequency, nextDate };
}

/** Return all non-deleted remittances, most recent send date first. */
export function getAllRemittances(db: SqliteDb): RemittanceRecord[] {
  return query<Row>(
    db,
    `${REMITTANCE_BASE_QUERY} ORDER BY date DESC, created_at DESC, id DESC`,
  ).rows.map(mapRemittance);
}

/** Find a single non-deleted remittance by its identifier. */
export function getRemittanceById(db: SqliteDb, remittanceId: string): RemittanceRecord | null {
  const row = queryOne<Row>(db, `${REMITTANCE_BASE_QUERY} AND id = ?`, [remittanceId]);
  return row ? mapRemittance(row) : null;
}

/**
 * Insert a fully-formed remittance and return the persisted record.
 *
 * The record's own `createdAt` is preserved (the hook is the source of truth for
 * it). `household_id` is resolved to the primary household when one exists so the
 * record is scoped for sync/RLS; it stays null in a clean-slate workspace.
 */
export function insertRemittance(db: SqliteDb, record: RemittanceRecord): RemittanceRecord {
  const householdId = getPrimaryHouseholdId(db);

  execute(
    db,
    `INSERT INTO remittance (
      id,
      household_id,
      date,
      source_currency,
      dest_currency,
      send_amount_minor,
      fee_minor,
      fx_rate,
      fee_model,
      reference_rate,
      recipient_name,
      recipient_country,
      note,
      recurrence_frequency,
      recurrence_next_date,
      created_at,
      updated_at,
      deleted_at,
      sync_version,
      is_synced
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      NULL,
      1,
      0
    )`,
    [
      record.id,
      householdId,
      record.date,
      record.sourceCurrency,
      record.destCurrency,
      record.sendAmountMinor,
      record.feeMinor,
      record.fxRate,
      record.feeModel,
      record.referenceRate,
      record.recipient.name,
      record.recipient.country,
      record.note,
      record.recurrence?.frequency ?? null,
      record.recurrence?.nextDate ?? null,
      record.createdAt,
      record.createdAt,
    ],
  );

  const created = getRemittanceById(db, record.id);
  if (!created) {
    throw new Error('Failed to persist remittance.');
  }
  return created;
}

/** Soft-delete a remittance by marking its deleted timestamp. */
export function deleteRemittanceRecord(db: SqliteDb, remittanceId: string): boolean {
  const existing = getRemittanceById(db, remittanceId);
  if (!existing) {
    return false;
  }

  execute(
    db,
    `UPDATE remittance
        SET deleted_at = ${SQLITE_NOW_EXPRESSION},
            updated_at = ${SQLITE_NOW_EXPRESSION},
            sync_version = 1,
            is_synced = 0
      WHERE id = ?
        AND deleted_at IS NULL`,
    [remittanceId],
  );

  return true;
}

/** Narrow an unknown legacy localStorage entry to a remittance-like record. */
function isLegacyRemittance(value: unknown): value is RemittanceRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<RemittanceRecord>;
  return (
    typeof record.id === 'string' &&
    typeof record.date === 'string' &&
    typeof record.sourceCurrency === 'string' &&
    typeof record.destCurrency === 'string' &&
    typeof record.sendAmountMinor === 'number' &&
    typeof record.feeMinor === 'number' &&
    typeof record.fxRate === 'number' &&
    typeof record.feeModel === 'string' &&
    typeof record.recipient === 'object' &&
    record.recipient !== null &&
    typeof record.recipient.name === 'string' &&
    typeof record.recipient.country === 'string'
  );
}

/** Coerce a legacy record into a complete {@link RemittanceRecord}. */
function normalizeLegacyRemittance(entry: RemittanceRecord): RemittanceRecord {
  return {
    ...entry,
    referenceRate: entry.referenceRate ?? null,
    note: entry.note ?? null,
    recurrence: entry.recurrence ?? null,
    createdAt: entry.createdAt || new Date().toISOString(),
  };
}

/**
 * One-time migration of any remittances left in the pre-#3273 `localStorage`
 * store into the database, then clear the legacy key so it is never read again.
 *
 * Best-effort and idempotent: the key is removed before importing so concurrent
 * hook instances cannot double-import, and records whose id already exists are
 * skipped. Returns the number of records imported.
 */
export function importLegacyRemittances(db: SqliteDb): number {
  let raw: string | null;
  try {
    raw = globalThis.localStorage?.getItem(LEGACY_REMITTANCES_STORAGE_KEY) ?? null;
  } catch {
    return 0;
  }
  if (!raw) return 0;

  // Remove first so a second concurrent caller sees nothing to import.
  try {
    globalThis.localStorage?.removeItem(LEGACY_REMITTANCES_STORAGE_KEY);
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
    if (!isLegacyRemittance(entry)) continue;
    try {
      if (getRemittanceById(db, entry.id)) continue;
      insertRemittance(db, normalizeLegacyRemittance(entry));
      imported += 1;
    } catch {
      // Best-effort per record — a single bad row must not abort the migration.
    }
  }
  return imported;
}
