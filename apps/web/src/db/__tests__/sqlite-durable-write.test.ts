// SPDX-License-Identifier: BUSL-1.1

import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { afterEach, expect, it, vi } from 'vitest';
import { createSqliteAsyncDb } from '../async-db';
import { clearSqliteAtRestEncryptionStores } from '../sqlite-at-rest-encryption';
import { _createDbWrapperForTesting, __sqliteIndexedDbPersistenceForTesting } from '../sqlite-wasm';

const require = createRequire(import.meta.url);
const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });

afterEach(async () => {
  localStorage.removeItem('finance.sqliteAtRestEncryption.enabled');
  await clearSqliteAtRestEncryptionStores();
});

it('does not acknowledge an async write before its encrypted snapshot is durable', async () => {
  localStorage.setItem('finance.sqliteAtRestEncryption.enabled', 'true');
  const raw = new SQL.Database();
  raw.run('CREATE TABLE synthetic_records (id INTEGER PRIMARY KEY, label TEXT)');
  const db = createSqliteAsyncDb(_createDbWrapperForTesting(SQL, raw));
  try {
    await db.execute('INSERT INTO synthetic_records VALUES (?, ?)', [1, 'Synthetic record']);
    const bytes = await __sqliteIndexedDbPersistenceForTesting.loadFromIndexedDB('finance.db');
    expect(bytes, 'Acknowledged write must already exist in persistent storage').not.toBeNull();
    if (!bytes) throw new Error('Missing durable synthetic snapshot');
    const reopened = new SQL.Database(new Uint8Array(bytes));
    try {
      expect(reopened.exec('SELECT label FROM synthetic_records')[0]?.values).toEqual([
        ['Synthetic record'],
      ]);
    } finally {
      reopened.close();
    }
  } finally {
    await db.close();
  }
});

it('serializes overlapping encrypted snapshots and retains the latest SQLite write', async () => {
  localStorage.setItem('finance.sqliteAtRestEncryption.enabled', 'true');
  const raw = new SQL.Database();
  raw.run('CREATE TABLE synthetic_records (id INTEGER PRIMARY KEY, label TEXT)');
  const db = createSqliteAsyncDb(_createDbWrapperForTesting(SQL, raw));
  try {
    await Promise.all([
      db.execute('INSERT INTO synthetic_records VALUES (?, ?)', [1, 'Synthetic first']),
      db.execute('INSERT INTO synthetic_records VALUES (?, ?)', [2, 'Synthetic second']),
      db.execute('UPDATE synthetic_records SET label = ? WHERE id = ?', ['Synthetic final', 1]),
    ]);
    const bytes = await __sqliteIndexedDbPersistenceForTesting.loadFromIndexedDB('finance.db');
    if (!bytes) throw new Error('Missing durable synthetic snapshot');
    const reopened = new SQL.Database(new Uint8Array(bytes));
    try {
      expect(reopened.exec('SELECT label FROM synthetic_records ORDER BY id')[0]?.values).toEqual([
        ['Synthetic final'],
        ['Synthetic second'],
      ]);
    } finally {
      reopened.close();
    }
  } finally {
    await db.close();
  }
});

it('rejects a failed persistence attempt and lets a later snapshot retry', async () => {
  localStorage.setItem('finance.sqliteAtRestEncryption.enabled', 'true');
  const raw = new SQL.Database();
  raw.run('CREATE TABLE synthetic_records (id INTEGER PRIMARY KEY, label TEXT)');
  const db = createSqliteAsyncDb(_createDbWrapperForTesting(SQL, raw));
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
    throw new DOMException('Synthetic storage failure', 'QuotaExceededError');
  });
  try {
    await expect(
      db.execute('INSERT INTO synthetic_records VALUES (?, ?)', [1, 'Synthetic retry']),
    ).rejects.toThrow('Synthetic storage failure');
    expect(log).toHaveBeenCalledWith('[db] Local snapshot persistence failed.');
    open.mockRestore();
    await db.execute('UPDATE synthetic_records SET label = ? WHERE id = ?', [
      'Synthetic recovered',
      1,
    ]);
    const bytes = await __sqliteIndexedDbPersistenceForTesting.loadFromIndexedDB('finance.db');
    if (!bytes) throw new Error('Missing durable synthetic snapshot');
    const reopened = new SQL.Database(new Uint8Array(bytes));
    try {
      expect(reopened.exec('SELECT label FROM synthetic_records')[0]?.values).toEqual([
        ['Synthetic recovered'],
      ]);
    } finally {
      reopened.close();
    }
  } finally {
    open.mockRestore();
    log.mockRestore();
    await db.close();
  }
});
