// SPDX-License-Identifier: BUSL-1.1

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SqliteDb } from '../../db/sqlite-wasm';
import {
  BACKUP_PACKAGE_VERSION,
  buildBackupPackage,
  buildRestorePreview,
  parseBackupPackage,
  restoreBackupPackage,
  serializeBackupPackage,
} from './backup-package';

function createMockDb(initialRows: Record<string, Array<Record<string, unknown>>>): SqliteDb {
  const rows = new Map(
    Object.entries(initialRows).map(([table, tableRows]) => [table, [...tableRows]]),
  );
  return {
    selectAll: vi.fn((sql: string) => {
      const tableMatch = /FROM\s+"([^"]+)"/i.exec(sql);
      const table = tableMatch?.[1];
      if (!table) return [];
      const tableRows = rows.get(table) ?? [];
      if (/SELECT\s+id\s+FROM/i.test(sql)) return tableRows.map((row) => ({ id: row.id }));
      return tableRows.filter((row) => row.deleted_at == null);
    }),
    selectOne: vi.fn(() => null),
    exec: vi.fn((sql: string, params?: unknown[]) => {
      if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(sql)) return;
      const deleteMatch = /^DELETE FROM "([^"]+)"/i.exec(sql);
      if (deleteMatch) {
        rows.set(deleteMatch[1], []);
        return;
      }
      const insertMatch = /^INSERT INTO "([^"]+)" \((.+)\) VALUES/i.exec(sql);
      if (!insertMatch) return;
      const table = insertMatch[1];
      const columns = [...insertMatch[2].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
      const row = Object.fromEntries(columns.map((column, index) => [column, params?.[index]]));
      rows.set(table, [...(rows.get(table) ?? []), row]);
    }),
    close: vi.fn(async () => undefined),
  } as unknown as SqliteDb;
}

describe('backup-package', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('serializes and deserializes the canonical versioned package', () => {
    const db = createMockDb({
      user: [{ id: 'user-1', email: 'demo@example.com', deleted_at: null }],
      household: [{ id: 'hh-1', name: 'Home', owner_id: 'user-1', deleted_at: null }],
      household_member: [],
      account: [{ id: 'acc-1', household_id: 'hh-1', name: 'Checking', deleted_at: null }],
      category: [{ id: 'cat-1', household_id: 'hh-1', name: 'Food', deleted_at: null }],
      budget: [{ id: 'budget-1', household_id: 'hh-1', category_id: 'cat-1', deleted_at: null }],
      goal: [{ id: 'goal-1', household_id: 'hh-1', name: 'Emergency', deleted_at: null }],
      transaction: [{ id: 'txn-1', household_id: 'hh-1', account_id: 'acc-1', deleted_at: null }],
    });
    localStorage.setItem('finance-gdpr-consent', '{"essential":true}');
    localStorage.setItem('finance-recurring-rent', '{"id":"rent"}');

    const pkg = buildBackupPackage(db, {
      appVersion: '0.1.0',
      generatedAt: new Date('2026-05-26T12:00:00Z'),
    });
    const parsed = parseBackupPackage(serializeBackupPackage(pkg));

    expect(parsed.version).toBe(BACKUP_PACKAGE_VERSION);
    expect(parsed.metadata.generatedAt).toBe('2026-05-26T12:00:00.000Z');
    expect(parsed.accounts).toEqual([
      { id: 'acc-1', household_id: 'hh-1', name: 'Checking', deleted_at: null },
    ]);
    expect(parsed.consentRecords).toEqual([
      { key: 'finance-gdpr-consent', value: '{"essential":true}' },
    ]);
    expect(parsed.recurringTemplates).toHaveLength(1);
  });

  it('rejects missing or unsupported backup versions', () => {
    expect(() => parseBackupPackage('{"accounts":[]}')).toThrow(/Unsupported backup version/);
    expect(() => parseBackupPackage('{"version":999,"metadata":{"generatedAt":"now"}}')).toThrow(
      /Unsupported backup version/,
    );
  });

  it('previews duplicate ids and local-storage keys before restore', () => {
    const db = createMockDb({
      user: [],
      household: [],
      household_member: [],
      account: [{ id: 'acc-1', deleted_at: null }],
      category: [],
      budget: [],
      goal: [],
      transaction: [],
    });
    localStorage.setItem('finance-gdpr-consent', 'old');

    const pkg = parseBackupPackage(
      JSON.stringify({
        version: 1,
        metadata: { generatedAt: '2026-05-26T12:00:00.000Z' },
        accounts: [{ id: 'acc-1' }, { id: 'acc-2' }],
        consentRecords: [{ key: 'finance-gdpr-consent', value: 'new' }],
      }),
    );

    const preview = buildRestorePreview(db, pkg);
    expect(preview.entities.find((entity) => entity.entity === 'accounts')).toMatchObject({
      total: 2,
      imported: 1,
      skippedDuplicates: 1,
    });
    expect(preview.entities.find((entity) => entity.entity === 'consentRecords')).toMatchObject({
      total: 1,
      imported: 0,
      skippedDuplicates: 1,
    });
  });

  it('restores non-duplicate rows and supports clean restore wipes', () => {
    const db = createMockDb({
      user: [],
      household: [],
      household_member: [],
      account: [{ id: 'acc-existing', deleted_at: null }],
      category: [],
      budget: [],
      goal: [],
      transaction: [],
    });
    const pkg = parseBackupPackage(
      JSON.stringify({
        version: 1,
        metadata: { generatedAt: '2026-05-26T12:00:00.000Z' },
        accounts: [{ id: 'acc-1', household_id: 'hh-1', deleted_at: null }],
        preferences: [{ key: 'finance-pref', value: 'on' }],
      }),
    );

    const result = restoreBackupPackage(db, pkg, { wipeLocalDataFirst: true });

    expect(result.entities.find((entity) => entity.entity === 'accounts')).toMatchObject({
      imported: 1,
      skippedDuplicates: 0,
    });
    expect(db.exec).toHaveBeenCalledWith(expect.stringMatching(/^DELETE FROM "account"/));
    expect(db.exec).toHaveBeenCalledWith(expect.stringMatching(/^INSERT INTO "account"/), [
      'acc-1',
      'hh-1',
      null,
    ]);
    expect(localStorage.getItem('finance-pref')).toBe('on');
  });
});
