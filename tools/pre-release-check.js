#!/usr/bin/env node

/**
 * Pre-release validation script for the Finance monorepo.
 *
 * Run: node tools/pre-release-check.js
 *
 * Performs the following checks before a release:
 *   1. No uncommitted changes in the working tree
 *   2. Currently on the main branch
 *   3. No pending changesets (all changesets consumed)
 *   4. package.json version is valid semver
 *   5. CHANGELOG.md exists and has been updated recently
 *   6. Required tools are available (node, npm, npx, git)
 *
 * Exit codes:
 *   0 — All checks passed
 *   1 — One or more checks failed
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// ── Helpers ──────────────────────────────────────────────────────────────────

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️';

let failures = 0;
let warnings = 0;

function log(icon, message) {
  console.log(`  ${icon}  ${message}`);
}

function pass(message) {
  log(PASS, message);
}

function fail(message) {
  log(FAIL, message);
  failures++;
}

function warn(message) {
  log(WARN, message);
  warnings++;
}

/**
 * Run a shell command and return trimmed stdout.
 * Returns null if the command fails.
 */
function run(cmd) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Check whether a CLI tool is available on the PATH.
 */
function hasCommand(name) {
  // Use "where" on Windows, "which" on Unix
  const check = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
  return run(check) !== null;
}

// ── Checks ───────────────────────────────────────────────────────────────────

console.log('');
console.log('🔍 Finance — Pre-release checks');
console.log('─'.repeat(50));
console.log('');

// 1. Required tools
console.log('Required tools:');
for (const tool of ['node', 'npm', 'npx', 'git']) {
  if (hasCommand(tool)) {
    pass(`${tool} is available`);
  } else {
    fail(`${tool} is NOT available — install it before releasing`);
  }
}
console.log('');

// 2. No uncommitted changes
console.log('Working tree:');
const status = run('git status --porcelain');
if (status === null) {
  fail('Could not run git status — are you in a git repository?');
} else if (status === '') {
  pass('No uncommitted changes');
} else {
  const changedFiles = status.split('\n').length;
  fail(`${changedFiles} uncommitted change(s) detected — commit or stash before releasing`);
  // Print the first few changed files for context
  status
    .split('\n')
    .slice(0, 5)
    .forEach((line) => console.log(`       ${line}`));
  if (changedFiles > 5) {
    console.log(`       ... and ${changedFiles - 5} more`);
  }
}
console.log('');

// 3. On main branch
console.log('Branch:');
const branch = run('git rev-parse --abbrev-ref HEAD');
if (branch === 'main') {
  pass('On main branch');
} else if (branch !== null) {
  fail(`On branch "${branch}" — releases must be tagged from main`);
} else {
  fail('Could not determine current branch');
}
console.log('');

// 4. No pending changesets
console.log('Changesets:');
const changesetDir = join(ROOT, '.changeset');
if (existsSync(changesetDir)) {
  const pendingChangesets = readdirSync(changesetDir).filter(
    (f) => f.endsWith('.md') && f !== 'README.md',
  );
  if (pendingChangesets.length === 0) {
    pass('No pending changesets — all changes have been versioned');
  } else {
    fail(`${pendingChangesets.length} pending changeset(s) — run "npx changeset version" first`);
    pendingChangesets.slice(0, 5).forEach((f) => console.log(`       .changeset/${f}`));
    if (pendingChangesets.length > 5) {
      console.log(`       ... and ${pendingChangesets.length - 5} more`);
    }
  }
} else {
  warn('.changeset directory not found — is Changesets configured?');
}
console.log('');

// 5. package.json version is valid semver
console.log('Version:');
const pkgPath = join(ROOT, 'package.json');
if (existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const version = pkg.version;
    // Basic semver regex (covers major.minor.patch with optional pre-release)
    const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;
    if (semverRegex.test(version)) {
      pass(`package.json version is valid: ${version}`);
    } else {
      fail(`package.json version "${version}" is not valid semver`);
    }
  } catch (e) {
    fail(`Could not parse package.json: ${e.message}`);
  }
} else {
  fail('package.json not found at repository root');
}
console.log('');

// 6. CHANGELOG.md exists
console.log('Changelog:');
const changelogPath = join(ROOT, 'CHANGELOG.md');
if (existsSync(changelogPath)) {
  const changelog = readFileSync(changelogPath, 'utf-8');
  if (changelog.length > 0) {
    pass('CHANGELOG.md exists and is non-empty');
  } else {
    warn('CHANGELOG.md exists but is empty — has it been updated?');
  }
} else {
  warn(
    'CHANGELOG.md not found at repository root — it will be created by Changesets on first version',
  );
}
console.log('');

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('─'.repeat(50));

if (failures === 0 && warnings === 0) {
  console.log('✅ All pre-release checks passed. Ready to release!');
  console.log('');
  process.exit(0);
} else if (failures === 0) {
  console.log(`⚠️  All checks passed with ${warnings} warning(s). Review before releasing.`);
  console.log('');
  process.exit(0);
} else {
  console.log(
    `❌ ${failures} check(s) failed, ${warnings} warning(s). Fix issues before releasing.`,
  );
  console.log('');
  process.exit(1);
}
