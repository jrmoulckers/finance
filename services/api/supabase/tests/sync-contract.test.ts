// SPDX-License-Identifier: BUSL-1.1

/**
 * Sync Contract Tests
 *
 * Validates that the PowerSync sync-rules.yaml is consistent with the
 * database schema defined in SQL migrations. These tests run with Deno
 * and require only file-system access — no database or network needed.
 *
 * Usage:
 *   deno test --allow-read supabase/tests/sync-contract.test.ts
 *
 * Issues: #532
 */

import {
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/testing/asserts.ts';
import { parse as parseYaml } from 'https://deno.land/std@0.208.0/yaml/mod.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolved paths relative to this test file's location. */
const TEST_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const SUPABASE_DIR = resolve(TEST_DIR, '..');
const SYNC_RULES_PATH = resolve(SUPABASE_DIR, '..', 'powersync', 'sync-rules.yaml');
const MIGRATIONS_DIR = resolve(SUPABASE_DIR, 'migrations');

/** Normalise path separators for cross-platform compatibility. */
function resolve(...parts: string[]): string {
  // Simple join — Deno's URL-based import.meta.url handles the root.
  let joined = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const sep = joined.endsWith('/') || joined.endsWith('\\') ? '' : '/';
    joined = joined + sep + parts[i];
  }
  // Normalise /../ and /./ segments
  const segments: string[] = [];
  for (const seg of joined.replace(/\\/g, '/').split('/')) {
    if (seg === '..') segments.pop();
    else if (seg !== '.' && seg !== '') segments.push(seg);
  }
  // Preserve drive letter on Windows (e.g. G:)
  const first = segments[0];
  if (first && first.length === 2 && first[1] === ':') {
    return segments.join('/');
  }
  return '/' + segments.join('/');
}

/** Read and parse sync-rules.yaml. */
async function loadSyncRules(): Promise<SyncRules> {
  const text = await Deno.readTextFile(SYNC_RULES_PATH);
  return parseYaml(text) as SyncRules;
}

/** Read all migration SQL files concatenated. */
async function loadMigrationsSql(): Promise<string> {
  const entries: string[] = [];
  for await (const entry of Deno.readDir(MIGRATIONS_DIR)) {
    if (entry.isFile && entry.name.endsWith('.sql')) {
      entries.push(entry.name);
    }
  }
  entries.sort();

  const parts: string[] = [];
  for (const name of entries) {
    const content = await Deno.readTextFile(`${MIGRATIONS_DIR}/${name}`);
    parts.push(content);
  }
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Types for sync-rules.yaml structure
// ---------------------------------------------------------------------------

interface SyncRules {
  bucket_definitions: Record<string, BucketDefinition>;
}

interface BucketDefinition {
  parameters: string[];
  data: string[];
}

/**
 * Extract table names from a SQL query string.
 * Handles patterns like: SELECT ... FROM table_name WHERE ...
 */
function extractTableName(query: string): string | null {
  const match = query.match(/\bFROM\s+(\w+)/i);
  return match ? match[1] : null;
}

/**
 * Extract all column names from the SELECT clause of a query.
 * Returns null if SELECT * is used (meaning all columns).
 */
function extractSelectColumns(query: string): string[] | null {
  const match = query.match(/\bSELECT\s+(.+?)\s+FROM\b/i);
  if (!match) return null;
  const selectClause = match[1].trim();
  if (selectClause === '*') return null; // SELECT * — all columns
  return selectClause.split(',').map((c) => c.trim());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test('sync-rules.yaml can be parsed', async () => {
  const rules = await loadSyncRules();
  assertEquals(typeof rules.bucket_definitions, 'object');
  assertEquals(Object.keys(rules.bucket_definitions).length > 0, true);
});

Deno.test('sync-rules.yaml references only existing tables', async () => {
  const rules = await loadSyncRules();
  const migrationsSql = await loadMigrationsSql();

  // Extract all CREATE TABLE statements from migrations
  const createTablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi;
  const existingTables = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = createTablePattern.exec(migrationsSql)) !== null) {
    existingTables.add(match[1].toLowerCase());
  }

  // Extract all tables referenced in sync-rules data queries
  const referencedTables: string[] = [];
  for (const [_bucketName, bucket] of Object.entries(rules.bucket_definitions)) {
    for (const query of [...bucket.parameters, ...bucket.data]) {
      const table = extractTableName(query);
      if (table) referencedTables.push(table);
    }
  }

  const missingTables = referencedTables.filter((t) => !existingTables.has(t.toLowerCase()));

  assertEquals(
    missingTables,
    [],
    `sync-rules.yaml references tables not found in migrations: ${missingTables.join(', ')}`,
  );
});

