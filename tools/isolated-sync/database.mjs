// Exact migration/adapter stages. Usage: runtime.mjs; never executed on import.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { MIGRATIONS, sha256 } from './profile.mjs';

/** Recheck the exact CLI-managed history, never repair or manufacture version rows. */
export function verifyHistory(context) {
  const { manifest, sql } = context;
  const actual = JSON.parse(
    sql(
      `SELECT coalesce(json_agg(row_to_json(m) ORDER BY version), '[]'::json)
FROM (SELECT version, name, statements
      FROM supabase_migrations.schema_migrations) m;`,
      'migration-history',
    ),
  );
  const files = Object.keys(manifest.sourceFiles)
    .filter((name) => new RegExp(`^${MIGRATIONS}[0-9]{14}_[^/]+\\.sql$`).test(name))
    .sort();
  const expected = files.map((name) => ({
    version: path.posix.basename(name).slice(0, 14),
    name: path.posix.basename(name).slice(15, -4),
    recorded: true,
  }));
  const metadata = actual.map((row) => ({
    version: row.version,
    name: row.name,
    recorded: Array.isArray(row.statements) && row.statements.length > 0,
  }));
  if (JSON.stringify(metadata) !== JSON.stringify(expected)) {
    throw new Error('Exact CLI migration history/name/statement evidence mismatch.');
  }
  const historyHash = sha256(JSON.stringify(actual));
  if (
    (context.requireHistoryHash && !context.historyHash) ||
    (context.historyHash && context.historyHash !== historyHash)
  ) {
    throw new Error('Recorded migration statement SHA256 changed or is missing.');
  }
  return historyHash;
}

/** Run actual GoTrue schema initialization without starting its API, then all migrations. */
export function migrate(context) {
  const { compose, directory, cli, sql, executeCli, wait } = context;
  compose('api', ['up', '-d', '--no-deps', '--no-recreate', '--pull', 'never', 'auth-migrate']);
  wait('auth-migrate');
  sql(
    `DO $$ BEGIN
IF EXISTS (SELECT 1 FROM auth.users) OR to_regclass('public.users') IS NOT NULL
   OR to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
  RAISE EXCEPTION 'fresh unmigrated database required';
END IF;
END $$;`,
    'migration-preconditions',
  );
  executeCli(
    cli,
    [
      'migration',
      'up',
      '--db-url',
      'postgresql://postgres@127.0.0.1:55432/postgres?sslmode=disable',
    ],
    directory,
  );
  return verifyHistory(context);
}

/** Verify all unchanged rule-selected columns exist; publish exactly their source tables. */
export function publication(context) {
  const { directory, sql } = context;
  const rules = yaml.load(fs.readFileSync(path.join(directory, 'sync-rules.yaml'), 'utf8'));
  const tables = new Set();
  const statements = [];
  for (const bucket of Object.values(rules.bucket_definitions)) {
    for (const query of [...(bucket.parameters ?? []), ...(bucket.data ?? [])]) {
      const match = query.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+([a-z_][a-z0-9_]*)\b/i);
      if (!match || !/^[a-z0-9_,\s]+$/i.test(match[1])) {
        throw new Error('Rule query requires a new reviewed column-validation parser.');
      }
      tables.add(match[2]);
      statements.push(`SELECT ${match[1]} FROM public."${match[2]}" WHERE false;`);
    }
  }
  if (tables.size === 0) throw new Error('Empty replication table inventory.');
  const values = [...tables].sort();
  sql(statements.join('\n'), 'rule-columns');
  if (
    sql(
      `SELECT count(*) = ${values.length} AND bool_and(relrowsecurity)
FROM pg_class WHERE oid = ANY(ARRAY[${values.map((name) => `'public.${name}'::regclass`).join(',')}]);`,
      'rule-rls',
    ) !== 't'
  ) {
    throw new Error('Rule source tables are missing RLS.');
  }
  sql(
    `CREATE PUBLICATION powersync FOR TABLE ${values.map((name) => `public."${name}"`).join(',')};`,
    'publication-create',
  );
  const actual = JSON.parse(
    sql(
      `SELECT json_agg(tablename ORDER BY tablename)
FROM pg_publication_tables WHERE pubname = 'powersync' AND schemaname = 'public';`,
      'publication-inventory',
    ),
  );
  if (JSON.stringify(actual) !== JSON.stringify(values))
    throw new Error('Publication inventory mismatch.');
}

/** Exercise rollback/permissions/RLS fixtures, then install the exact adapter atomically. */
export function installAdapter(context) {
  const { directory, sql } = context;
  verifyHistory(context);
  const adapter = fs.readFileSync(path.join(directory, 'adapter.sql'), 'utf8');
  const test = fs.readFileSync(path.join(directory, 'adapter-regression.sql'), 'utf8');
  const include = '\\ir ../local-only/isolated-signup-adapter.sql';
  if (test.split(include).length !== 2) throw new Error('Regression include contract changed.');
  sql(test.replace(include, adapter), 'adapter-regression');
  sql(
    `BEGIN;
SET LOCAL finance.isolated_signup_adapter = 'synthetic-local-only';
${adapter}
COMMIT;`,
    'adapter-install',
  );
  verifyAdapter(context);
  publication(context);
}

/** Recheck the committed trigger and effective RPC grants before permitting Auth traffic. */
export function verifyAdapter({ sql }) {
  if (
    sql(
      `SELECT
EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'isolated_local_signup_adapter'
 AND tgrelid = 'auth.users'::regclass AND tgenabled = 'O'
 AND tgfoid = 'public.isolated_local_signup_adapter()'::regprocedure)
AND has_function_privilege('service_role','public.handle_new_user_signup(uuid,text,text)','EXECUTE')
AND NOT has_function_privilege('anon','public.handle_new_user_signup(uuid,text,text)','EXECUTE')
AND NOT has_function_privilege('authenticated','public.handle_new_user_signup(uuid,text,text)','EXECUTE')
AND NOT has_function_privilege('anon','public.isolated_local_signup_adapter()','EXECUTE')
AND NOT has_function_privilege('authenticated','public.isolated_local_signup_adapter()','EXECUTE')
AND NOT has_function_privilege('service_role','public.isolated_local_signup_adapter()','EXECUTE');`,
      'adapter-postconditions',
    ) !== 't'
  ) {
    throw new Error('Adapter trigger/permission postconditions failed.');
  }
}
