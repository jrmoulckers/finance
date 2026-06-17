// SPDX-License-Identifier: BUSL-1.1

import type { SqliteDb } from '../../db/sqlite-wasm';
import {
  BACKUP_PACKAGE_VERSION,
  type BackupEntityKey,
  type BackupEntityPreview,
  type BackupEntityRecord,
  type BackupKeyValueRecord,
  type BackupPackage,
  type BackupRestorePreview,
  type BackupRestoreResult,
} from '../../types/backup';

export { BACKUP_PACKAGE_VERSION } from '../../types/backup';

const APP_BACKUP_KEYS: readonly BackupEntityKey[] = [
  'users',
  'households',
  'householdMembers',
  'accounts',
  'categories',
  'budgets',
  'goals',
  'transactions',
  'recurringTemplates',
  'preferences',
  'settings',
  'consentRecords',
] as const;

type SqlEntityKey = Extract<
  BackupEntityKey,
  | 'users'
  | 'households'
  | 'householdMembers'
  | 'accounts'
  | 'categories'
  | 'budgets'
  | 'goals'
  | 'transactions'
>;

interface TableConfig {
  readonly entity: SqlEntityKey;
  readonly table: string;
  readonly columns: readonly string[];
}

const TABLES: readonly TableConfig[] = [
  {
    entity: 'users',
    table: 'user',
    columns: [
      'id',
      'email',
      'display_name',
      'avatar_url',
      'default_currency',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
  },
  {
    entity: 'households',
    table: 'household',
    columns: [
      'id',
      'name',
      'owner_id',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
  },
  {
    entity: 'householdMembers',
    table: 'household_member',
    columns: [
      'id',
      'household_id',
      'user_id',
      'role',
      'joined_at',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
  },
  {
    entity: 'accounts',
    table: 'account',
    columns: [
      'id',
      'household_id',
      'name',
      'type',
      'currency',
      'current_balance',
      'is_archived',
      'sort_order',
      'icon',
      'color',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
  },
  {
    entity: 'categories',
    table: 'category',
    columns: [
      'id',
      'household_id',
      'name',
      'icon',
      'color',
      'parent_id',
      'is_income',
      'is_system',
      'sort_order',
      'is_biometric_protected',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
  },
  {
    entity: 'budgets',
    table: 'budget',
    columns: [
      'id',
      'household_id',
      'category_id',
      'name',
      'amount',
      'currency',
      'period',
      'start_date',
      'end_date',
      'is_rollover',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
  },
  {
    entity: 'goals',
    table: 'goal',
    columns: [
      'id',
      'household_id',
      'name',
      'description',
      'target_amount',
      'current_amount',
      'currency',
      'target_date',
      'status',
      'icon',
      'color',
      'account_id',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
  },
  {
    entity: 'transactions',
    table: 'transaction',
    columns: [
      'id',
      'household_id',
      'account_id',
      'category_id',
      'type',
      'status',
      'amount',
      'currency',
      'payee',
      'note',
      'date',
      'transfer_account_id',
      'transfer_transaction_id',
      'is_recurring',
      'recurring_rule_id',
      'tags',
      'mood_tag',
      'merchant_address',
      'merchant_city',
      'merchant_state',
      'merchant_zip',
      'merchant_country',
      'external_reference_id',
      'statement_description',
      'custom_fields',
      'extra_notes',
      'counterparty_name',
      'counterparty_account_id',
      'created_at',
      'updated_at',
      'deleted_at',
      'sync_version',
      'is_synced',
    ],
  },
];

const TABLE_BY_ENTITY = new Map(TABLES.map((table) => [table.entity, table]));
const SQL_RESTORE_ORDER = TABLES.map((table) => table.entity);
const SQL_WIPE_ORDER: readonly string[] = [
  'goal_progress_contribution',
  'transaction',
  'budget',
  'goal',
  'category',
  'account',
  'household_member',
  'household',
  'user',
];

const LOCAL_STORAGE_ENTITIES = [
  'recurringTemplates',
  'preferences',
  'settings',
  'consentRecords',
] as const;

export interface BuildBackupPackageOptions {
  readonly appVersion?: string | null;
  readonly generatedAt?: Date;
}

export interface RestoreBackupOptions {
  readonly wipeLocalDataFirst?: boolean;
}

export function buildBackupPackage(
  db: SqliteDb,
  options: BuildBackupPackageOptions = {},
): BackupPackage {
  return {
    version: BACKUP_PACKAGE_VERSION,
    metadata: {
      generatedAt: (options.generatedAt ?? new Date()).toISOString(),
      appVersion: options.appVersion ?? null,
      source: 'web',
    },
    users: readSqlRecords(db, tableFor('users')),
    households: readSqlRecords(db, tableFor('households')),
    householdMembers: readSqlRecords(db, tableFor('householdMembers')),
    accounts: readSqlRecords(db, tableFor('accounts')),
    transactions: readSqlRecords(db, tableFor('transactions')),
    categories: readSqlRecords(db, tableFor('categories')),
    budgets: readSqlRecords(db, tableFor('budgets')),
    goals: readSqlRecords(db, tableFor('goals')),
    recurringTemplates: readLocalStorageRecords((key) => key.startsWith('finance-recurring-')),
    preferences: readLocalStorageRecords(
      (key) =>
        key.startsWith('finance-') && !isConsentKey(key) && !key.startsWith('finance-recurring-'),
    ),
    settings: readLocalStorageRecords(
      (key) => key.startsWith('settings-') || key.includes('display-settings'),
    ),
    consentRecords: readLocalStorageRecords(isConsentKey),
  };
}

export function serializeBackupPackage(pkg: BackupPackage): string {
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function parseBackupPackage(input: string): BackupPackage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw new Error(
      `Backup file is not valid JSON: ${error instanceof Error ? error.message : 'parse failed'}`,
      { cause: error },
    );
  }
  return validateBackupPackage(parsed);
}

export async function parseBackupFile(file: File): Promise<BackupPackage> {
  if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
    const text = extractJsonFromStoredZip(new Uint8Array(await file.arrayBuffer()));
    return parseBackupPackage(text);
  }
  return parseBackupPackage(await file.text());
}

export function validateBackupPackage(value: unknown): BackupPackage {
  if (!isRecord(value)) throw new Error('Backup package must be a JSON object.');
  if (value.version !== BACKUP_PACKAGE_VERSION) {
    throw new Error(
      `Unsupported backup version: ${String(value.version ?? 'missing')}. Expected ${BACKUP_PACKAGE_VERSION}.`,
    );
  }
  if (!isRecord(value.metadata) || typeof value.metadata.generatedAt !== 'string') {
    throw new Error('Backup package metadata.generatedAt is required.');
  }

  const pkg = value as Record<string, unknown>;
  for (const key of APP_BACKUP_KEYS) {
    if (pkg[key] !== undefined && !Array.isArray(pkg[key])) {
      throw new Error(`Backup package field ${key} must be an array.`);
    }
  }

  return {
    version: BACKUP_PACKAGE_VERSION,
    metadata: {
      generatedAt: value.metadata.generatedAt,
      appVersion: typeof value.metadata.appVersion === 'string' ? value.metadata.appVersion : null,
      source: 'web',
    },
    users: records(pkg.users),
    households: records(pkg.households),
    householdMembers: records(pkg.householdMembers),
    accounts: records(pkg.accounts),
    transactions: records(pkg.transactions),
    categories: records(pkg.categories),
    budgets: records(pkg.budgets),
    goals: records(pkg.goals),
    recurringTemplates: records(pkg.recurringTemplates),
    preferences: keyValueRecords(pkg.preferences),
    settings: keyValueRecords(pkg.settings),
    consentRecords: keyValueRecords(pkg.consentRecords),
  };
}

export function buildRestorePreview(
  db: SqliteDb,
  pkg: BackupPackage,
  options: RestoreBackupOptions = {},
): BackupRestorePreview {
  const wipe = options.wipeLocalDataFirst === true;
  return {
    version: pkg.version,
    wipeLocalDataFirst: wipe,
    entities: APP_BACKUP_KEYS.map((entity) => previewEntity(db, pkg, entity, wipe)),
  };
}

export function restoreBackupPackage(
  db: SqliteDb,
  pkg: BackupPackage,
  options: RestoreBackupOptions = {},
): BackupRestoreResult {
  const wipe = options.wipeLocalDataFirst === true;
  const preview = buildRestorePreview(db, pkg, options);

  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    if (wipe) wipeSqlData(db);
    for (const entity of SQL_RESTORE_ORDER) {
      restoreSqlEntity(db, entity, pkg[entity] as readonly BackupEntityRecord[], wipe);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  if (wipe) wipeLocalStorageData();
  for (const entity of LOCAL_STORAGE_ENTITIES) {
    restoreKeyValueRecords(pkg[entity] as readonly BackupKeyValueRecord[], wipe);
  }

  return { ...preview, restoredAt: new Date().toISOString() };
}

function previewEntity(
  db: SqliteDb,
  pkg: BackupPackage,
  entity: BackupEntityKey,
  wipe: boolean,
): BackupEntityPreview {
  const recordsForEntity = pkg[entity] as readonly (BackupEntityRecord | BackupKeyValueRecord)[];
  if (wipe || recordsForEntity.length === 0) {
    return {
      entity,
      total: recordsForEntity.length,
      imported: recordsForEntity.length,
      skippedDuplicates: 0,
    };
  }

  const duplicateCount = isLocalStorageEntity(entity)
    ? countDuplicateKeys(recordsForEntity as readonly BackupKeyValueRecord[])
    : countDuplicateIds(
        db,
        entity as SqlEntityKey,
        recordsForEntity as readonly BackupEntityRecord[],
      );
  return {
    entity,
    total: recordsForEntity.length,
    imported: recordsForEntity.length - duplicateCount,
    skippedDuplicates: duplicateCount,
  };
}

function restoreSqlEntity(
  db: SqliteDb,
  entity: SqlEntityKey,
  rows: readonly BackupEntityRecord[],
  wipe: boolean,
): void {
  const config = tableFor(entity);
  const existingIds = wipe ? new Set<string>() : getExistingSqlIds(db, config);
  for (const row of rows) {
    const id = recordId(row);
    if (!id || existingIds.has(id)) continue;
    insertSqlRecord(db, config, row);
    existingIds.add(id);
  }
}

function insertSqlRecord(db: SqliteDb, config: TableConfig, record: BackupEntityRecord): void {
  const columns = config.columns.filter((column) => getRecordValue(record, column) !== undefined);
  if (!columns.includes('id'))
    throw new Error(`Cannot restore ${config.entity}: record is missing id.`);
  const placeholders = columns.map(() => '?').join(', ');
  const quotedColumns = columns.map(quoteIdentifier).join(', ');
  db.exec(
    `INSERT INTO ${quoteIdentifier(config.table)} (${quotedColumns}) VALUES (${placeholders})`,
    columns.map((column) => normalizeSqlValue(getRecordValue(record, column))),
  );
}

function wipeSqlData(db: SqliteDb): void {
  for (const table of SQL_WIPE_ORDER) {
    try {
      db.exec(`DELETE FROM ${quoteIdentifier(table)}`);
    } catch {
      // Optional future tables may not exist in older local databases.
    }
  }
}

function wipeLocalStorageData(): void {
  try {
    for (const record of [
      ...readLocalStorageRecords((key) => key.startsWith('finance-recurring-')),
      ...readLocalStorageRecords(
        (key) =>
          key.startsWith('finance-') && !isConsentKey(key) && !key.startsWith('finance-recurring-'),
      ),
      ...readLocalStorageRecords(
        (key) => key.startsWith('settings-') || key.includes('display-settings'),
      ),
      ...readLocalStorageRecords(isConsentKey),
    ]) {
      localStorage.removeItem(record.key);
    }
  } catch {
    // Best-effort: restore can still proceed for SQLite data.
  }
}

function restoreKeyValueRecords(
  recordsToRestore: readonly BackupKeyValueRecord[],
  wipe: boolean,
): void {
  try {
    for (const record of recordsToRestore) {
      if (!wipe && localStorage.getItem(record.key) !== null) continue;
      if (record.value === null) localStorage.removeItem(record.key);
      else localStorage.setItem(record.key, record.value);
    }
  } catch {
    // Ignore storage quota/private-mode failures; SQL restore has already succeeded.
  }
}

function readSqlRecords(db: SqliteDb, config: TableConfig): BackupEntityRecord[] {
  try {
    return db.selectAll(
      `SELECT ${config.columns.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(config.table)} WHERE deleted_at IS NULL`,
    ) as BackupEntityRecord[];
  } catch {
    return [];
  }
}

function readLocalStorageRecords(predicate: (key: string) => boolean): BackupKeyValueRecord[] {
  try {
    const recordsToExport: BackupKeyValueRecord[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !predicate(key)) continue;
      recordsToExport.push({ key, value: localStorage.getItem(key) });
    }
    return recordsToExport.sort((a, b) => a.key.localeCompare(b.key));
  } catch {
    return [];
  }
}

function countDuplicateIds(
  db: SqliteDb,
  entity: SqlEntityKey,
  rows: readonly BackupEntityRecord[],
): number {
  const existingIds = getExistingSqlIds(db, tableFor(entity));
  return rows.filter((row) => {
    const id = recordId(row);
    return id ? existingIds.has(id) : false;
  }).length;
}

function countDuplicateKeys(rows: readonly BackupKeyValueRecord[]): number {
  try {
    return rows.filter((row) => localStorage.getItem(row.key) !== null).length;
  } catch {
    return 0;
  }
}

function getExistingSqlIds(db: SqliteDb, config: TableConfig): Set<string> {
  try {
    return new Set(
      db
        .selectAll(`SELECT id FROM ${quoteIdentifier(config.table)} WHERE deleted_at IS NULL`)
        .map((row) => String(row.id)),
    );
  } catch {
    return new Set();
  }
}

function isLocalStorageEntity(
  entity: BackupEntityKey,
): entity is (typeof LOCAL_STORAGE_ENTITIES)[number] {
  return (LOCAL_STORAGE_ENTITIES as readonly BackupEntityKey[]).includes(entity);
}

function tableFor(entity: SqlEntityKey): TableConfig {
  const table = TABLE_BY_ENTITY.get(entity);
  if (!table) throw new Error(`No table mapping for backup entity ${entity}.`);
  return table;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function getRecordValue(record: BackupEntityRecord, column: string): unknown {
  if (column in record) return record[column];
  const camelKey = column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  return record[camelKey];
}

function normalizeSqlValue(value: unknown): unknown {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

function recordId(record: BackupEntityRecord): string | null {
  return typeof record.id === 'string' && record.id.length > 0 ? record.id : null;
}

function records(value: unknown): BackupEntityRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function keyValueRecords(value: unknown): BackupKeyValueRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((record): BackupKeyValueRecord[] => {
    if (!isRecord(record) || typeof record.key !== 'string') return [];
    return [{ key: record.key, value: record.value == null ? null : String(record.value) }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isConsentKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes('consent') || lower.includes('gdpr');
}

function extractJsonFromStoredZip(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  const candidates: string[] = [];

  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compression = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));

    if (compression === 0 && dataEnd <= bytes.length && name.toLowerCase().endsWith('.json')) {
      candidates.push(decoder.decode(bytes.slice(dataStart, dataEnd)));
    }
    offset = dataEnd;
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (isRecord(parsed) && parsed.version === BACKUP_PACKAGE_VERSION) return candidate;
    } catch {
      // Keep looking for a canonical JSON member.
    }
  }
  throw new Error('ZIP backup does not contain an uncompressed canonical backup JSON file.');
}