Deno.test('sync-rules.yaml has soft-delete filter on all data queries', async () => {
  const rules = await loadSyncRules();
  const queriesWithoutFilter: string[] = [];

  for (const [bucketName, bucket] of Object.entries(rules.bucket_definitions)) {
    for (const query of bucket.data) {
      if (!query.toLowerCase().includes('deleted_at is null')) {
        queriesWithoutFilter.push(`${bucketName}: ${query}`);
      }
    }
  }

  assertEquals(
    queriesWithoutFilter,
    [],
    `Data queries missing 'deleted_at IS NULL' filter:\n${queriesWithoutFilter.join('\n')}`,
  );
});

Deno.test('sync-rules.yaml has soft-delete filter on all parameter queries', async () => {
  const rules = await loadSyncRules();
  const queriesWithoutFilter: string[] = [];

  for (const [bucketName, bucket] of Object.entries(rules.bucket_definitions)) {
    for (const query of bucket.parameters) {
      if (!query.toLowerCase().includes('deleted_at is null')) {
        queriesWithoutFilter.push(`${bucketName}: ${query}`);
      }
    }
  }

  assertEquals(
    queriesWithoutFilter,
    [],
    `Parameter queries missing 'deleted_at IS NULL' filter:\n${queriesWithoutFilter.join('\n')}`,
  );
});

Deno.test('sync-rules.yaml excludes internal-only columns from SELECT *', async () => {
  // When SELECT * is used, the sync engine sends ALL columns to the client.
  // Certain columns must NEVER be sent to clients:
  //   - public_key from passkey_credentials (cryptographic material)
  //
  // sync_version and is_synced ARE intentionally included via SELECT *
  // because the client's PowerSync SDK uses them for change tracking.
  //
  // This test verifies that passkey_credentials is NOT in any sync bucket.
  const rules = await loadSyncRules();
  const sensitiveTablesInSync: string[] = [];
  const sensitiveTables = ['passkey_credentials', 'webauthn_challenges', 'audit_log'];

  for (const [bucketName, bucket] of Object.entries(rules.bucket_definitions)) {
    for (const query of bucket.data) {
      const table = extractTableName(query);
      if (table && sensitiveTables.includes(table.toLowerCase())) {
        sensitiveTablesInSync.push(`${bucketName}: ${table}`);
      }
    }
  }

  assertEquals(
    sensitiveTablesInSync,
    [],
    `Sensitive tables should not be in sync-rules data queries: ${sensitiveTablesInSync.join(', ')}`,
  );
});

Deno.test('sync-rules bucket parameters use token_parameters.user_id', async () => {
  const rules = await loadSyncRules();
  const bucketsWithoutTokenParam: string[] = [];

  for (const [bucketName, bucket] of Object.entries(rules.bucket_definitions)) {
    const hasTokenParam = bucket.parameters.some((q) => q.includes('token_parameters.user_id'));

    if (!hasTokenParam) {
      bucketsWithoutTokenParam.push(bucketName);
    }
  }

  assertEquals(
    bucketsWithoutTokenParam,
    [],
    `Buckets without token_parameters.user_id in parameters: ${bucketsWithoutTokenParam.join(', ')}`,
  );
});

