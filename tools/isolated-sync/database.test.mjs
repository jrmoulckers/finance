// Mocked SQL contracts only. Usage: node --test tools/isolated-sync/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, git, read } from './fixtures.mjs';
import { materialize } from './files.mjs';
import { installAdapter, migrate, publication, verifyHistory } from './database.mjs';

const history = [
  { version: '20260306000001', name: 'initial_schema', statements: ['SELECT 1'] },
  { version: '20260908000002', name: 'durable_bank_revocation', statements: ['SELECT 1'] },
];
const historyManifest = (manifest) => ({
  ...manifest,
  sourceFiles: {
    'services/api/supabase/migrations/20260306000001_initial_schema.sql': 'synthetic-source-hash',
    'services/api/supabase/migrations/20260908000002_durable_bank_revocation.sql':
      'synthetic-source-hash',
  },
});

test('history checks exact version, name and statements; no history repair is issued', () => {
  const f = fixture();
  try {
    const manifest = historyManifest(f.manifest);
    const historyHash = verifyHistory({ manifest, sql: () => JSON.stringify(history) });
    for (const invalid of [
      history.slice(1),
      [...history, history[0]],
      history.map((row, i) => (i ? row : { ...row, statements: [] })),
      history.map((row, i) => (i ? row : { ...row, name: 'wrong_name' })),
      [...history].reverse(),
    ]) {
      assert.throws(
        () => verifyHistory({ manifest, sql: () => JSON.stringify(invalid) }),
        /mismatch/,
      );
    }
    assert.throws(
      () =>
        verifyHistory({
          manifest,
          historyHash,
          sql: () =>
            JSON.stringify(
              history.map((row, i) => (i ? row : { ...row, statements: ['SELECT 2'] })),
            ),
        }),
      /SHA256 changed/,
    );
    const calls = [];
    assert.throws(
      () =>
        migrate({
          manifest: historyManifest(f.manifest),
          directory: f.directory,
          cli: 'synthetic-cli',
          compose: (...args) => calls.push(args),
          wait: () => {},
          sql: () => '',
          executeCli: () => {
            throw new Error('synthetic migration failure');
          },
        }),
      /migration failure/,
    );
    assert.equal(calls.length, 1);
    assert.ok(calls[0][1].includes('auth-migrate'));
    assert.equal(calls[0][1].includes('auth'), false);
  } finally {
    f.cleanup();
  }
});

test('adapter regression precedes atomic installation; a failed assertion never opens Auth', () => {
  const f = fixture();
  try {
    materialize(f.options);
    const calls = [];
    const operations = [];
    assert.throws(
      () =>
        installAdapter({
          directory: f.directory,
          manifest: historyManifest(f.manifest),
          sql: (sql, operation) => {
            calls.push(sql);
            operations.push(operation);
            if (calls.length === 1) return JSON.stringify(history);
            if (calls.length <= 3) return '';
            return 'f';
          },
        }),
      /postconditions/,
    );
    assert.match(calls[1], /^BEGIN;[\s\S]+ROLLBACK;/);
    assert.doesNotMatch(calls[1], /\\ir /);
    const adapter = read('services/api/supabase/local-only/isolated-signup-adapter.sql');
    assert.equal(calls[1], `BEGIN;\n${adapter}\nROLLBACK;\n`);
    assert.match(
      calls[2],
      /^BEGIN;\nSET LOCAL finance.isolated_signup_adapter = 'synthetic-local-only';/,
    );
    assert.match(calls[2], /LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE/);
    assert.match(calls[2], /COMMIT;$/);
    assert.deepEqual(operations, [
      'migration-history',
      'adapter-regression',
      'adapter-install',
      'adapter-postconditions',
    ]);
  } finally {
    f.cleanup();
  }
});

test('publication validates every selected column/RLS and publishes only rule tables', () => {
  const f = fixture();
  try {
    materialize(f.options);
    const calls = [];
    publication({
      directory: f.directory,
      sql: (sql) => {
        calls.push(sql);
        if (sql.includes('relrowsecurity')) return 't';
        if (sql.includes('json_agg(tablename')) return JSON.stringify(['accounts', 'users']);
        return '';
      },
    });
    assert.match(calls[0], /SELECT id FROM public."accounts" WHERE false/);
    assert.match(
      calls[2],
      /^CREATE PUBLICATION powersync FOR TABLE public."accounts",public."users";$/,
    );
    assert.doesNotMatch(calls.join('\n'), /FOR ALL TABLES|ALTER PUBLICATION/);
  } finally {
    f.cleanup();
  }
});

test('every one of the 39 real reviewed rule queries reaches zero-row validation', () => {
  const f = fixture();
  try {
    materialize({
      ...f.options,
      git: (args) =>
        args[0] === 'show' && args[1].endsWith(':services/api/powersync/sync-rules.yaml')
          ? read('services/api/powersync/sync-rules.yaml')
          : git(args),
    });
    let queries = 0;
    let tables = [];
    publication({
      directory: f.directory,
      sql: (sql) => {
        if (sql.includes('WHERE false')) queries = sql.split('WHERE false;').length - 1;
        if (sql.includes('relrowsecurity')) return 't';
        if (sql.startsWith('CREATE PUBLICATION')) {
          tables = [...sql.matchAll(/public\."([a-z_]+)"/g)].map((match) => match[1]);
        }
        if (sql.includes('json_agg(tablename')) return JSON.stringify(tables);
        return '';
      },
    });
    assert.equal(queries, 39);
    assert.ok(tables.includes('households'));
    assert.ok(tables.includes('household_members'));
    assert.ok(tables.includes('users'));
    assert.equal(new Set(tables).size, tables.length);
  } finally {
    f.cleanup();
  }
});
