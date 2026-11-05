// SPDX-License-Identifier: BUSL-1.1
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrations = new URL('../migrations/', import.meta.url);
const adapter = readFileSync(
  new URL('../local-only/isolated-signup-adapter.sql', import.meta.url),
  'utf8',
);

test('isolated adapter requires the complete current ordered migration inventory', () => {
  const expected = readdirSync(migrations)
    .filter((name) => /^\d{14}_.*\.sql$/.test(name))
    .map((name) => name.slice(0, 14))
    .sort();
  const pinned = [...adapter.matchAll(/'(\d{14})'/g)].map((match) => match[1]);
  assert.deepEqual(pinned, expected);
});

test('local adapter is outside automatic migration and Docker initialization paths', () => {
  assert.ok(!readdirSync(migrations).some((name) => name.includes('isolated')));
  const initializer = readFileSync(
    new URL('../docker-init/01-apply-migrations.sh', import.meta.url),
    'utf8',
  );
  assert.ok(!initializer.includes('local-only'));
  assert.match(adapter, /AFTER INSERT ON auth\.users/);
  assert.match(adapter, /LOCK TABLE auth\.users IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(adapter, /public\.handle_new_user_signup\(NEW\.id, NEW\.email, NULL\)/);
  assert.doesNotMatch(adapter, /raw_user_meta_data|ALTER.*ROW LEVEL SECURITY|CREATE OR REPLACE/i);
});

test('existing disposable database CI command includes the transactional regression suite', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['test:billing-entitlements'], /&& npm run test:isolated-signup$/);
  assert.match(pkg.scripts['test:isolated-signup'], /psql -v ON_ERROR_STOP=1/);
  assert.match(pkg.scripts['test:isolated-signup'], /^npm run test:sync-schema &&/);
  assert.match(pkg.scripts['test:sync-schema'], /sync-rule-schema\.test\.sql$/);
  assert.match(pkg.scripts['test:sync-schema'], /^node supabase\/tests\/sync-rule-columns\.mjs &&/);
  const suite = readFileSync(
    new URL('./isolated-signup-adapter.test.sql', import.meta.url),
    'utf8',
  );
  assert.match(suite, /BEGIN;/);
  assert.match(suite, /\\ir \.\.\/local-only\/isolated-signup-adapter\.sql/);
  assert.match(suite, /ROLLBACK;\s*$/);
});
