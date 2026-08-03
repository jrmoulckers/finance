// SPDX-License-Identifier: BUSL-1.1

/**
 * Household data repository — encrypted SQLite persistence for every household
 * collection (issue #3378).
 *
 * The household feature previously persisted household, members, invitations,
 * account sharing, shared budgets/goals, expenses, settlements, children,
 * activity, recurring bills, goal pledges, shopping budgets and reconciliation
 * data to plaintext `localStorage`. That data never synced to a partner's
 * device, never survived a cache clear, and was not encrypted — a serious
 * privacy issue for financial data.
 *
 * This module moves all of it into the encrypted SQLite/OPFS database (the same
 * at-rest-encrypted, sync-metadata-carrying store used by goals and budgets).
 * Each collection is stored in a `hh_`-prefixed "document" table: the queryable
 * and sync columns (`id`, `household_id`, timestamps, `sync_version`,
 * `is_synced`) are promoted while the full entity — including nested aggregates
 * such as a child's chores or a reconciliation plan's obligations — is stored as
 * JSON in `data`. This mirrors the existing JSON-column pattern (transaction
 * splits) and keeps the persisted shape a faithful, loss-free round-trip of the
 * hook's in-memory model.
 *
 * The public API intentionally matches the previous `localStorage` helpers
 * (`readHouseholdValue` / `writeHouseholdValue`, keyed by the same string keys)
 * so the consuming hook only swaps its storage backend, not its logic.
 *
 * References: issues #3378, #1780, #1781, #1784, #1786
 */

import {
  beginSavepoint,
  execute,
  query,
  queryOne,
  releaseSavepoint,
  rollbackToSavepoint,
  type AsyncDb,
  type Row,
} from '../async-db';

// ---------------------------------------------------------------------------
// Storage-key → table mapping
// ---------------------------------------------------------------------------

/** Storage key for the single household record (stored as one row). */
export const HOUSEHOLD_SINGLETON_KEY = 'finance-household';

/** Storage key for the household member collection. */
export const HOUSEHOLD_MEMBERS_KEY = 'finance-household-members';

/**
 * Maps each household storage key to its backing `hh_` table. Keys mirror the
 * legacy `localStorage` keys exactly so the hook can swap backends transparently.
 */
const TABLE_BY_KEY: Readonly<Record<string, string>> = {
  'finance-household': 'hh_household',
  'finance-household-members': 'hh_member',
  'finance-household-invitations': 'hh_invitation',
  'finance-account-sharings': 'hh_account_sharing',
  'finance-shared-budgets': 'hh_shared_budget',
  'finance-shared-goals': 'hh_shared_goal',
  'finance-household-shared-expenses': 'hh_shared_expense',
  'finance-household-shared-settlements': 'hh_shared_settlement',
  'finance-household-children': 'hh_child',
  'finance-household-activity-events': 'hh_activity_event',
  'finance-household-recurring-bills': 'hh_recurring_bill',
  'finance-household-goal-pledges': 'hh_goal_pledge',
  'finance-household-shopping-budgets': 'hh_shopping_budget',
  'finance-household-reconciliation-plans': 'hh_reconciliation_plan',
  'finance-household-reconciliation-snapshots': 'hh_reconciliation_snapshot',
};

function tableForKey(key: string): string {
  const table = TABLE_BY_KEY[key];
  if (!table) {
    throw new Error(`Unknown household storage key: ${key}`);
  }
  return table;
}

// ---------------------------------------------------------------------------
// Row (de)serialization
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function optionalIsoString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

interface DocumentColumns {
  id: string;
  householdId: string;
  data: string;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  syncVersion: number;
  isSynced: number;
}

/** Derive the promoted sync/query columns from an entity, with safe fallbacks. */
function toDocumentColumns(
  entity: unknown,
  index: number,
  fallbackHouseholdId: string,
  nowIso: string,
): DocumentColumns {
  const record = asRecord(entity);
  const id = typeof record.id === 'string' && record.id.length > 0 ? record.id : `row-${index}`;
  const householdId =
    typeof record.householdId === 'string' && record.householdId.length > 0
      ? record.householdId
      : fallbackHouseholdId;
  const syncVersion = typeof record.syncVersion === 'number' ? record.syncVersion : 0;
  const isSynced = record.isSynced === true || record.isSynced === 1;

  return {
    id,
    householdId,
    data: JSON.stringify(entity),
    createdAt: optionalIsoString(record.createdAt) ?? nowIso,
    updatedAt: optionalIsoString(record.updatedAt) ?? nowIso,
    deletedAt: optionalIsoString(record.deletedAt),
    syncVersion,
    isSynced: isSynced ? 1 : 0,
  };
}

