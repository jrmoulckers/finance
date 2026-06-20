// SPDX-License-Identifier: BUSL-1.1

import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { describe, expect, it, vi } from 'vitest';
import { seedDatabase } from '../seed';
import {
  MIGRATIONS,
  _createDbWrapperForTesting,
  _runMigrationsForTesting,
  _shouldPersistIndexedDbAfterExecForTesting,
  releaseSavepoint,
  rollbackToSavepoint,
  type SqliteDb,
} from '../sqlite-wasm';

const require = createRequire(import.meta.url);
const sqlWasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
const SQL = await initSqlJs({
  locateFile: () => sqlWasmPath,
});

describe('sqlite-wasm savepoint migrations', () => {
  it('converges schema when migration runner is invoked concurrently', async () => {
    const db = new SQL.Database();

    try {
      await expect(
        Promise.all([
          _runMigrationsForTesting(SQL, db, 'indexeddb'),
          _runMigrationsForTesting(SQL, db, 'indexeddb'),
        ]),
      ).resolves.toHaveLength(2);

      const appliedMigrations = db.exec(
        'SELECT version, label FROM _migrations ORDER BY version ASC;',
      )[0];
      expect(appliedMigrations?.values).toHaveLength(MIGRATIONS.length);
      expect(appliedMigrations?.values.map(([version]) => version)).toEqual(
        MIGRATIONS.map((migration) => migration.version),
      );

      const schemaTables = db.exec(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('_migrations', 'account', 'transaction') ORDER BY name ASC;",
      )[0];
      expect(schemaTables?.values.map(([name]) => name)).toEqual([
        '_migrations',
        'account',
        'transaction',
      ]);
    } finally {
      db.close();
    }
  });

  it('defers IndexedDB persistence while savepoints are active', () => {
    expect(
      _shouldPersistIndexedDbAfterExecForTesting([
        'SAVEPOINT seed_init',
        'INSERT INTO account (id) VALUES (?)',
        'UPDATE account SET name = ? WHERE id = ?',
        'ROLLBACK TO SAVEPOINT seed_init',
        'RELEASE SAVEPOINT seed_init',
        'INSERT INTO account (id) VALUES (?)',
      ]),
    ).toEqual([false, false, false, false, true, true]);
  });

  it('waits for the outer transaction before persisting nested savepoints', () => {
    expect(
      _shouldPersistIndexedDbAfterExecForTesting([
        'BEGIN TRANSACTION',
        'INSERT INTO account (id) VALUES (?)',
        'SAVEPOINT inner_write',
        'INSERT INTO category (id) VALUES (?)',
        'RELEASE SAVEPOINT inner_write',
        'COMMIT',
      ]),
    ).toEqual([false, false, false, false, false, true]);
  });

  it('seeds demo data through the IndexedDB wrapper without losing seed savepoint', async () => {
    const db = new SQL.Database();

    try {
      await _runMigrationsForTesting(SQL, db, 'indexeddb');
      const wrapper = _createDbWrapperForTesting(SQL, db, 'indexeddb');

      await expect(seedDatabase(wrapper)).resolves.toBeUndefined();

      const accountCount = wrapper.selectOne('SELECT COUNT(*) AS count FROM account;');
      const transactionCount = wrapper.selectOne('SELECT COUNT(*) AS count FROM "transaction";');

      expect(Number(accountCount?.count ?? 0)).toBeGreaterThan(0);
      expect(Number(transactionCount?.count ?? 0)).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it.each([
    ['release', releaseSavepoint],
    ['rollback', rollbackToSavepoint],
  ] as const)('logs and suppresses no-active-transaction %s failures', (_, helper) => {
    const db: SqliteDb = {
      backend: 'opfs',
      exec: vi.fn(() => {
        throw new Error('cannot commit - no transaction is active');
      }),
      selectAll: vi.fn(),
      selectOne: vi.fn(),
      close: vi.fn(),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      expect(() => helper(db, 'seed_init')).not.toThrow();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('seed_init'), {
        backend: 'opfs',
        savepointName: 'seed_init',
        error: expect.any(Error),
      });
    } finally {
      warn.mockRestore();
    }
  });
});
