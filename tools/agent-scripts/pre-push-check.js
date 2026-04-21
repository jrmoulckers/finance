#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// Pre-Push Check — Run format/lint checks and optionally auto-fix + amend
// =============================================================================
//
// Usage:
//   node tools/agent-scripts/pre-push-check.js          # check only
//   node tools/agent-scripts/pre-push-check.js --fix     # fix, stage, and amend
//
// Steps:
//   1. npm run format (--fix only)
//   2. npx eslint . --fix (--fix only)
//   3. npm run format:check
//   4. npx eslint . --max-warnings 0
//   5. If --fix and all pass: git add -A && git commit --amend --no-edit
//
// Exit codes: 0 = all pass, 1 = any failure
// =============================================================================

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;
const fmt = {
  green: (s) => (supportsColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s) => (supportsColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (supportsColor ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s) => (supportsColor ? `\x1b[36m${s}\x1b[0m` : s),
  bold: (s) => (supportsColor ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s) => (supportsColor ? `\x1b[2m${s}\x1b[0m` : s),
};

// ── CLI parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const doFix = args.includes('--fix');

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${fmt.bold('Finance — Pre-Push Check')}

Runs format and lint checks required before pushing. With --fix, auto-fixes
issues and amends the current commit.

${fmt.bold('Usage:')}
  node tools/agent-scripts/pre-push-check.js          ${fmt.dim('# check only')}
  node tools/agent-scripts/pre-push-check.js --fix     ${fmt.dim('# fix + amend')}

${fmt.bold('Steps:')}
  ${fmt.dim('(--fix only)')}  npm run format
  ${fmt.dim('(--fix only)')}  npx eslint . --fix
  ${fmt.dim('(always)')}      npm run format:check
  ${fmt.dim('(always)')}      npx eslint . --max-warnings 0
  ${fmt.dim('(--fix only)')}  git add -A && git commit --amend --no-edit

${fmt.bold('Exit codes:')}
  0  All checks passed
  1  One or more checks failed
`);
  process.exit(0);
}

// ── Step runner ──────────────────────────────────────────────────────────────

/** @type {{ name: string; status: 'pass' | 'fail' | 'skip'; duration: number }[]} */
const results = [];
const startTime = Date.now();

/**
 * Format milliseconds into a human-friendly string.
 * @param {number} ms
 * @returns {string}
 */
function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

/**
 * Run a named step.
 * @param {string} name
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {{ skip?: boolean }} [opts]
 * @returns {boolean} true if passed
 */
function step(name, cmd, cmdArgs, opts = {}) {
  if (opts.skip) {
    results.push({ name, status: 'skip', duration: 0 });
    console.log(`  ${fmt.yellow('○')} ${name} ${fmt.dim('— skipped')}`);
    return true;
  }

  const t0 = Date.now();
  try {
    execFileSync(cmd, cmdArgs, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, HUSKY: '0' },
    });
    const duration = Date.now() - t0;
    results.push({ name, status: 'pass', duration });
    console.log(`  ${fmt.green('✓')} ${name} ${fmt.dim(`(${formatMs(duration)})`)}`);
    return true;
  } catch {
    const duration = Date.now() - t0;
    results.push({ name, status: 'fail', duration });
    console.log(`  ${fmt.red('✗')} ${name} ${fmt.dim(`(${formatMs(duration)})`)}`);
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(`\n${fmt.bold('🔍 Finance — Pre-Push Check')}`);
console.log(`${'─'.repeat(48)}`);
console.log(`  Mode: ${doFix ? fmt.cyan('fix + amend') : fmt.dim('check only')}\n`);

let allPassed = true;

// Fix steps (only with --fix)
if (doFix) {
  console.log(fmt.bold('  Fix phase:'));
  step('Prettier format (fix)', 'npx', ['prettier', '--write', '.']);
  step('ESLint (fix)', 'npx', ['eslint', '.', '--fix']);
  console.log('');
}

// Verification steps (always)
console.log(fmt.bold('  Verify phase:'));
if (!step('Prettier format check', 'npx', ['prettier', '--check', '.'])) {
  allPassed = false;
}
if (!step('ESLint check', 'npx', ['eslint', '.', '--max-warnings', '0'])) {
  allPassed = false;
}

// Amend step (only with --fix and all passed)
if (doFix && allPassed) {
  console.log('');
  console.log(fmt.bold('  Commit phase:'));

  // Check if there are staged changes to amend
  let hasChanges = false;
  try {
    execFileSync('git', ['add', '-A'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    hasChanges = status.length > 0;
  } catch {
    // Ignore — might not be in a git repo during testing
  }

  if (hasChanges) {
    step('Amend commit with fixes', 'git', ['commit', '--amend', '--no-edit']);
  } else {
    console.log(`  ${fmt.dim('○')} No changes to amend ${fmt.dim('— already clean')}`);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

const totalMs = Date.now() - startTime;
const passed = results.filter((r) => r.status === 'pass').length;
const failed = results.filter((r) => r.status === 'fail').length;
const skipped = results.filter((r) => r.status === 'skip').length;

console.log(`\n${'─'.repeat(48)}`);
console.log(
  `  ${fmt.green('Passed:')} ${passed}   ${fmt.red('Failed:')} ${failed}   ${fmt.yellow('Skipped:')} ${skipped}   ${fmt.dim('Total:')} ${formatMs(totalMs)}`,
);
console.log(`${'─'.repeat(48)}`);

// Machine-readable JSON output
if (process.env.AGENT_JSON || args.includes('--json')) {
  const json = {
    success: allPassed,
    mode: doFix ? 'fix' : 'check',
    steps: results,
    totalMs,
  };
  console.log('\n--- JSON ---');
  console.log(JSON.stringify(json, null, 2));
}

if (!allPassed) {
  console.log(
    `\n${fmt.red('⛔')} Pre-push check failed. ${doFix ? 'Fix issues manually.' : 'Run with --fix to auto-fix.'}\n`,
  );
  process.exit(1);
}

console.log(`\n${fmt.green('✅')} Pre-push check passed — safe to push.\n`);
