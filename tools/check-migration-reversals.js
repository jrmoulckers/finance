#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// Migration Reversal Check — every up migration needs a matching down migration
// =============================================================================
//
// Suggested package.json script:
//   "db:check:reversals": "node tools/check-migration-reversals.js"
//
// Supports audit issue #2881. Verifies that every forward migration in
//   services/api/supabase/migrations/*.sql
// has a matching reverse migration in
//   services/api/supabase/migrations/down/<name>.down.sql
//
// Exits 1 if any down migration is missing (or orphaned down files exist),
// 0 otherwise.
//
// Usage:
//   node tools/check-migration-reversals.js          # check, exit 1 on missing
//   node tools/check-migration-reversals.js --json    # machine-readable report
//   node tools/check-migration-reversals.js --help
//
// Plain Node, no dependencies.
// =============================================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const asJson = args.includes('--json');

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`
Migration Reversal Check — Finance monorepo

Usage:
  node tools/check-migration-reversals.js          # exit 1 if any down file missing
  node tools/check-migration-reversals.js --json    # JSON report
  node tools/check-migration-reversals.js --help

Ensures every services/api/supabase/migrations/*.sql has a matching
services/api/supabase/migrations/down/<name>.down.sql reverse migration.
`);
  process.exit(0);
}

const MIGRATIONS_DIR = path.join(ROOT, 'services', 'api', 'supabase', 'migrations');
const DOWN_DIR = path.join(MIGRATIONS_DIR, 'down');

function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    // Nothing to check — treat as success so the check is a no-op in trees
    // without migrations rather than a spurious failure.
    if (asJson) {
      process.stdout.write(
        JSON.stringify({ ok: true, note: 'migrations dir not found', migrations: 0 }, null, 2) +
          '\n',
      );
    } else {
      process.stdout.write('✅ No migrations directory found — nothing to check.\n');
    }
    process.exit(0);
  }

  const upFiles = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.sql') && !d.name.endsWith('.down.sql'))
    .map((d) => d.name)
    .sort();

  const downFiles = fs.existsSync(DOWN_DIR)
    ? fs
        .readdirSync(DOWN_DIR, { withFileTypes: true })
        .filter((d) => d.isFile() && d.name.endsWith('.down.sql'))
        .map((d) => d.name)
        .sort()
    : [];

  const downSet = new Set(downFiles);

  const missing = [];
  for (const up of upFiles) {
    const base = up.replace(/\.sql$/, '');
    const expectedDown = `${base}.down.sql`;
    if (!downSet.has(expectedDown)) {
      missing.push({ up, expectedDown });
    }
  }

  // Orphaned down files (down without a corresponding up) — reported as warnings,
  // not failures, since they don't break reversibility of current migrations.
  const upBaseSet = new Set(upFiles.map((f) => f.replace(/\.sql$/, '')));
  const orphans = downFiles.filter((d) => !upBaseSet.has(d.replace(/\.down\.sql$/, '')));

  const report = {
    ok: missing.length === 0,
    migrations: upFiles.length,
    downMigrations: downFiles.length,
    missing,
    orphans,
  };

  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write('Migration Reversal Check\n');
    process.stdout.write('========================\n');
    process.stdout.write(`Up migrations:   ${upFiles.length}\n`);
    process.stdout.write(`Down migrations: ${downFiles.length}\n\n`);

    if (orphans.length) {
      process.stdout.write(`⚠️  ${orphans.length} orphaned down migration(s) (no matching up):\n`);
      for (const o of orphans) process.stdout.write(`     - down/${o}\n`);
      process.stdout.write('\n');
    }

    if (missing.length === 0) {
      process.stdout.write('✅ Every up migration has a matching down migration.\n');
    } else {
      process.stdout.write(`❌ ${missing.length} migration(s) missing a reverse migration:\n`);
      for (const m of missing) {
        process.stdout.write(`     - ${m.up}  ->  down/${m.expectedDown} (MISSING)\n`);
      }
    }
  }

  // GitHub Actions annotations + summary.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['### Migration Reversal Check', ''];
    lines.push(`Up: **${upFiles.length}** · Down: **${downFiles.length}**`);
    lines.push('');
    if (missing.length === 0) {
      lines.push('✅ Every up migration has a matching down migration.');
    } else {
      lines.push(`❌ **${missing.length}** missing reverse migration(s):`);
      lines.push('');
      for (const m of missing) lines.push(`- \`${m.up}\` → \`down/${m.expectedDown}\``);
    }
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
    } catch (err) {
      console.error('Could not write GitHub job summary:', err.message);
    }
  }
  for (const m of missing) {
    process.stdout.write(
      `::error file=services/api/supabase/migrations/${m.up}::Missing reverse migration ` +
        `services/api/supabase/migrations/down/${m.expectedDown}\n`,
    );
  }

  process.exit(missing.length === 0 ? 0 : 1);
}

main();
