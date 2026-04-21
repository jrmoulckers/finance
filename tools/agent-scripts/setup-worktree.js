#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// Setup Worktree — Create and initialize a git worktree for agent work
// =============================================================================
//
// Usage:
//   node tools/agent-scripts/setup-worktree.js <agent-type> <branch-type> <description> <issue-number>
//
// Example:
//   node tools/agent-scripts/setup-worktree.js android feat widgets 381
//   → Creates worktree at ../wt-android-feat-widgets-381
//   → Branch: android/feat/widgets-381
//   → Runs npm install if needed
//
// Output: JSON { worktreePath, branch, created, npmInstalled }
// =============================================================================

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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

if (args.includes('--help') || args.includes('-h') || args.length < 4) {
  console.log(`
${fmt.bold('Finance — Setup Worktree')}

Creates a git worktree for agent work with automatic npm install.

${fmt.bold('Usage:')}
  node tools/agent-scripts/setup-worktree.js <agent-type> <branch-type> <description> <issue-number>

${fmt.bold('Arguments:')}
  agent-type     Agent identifier (android, ios, web, windows, devops, docs, core)
  branch-type    Branch type (feat, fix, chore, refactor, docs, test, ci)
  description    Short kebab-case description (e.g. widgets, auth-flow)
  issue-number   GitHub issue number

${fmt.bold('Example:')}
  node tools/agent-scripts/setup-worktree.js android feat widgets 381
  → Worktree: ../wt-android-feat-widgets-381
  → Branch:   android/feat/widgets-381

${fmt.bold('Output:')}
  JSON object with worktreePath, branch, created, npmInstalled
`);
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const [agentType, branchType, description, issueNumber] = args;

// Validate inputs
const validAgents = ['android', 'ios', 'web', 'windows', 'devops', 'docs', 'core', 'security'];
const validTypes = ['feat', 'fix', 'chore', 'refactor', 'docs', 'test', 'ci', 'perf'];

if (!validAgents.includes(agentType)) {
  console.error(
    `${fmt.red('Error:')} Invalid agent-type "${agentType}". Valid: ${validAgents.join(', ')}`,
  );
  process.exit(1);
}

if (!validTypes.includes(branchType)) {
  console.error(
    `${fmt.red('Error:')} Invalid branch-type "${branchType}". Valid: ${validTypes.join(', ')}`,
  );
  process.exit(1);
}

if (!/^\d+$/.test(issueNumber)) {
  console.error(
    `${fmt.red('Error:')} issue-number must be a positive integer, got "${issueNumber}"`,
  );
  process.exit(1);
}

// ── Git helpers ──────────────────────────────────────────────────────────────

/**
 * Run a command and return trimmed stdout.
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {object} [opts]
 * @returns {string}
 */
function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();
}

/**
 * Run a command silently, returning true on success.
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @param {object} [opts]
 * @returns {boolean}
 */
function tryRun(cmd, cmdArgs, opts = {}) {
  try {
    run(cmd, cmdArgs, opts);
    return true;
  } catch {
    return false;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

const worktreeName = `wt-${agentType}-${branchType}-${description}-${issueNumber}`;
const worktreePath = path.resolve(ROOT, '..', worktreeName);
const branch = `${agentType}/${branchType}/${description}-${issueNumber}`;

const result = {
  worktreePath,
  worktreeName,
  branch,
  created: false,
  resumed: false,
  npmInstalled: false,
};

console.log(`\n${fmt.bold('🌳 Finance — Setup Worktree')}`);
console.log(`${'─'.repeat(52)}`);
console.log(`  Agent:     ${fmt.cyan(agentType)}`);
console.log(`  Type:      ${branchType}`);
console.log(`  Desc:      ${description}`);
console.log(`  Issue:     #${issueNumber}`);
console.log(`  Branch:    ${fmt.bold(branch)}`);
console.log(`  Worktree:  ${fmt.dim(worktreePath)}`);
console.log('');

// Check if worktree already exists
if (fs.existsSync(worktreePath)) {
  // Check if it's a valid git worktree
  if (fs.existsSync(path.join(worktreePath, '.git'))) {
    console.log(`${fmt.yellow('⚠')}  Worktree already exists — resuming.`);
    result.resumed = true;
  } else {
    console.error(
      `${fmt.red('Error:')} Directory exists but is not a git worktree: ${worktreePath}`,
    );
    process.exit(1);
  }
} else {
  // Fetch latest main
  console.log(fmt.dim('  Fetching origin/main...'));
  tryRun('git', ['fetch', 'origin', 'main']);

  // Check if branch already exists locally or on remote
  let branchExists = false;
  try {
    run('git', ['rev-parse', '--verify', branch]);
    branchExists = true;
  } catch {
    // Check remote
    try {
      run('git', ['rev-parse', '--verify', `origin/${branch}`]);
      branchExists = true;
    } catch {
      // Branch doesn't exist anywhere — will create fresh
    }
  }

  if (branchExists) {
    console.log(fmt.dim(`  Branch ${branch} exists — creating worktree from it...`));
    try {
      run('git', ['worktree', 'add', worktreePath, branch]);
    } catch (err) {
      console.error(`${fmt.red('Error:')} Failed to create worktree: ${err.stderr || err.message}`);
      process.exit(1);
    }
  } else {
    console.log(fmt.dim(`  Creating new branch ${branch} from origin/main...`));
    try {
      run('git', ['worktree', 'add', '-b', branch, worktreePath, 'origin/main']);
    } catch (err) {
      console.error(`${fmt.red('Error:')} Failed to create worktree: ${err.stderr || err.message}`);
      process.exit(1);
    }
  }

  result.created = true;
  console.log(`${fmt.green('✓')}  Worktree created.`);
}

// Check if npm install is needed
const nodeModulesPath = path.join(worktreePath, 'node_modules');

if (!fs.existsSync(nodeModulesPath)) {
  console.log(fmt.dim('  Running npm install --ignore-scripts...'));
  try {
    execFileSync('npm', ['install', '--ignore-scripts'], {
      cwd: worktreePath,
      encoding: 'utf8',
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    result.npmInstalled = true;
    console.log(`${fmt.green('✓')}  npm install complete.`);
  } catch (err) {
    console.error(`${fmt.yellow('⚠')}  npm install failed — you may need to run it manually.`);
    console.error(fmt.dim(`  ${err.message}`));
  }
} else {
  console.log(fmt.dim('  node_modules exists — skipping npm install.'));
}

// ── Output ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(52)}`);
console.log(`${fmt.green('✅')} Worktree ready!`);
console.log(`\n  cd ${result.worktreePath}\n`);

// Machine-readable JSON output
if (process.env.AGENT_JSON || args.includes('--json')) {
  console.log('\n--- JSON ---');
  console.log(JSON.stringify(result, null, 2));
}