Deno.test('all synced tables have RLS enabled in migrations', async () => {
  const rules = await loadSyncRules();
  const migrationsSql = await loadMigrationsSql();

  // Collect all tables referenced in sync-rules
  const syncedTables = new Set<string>();
  for (const [_bucketName, bucket] of Object.entries(rules.bucket_definitions)) {
    for (const query of [...bucket.parameters, ...bucket.data]) {
      const table = extractTableName(query);
      if (table) syncedTables.add(table.toLowerCase());
    }
  }

  // Check that each synced table has ALTER TABLE ... ENABLE ROW LEVEL SECURITY
  const tablesWithoutRls: string[] = [];
  for (const table of syncedTables) {
    const rlsPattern = new RegExp(
      `ALTER\\s+TABLE\\s+(?:public\\.)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      'i',
    );
    if (!rlsPattern.test(migrationsSql)) {
      tablesWithoutRls.push(table);
    }
  }

  assertEquals(
    tablesWithoutRls,
    [],
    `Synced tables without RLS enabled in migrations: ${tablesWithoutRls.join(', ')}`,
  );
});

Deno.test('by_household bucket uses bucket.household_id for data isolation', async () => {
  const rules = await loadSyncRules();
  const byHousehold = rules.bucket_definitions['by_household'];

  assertEquals(byHousehold !== undefined, true, 'by_household bucket must exist in sync-rules');

  if (!byHousehold) return;

  const queriesWithoutBucketParam: string[] = [];
  for (const query of byHousehold.data) {
    if (!query.includes('bucket.household_id')) {
      queriesWithoutBucketParam.push(query);
    }
  }

  assertEquals(
    queriesWithoutBucketParam,
    [],
    `by_household data queries missing bucket.household_id filter:\n${queriesWithoutBucketParam.join('\n')}`,
  );
});

Deno.test('user_profile bucket uses bucket.user_id for data isolation', async () => {
  const rules = await loadSyncRules();
  const userProfile = rules.bucket_definitions['user_profile'];

  assertEquals(userProfile !== undefined, true, 'user_profile bucket must exist in sync-rules');

  if (!userProfile) return;

  const queriesWithoutBucketParam: string[] = [];
  for (const query of userProfile.data) {
    if (!query.includes('bucket.user_id')) {
      queriesWithoutBucketParam.push(query);
    }
  }

  assertEquals(
    queriesWithoutBucketParam,
    [],
    `user_profile data queries missing bucket.user_id filter:\n${queriesWithoutBucketParam.join('\n')}`,
  );
});

Deno.test('sync-rules parameter queries produce the correct bucket key columns', async () => {
  const rules = await loadSyncRules();

  // by_household parameter must SELECT household_id
  const byHousehold = rules.bucket_definitions['by_household'];
  assertEquals(byHousehold !== undefined, true, 'by_household bucket must exist');
  if (byHousehold) {
    const paramQuery = byHousehold.parameters[0];
    assertStringIncludes(
      paramQuery.toLowerCase(),
      'household_id',
      'by_household parameter query must SELECT household_id',
    );
    assertStringIncludes(
      paramQuery.toLowerCase(),
      'household_members',
      'by_household parameter query must query household_members table',
    );
  }

  // user_profile parameter must SELECT id AS user_id (or similar)
  const userProfile = rules.bucket_definitions['user_profile'];
  assertEquals(userProfile !== undefined, true, 'user_profile bucket must exist');
  if (userProfile) {
    const paramQuery = userProfile.parameters[0];
    assertStringIncludes(
      paramQuery.toLowerCase(),
      'user_id',
      'user_profile parameter query must produce user_id column',
    );
  }
});

Deno.test('sync-rules expected bucket definitions exist', async () => {
  const rules = await loadSyncRules();
  const expectedBuckets = ['by_household', 'user_profile'];

  for (const bucket of expectedBuckets) {
    assertEquals(
      rules.bucket_definitions[bucket] !== undefined,
      true,
      `Expected bucket '${bucket}' to be defined in sync-rules.yaml`,
    );
  }
});

Deno.test('sync-rules by_household bucket includes all household-scoped tables', async () => {
  const rules = await loadSyncRules();
  const byHousehold = rules.bucket_definitions['by_household'];

  assertEquals(byHousehold !== undefined, true, 'by_household bucket must exist');
  if (!byHousehold) return;

  // These tables are household-scoped and must be synced
  const expectedTables = ['accounts', 'transactions', 'categories', 'budgets', 'goals'];

  const syncedTables = byHousehold.data
    .map(extractTableName)
    .filter((t): t is string => t !== null)
    .map((t) => t.toLowerCase());

  for (const table of expectedTables) {
    assertEquals(
      syncedTables.includes(table),
      true,
      `by_household bucket should include '${table}' table`,
    );
  }
});

Deno.test('sync-rules user_profile bucket includes user and membership tables', async () => {
  const rules = await loadSyncRules();
  const userProfile = rules.bucket_definitions['user_profile'];

  assertEquals(userProfile !== undefined, true, 'user_profile bucket must exist');
  if (!userProfile) return;

  const expectedTables = ['users', 'household_members'];

  const syncedTables = userProfile.data
    .map(extractTableName)
    .filter((t): t is string => t !== null)
    .map((t) => t.toLowerCase());

  for (const table of expectedTables) {
    assertEquals(
      syncedTables.includes(table),
      true,
      `user_profile bucket should include '${table}' table`,
    );
  }
});

Deno.test('no duplicate table references within a single bucket', async () => {
  const rules = await loadSyncRules();

  for (const [bucketName, bucket] of Object.entries(rules.bucket_definitions)) {
    const tables = bucket.data
      .map(extractTableName)
      .filter((t): t is string => t !== null)
      .map((t) => t.toLowerCase());

    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const table of tables) {
      if (seen.has(table)) {
        duplicates.push(table);
      }
      seen.add(table);
    }

    assertEquals(
      duplicates,
      [],
      `Bucket '${bucketName}' has duplicate table references: ${duplicates.join(', ')}`,
    );
  }
});