function parseRows<T>(rows: Row[]): T[] {
  const parsed: T[] = [];
  for (const row of rows) {
    const raw = row.data;
    if (typeof raw !== 'string') {
      continue;
    }
    try {
      parsed.push(JSON.parse(raw) as T);
    } catch {
      // Skip corrupt rows rather than failing the entire load.
    }
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function readCollection<T>(db: AsyncDb, table: string): Promise<T[]> {
  const result = await query<Row>(db, `SELECT data FROM ${table} ORDER BY rowid ASC`);
  return parseRows<T>(result.rows);
}

async function readSingleton<T>(db: AsyncDb, table: string): Promise<T | null> {
  const row = await queryOne<Row>(db, `SELECT data FROM ${table} ORDER BY rowid ASC LIMIT 1`);
  if (!row || typeof row.data !== 'string') {
    return null;
  }
  try {
    return JSON.parse(row.data) as T;
  } catch {
    return null;
  }
}

/** Look up the id of the persisted household, used as a fallback owner scope. */
async function currentHouseholdId(db: AsyncDb): Promise<string> {
  const household = await readSingleton<{ id?: unknown }>(db, 'hh_household');
  return household && typeof household.id === 'string' ? household.id : 'local';
}

/**
 * Read a household value by its storage key. Returns `fallback` when nothing is
 * persisted yet (an empty array for collections, `null` for the singleton).
 */
export async function readHouseholdValue<T>(db: AsyncDb, key: string, fallback: T): Promise<T> {
  const table = tableForKey(key);
  if (key === HOUSEHOLD_SINGLETON_KEY) {
    const value = await readSingleton<T>(db, table);
    return value ?? fallback;
  }
  const rows = await readCollection<unknown>(db, table);
  return rows as unknown as T;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

const INSERT_COLUMNS =
  '("id","household_id","data","created_at","updated_at","deleted_at","sync_version","is_synced")';

async function insertDocument(db: AsyncDb, table: string, columns: DocumentColumns): Promise<void> {
  await execute(db, `INSERT INTO ${table} ${INSERT_COLUMNS} VALUES (?, ?, ?, ?, ?, ?, ?, ?);`, [
    columns.id,
    columns.householdId,
    columns.data,
    columns.createdAt,
    columns.updatedAt,
    columns.deletedAt,
    columns.syncVersion,
    columns.isSynced,
  ]);
}

/**
 * Persist a household value by its storage key.
 *
 * The device holds exactly one household, so each write fully replaces the
 * table contents (delete-then-insert) inside a savepoint. This preserves array
 * order and faithfully round-trips soft-deleted tombstones, exactly matching the
 * previous "serialize the whole array" `localStorage` semantics — now durable,
 * encrypted, and sync-ready.
 */
export async function writeHouseholdValue<T>(db: AsyncDb, key: string, value: T): Promise<void> {
  const table = tableForKey(key);
  const nowIso = new Date().toISOString();
  const savepointName = 'hh_write_collection';

  await beginSavepoint(db, savepointName);
  try {
    await execute(db, `DELETE FROM ${table};`);

    if (key === HOUSEHOLD_SINGLETON_KEY) {
      if (value !== null && value !== undefined) {
        const record = asRecord(value);
        const householdId = typeof record.id === 'string' ? record.id : 'local';
        await insertDocument(db, table, toDocumentColumns(value, 0, householdId, nowIso));
      }
    } else if (Array.isArray(value)) {
      const fallbackHouseholdId = await currentHouseholdId(db);
      for (const [index, entity] of value.entries()) {
        await insertDocument(
          db,
          table,
          toDocumentColumns(entity, index, fallbackHouseholdId, nowIso),
        );
      }
    }

    await releaseSavepoint(db, savepointName);
  } catch (writeError) {
    try {
      await rollbackToSavepoint(db, savepointName);
      await releaseSavepoint(db, savepointName);
    } catch {
      // Preserve the original write error if SQLite already ended the savepoint.
    }
    throw writeError;
  }
}
