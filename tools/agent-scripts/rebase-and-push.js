#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// Rebase and Push — Rebase onto origin/main, run checks, and push
// =============================================================================
//
// Usage:
//   node tools/agent-scripts/rebase-and-push.js <branch>
//   node tools/agent-scripts/rebase-and-push.js           # uses current branch
//
// Steps:
//   1. Fetch origin/main
//   2. Rebase branch onto origin/main
//   3. If conflicts → report conflicting files and exit 1
//   4. If clean → run pre-push-check.js --fix
//   5. Push with --force-with-lease --no-verify
//
// Exit codes: 0 = success, 1 = conflicts or check failure
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

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const flagArgs = process.argv.slice(2);

if (flagArgs.includes('--help') || flagArgs.includes('-h')) {
  console.log(`
${fmt.bold('Finance — Rebase and Push')}

Rebases the current branch onto origin/main, runs pre-push checks,
and pushes with --force-with-lease.

${fmt.bold('Usage:')}
  node tools/agent-scripts/rebase-and-push.js [branch]

${fmt.bold('Arguments:')}
  branch    Branch to rebase and push (default: current branch)

${fmt.bold('Options:')}
  --json    Output machine-readable JSON
  --help    Show this help message

${fmt.bold('Steps:')}
  1. git fetch origin main
  2. git rebase origin/main
  3. If conflicts → report files and exit 1
  4. Run pre-push-check.js --fix
  5. git push --force-with-lease --no-verify
`);
  process.exit(0);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Run a command and return trimmed stdout.
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {object} [opts]
 * @returns {string}
 */
function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HUSKY: '0' },
    ...opts,
  }).trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(`\n${fmt.bold('🔄 Finance — Rebase and Push')}`);
console.log(`${'─'.repeat(52)}`);

// Determine branch
let branch = args[0];
if (!branch) {
  try {
    branch = run('git', ['branch', '--show-current']);
  } catch {
    console.error(`${fmt.red('Error:')} Could not determine current branch.`);
    process.exit(1);
  }
}

if (branch === 'main' || branch === 'master') {
  console.error(`${fmt.red('Error:')} Cannot rebase-and-push to ${branch}. Use a feature branch.`);
  process.exit(1);
}

console.log(`  Branch: ${fmt.cyan(branch)}`);
console.log('');

const result = {
  branch,
  fetchSuccess: false,
  rebaseSuccess: false,
  conflicts: [],
  checksSuccess: false,
  pushSuccess: false,
};

// Step 1: Fetch origin/main
console.log(fmt.dim('  Fetching origin/main...'));
try {
  run('git', ['fetch', 'origin', 'main']);
  result.fetchSuccess = true;
  console.log(`  ${fmt.green('✓')} Fetched origin/main`);
} catch (err) {
  console.error(`  ${fmt.red('✗')} Fetch failed: ${err.stderr || err.message}`);
  outputResult(result);
  process.exit(1);
}

// Step 2: Rebase onto origin/main
console.log(fmt.dim('  Rebasing onto origin/main...'));
try {
  run('git', ['rebase', 'origin/main']);
  result.rebaseSuccess = true;
  console.log(`  ${fmt.green('✓')} Rebase successful — no conflicts`);
} catch (err) {
  // Rebase failed — check for conflicts
  console.log(`  ${fmt.red('✗')} Rebase failed — checking for conflicts...`);

  try {
    const status = run('git', ['status', '--porcelain']);
    const conflictFiles = status
      .split('\n')
      .filter((line) => line.startsWith('UU') || line.startsWith('AA') || line.startsWith('UD'))
      .map((line) => line.slice(3).trim());

    if (conflictFiles.length > 0) {
      result.conflicts = conflictFiles;
      console.log('');
      console.log(`  ${fmt.red('⚠ Merge conflicts in')} ${conflictFiles.length} file(s):`);
      for (const file of conflictFiles) {
        console.log(`    ${fmt.red('•')} ${file}`);
      }
    } else {
      console.log(`  ${fmt.red('Rebase error:')} ${err.stderr || err.message}`);
    }
  } catch {
    console.log(`  ${fmt.red('Rebase error:')} ${err.stderr || err.message}`);
  }

  // Abort the rebase so the working tree is clean
  try {
    run('git', ['rebase', '--abort']);
    console.log(fmt.dim('\n  Rebase aborted — working tree restored.'));
  } catch {
    // Already aborted or not in rebase state
  }

  console.log(`\n${fmt.red('⛔')} Resolve conflicts manually, then run this script again.\n`);
  outputResult(result);
  process.exit(1);
}

// Step 3: Run pre-push checks with --fix
console.log('');
console.log(fmt.dim('  Running pre-push checks with --fix...'));
try {
  execFileSync('node', [path.join(__dirname, 'pre-push-check.js'), '--fix'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, HUSKY: '0' },
  });
  result.checksSuccess = true;
} catch {
  console.log(`\n  ${fmt.red('✗')} Pre-push checks failed after rebase.`);
  console.log(`  Fix the issues and run: node tools/agent-scripts/pre-push-check.js --fix\n`);
  outputResult(result);
  process.exit(1);
}

// Step 4: Push with --force-with-lease
console.log(fmt.dim('  Pushing with --force-with-lease...'));
try {
  run('git', ['push', '--force-with-lease', '--no-verify', 'origin', branch]);
  result.pushSuccess = true;
  console.log(`  ${fmt.green('✓')} Pushed ${branch}`);
} catch (err) {
  console.error(`  ${fmt.red('✗')} Push failed: ${err.stderr || err.message}`);
  outputResult(result);
  process.exit(1);
}

// ── Output ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(52)}`);
console.log(`${fmt.green('✅')} Rebase and push complete for ${fmt.cyan(branch)}\n`);
outputResult(result);

/**
 * Print machine-readable JSON if requested.
 * @param {object} data
 */
function outputResult(data) {
  if (process.env.AGENT_JSON || flagArgs.includes('--json')) {
    console.log('--- JSON ---');
    console.log(JSON.stringify(data, null, 2));
  }
}
