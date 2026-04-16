// SPDX-License-Identifier: BUSL-1.1

/**
 * Quick CI check for docs-only or non-code changes.
 *
 * Runs only Prettier format checking (no ESLint, no type-check, no build).
 * Use this when your PR only touches markdown, docs, or config files.
 *
 * Usage: npm run ci:check:quick
 */

const { execSync } = require('child_process');

const commands = [{ name: 'Prettier (format check)', cmd: 'npx prettier --check .' }];

let failed = false;

for (const { name, cmd } of commands) {
  console.log(`\n▶ ${name}`);
  console.log(`  $ ${cmd}\n`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`✅ ${name} passed`);
  } catch {
    console.error(`❌ ${name} failed`);
    failed = true;
  }
}

if (failed) {
  console.error('\n❌ Quick CI check failed — fix the issues above.');
  process.exit(1);
} else {
  console.log('\n✅ Quick CI check passed — safe to push docs-only changes.');
}
