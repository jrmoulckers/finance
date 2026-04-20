#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// Worktree Cleanup — Prune worktrees whose branches are merged to main
// =============================================================================
//
// Usage:
//   node tools/cleanup-worktrees.js            # dry-run (default)
//   node tools/cleanup-worktrees.js --dry-run  # explicit dry-run
//   node tools/cleanup-worktrees.js --force     # actually remove worktrees
//
// Scans the worktrees/ directory for git worktrees, checks whether their
// associated branch has been merged to main (or the branch no longer exists
// on the remote), and offers to remove them.
//
// Issue: #960
// =============================================================================

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const WORKTREES_DIR = path.join(ROOT, 'worktrees');

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

// ── CLI flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${fmt.bold('Finance — Worktree Cleanup')}

Identifies and removes git worktrees whose branches have been merged to main
or no longer exist on the remote.

${fmt.bold('Usage:')}
  node tools/cleanup-worktrees.js              ${fmt.dim('# dry-run (default)')}
  node tools/cleanup-worktrees.js --dry-run    ${fmt.dim('# explicit dry-run')}
  node tools/cleanup-worktrees.js --force      ${fmt.dim('# remove worktrees')}

${fmt.bold('Options:')}
  --dry-run     Show what would be removed without removing (default)
  --force       Actually remove merged/stale worktrees
  --help, -h    Show this help message
`);
  process.exit(0);
}

const forceRemove = args.includes('--force');
const dryRun = !forceRemove;

// ── Git helpers ──────────────────────────────────────────────────────────────

/**
 * Run a git command and return trimmed stdout, or empty string on failure.
 * @param {string[]} gitArgs
 * @returns {string}
 */
function git(gitArgs) {
  try {
    return execFileSync('git', gitArgs, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Get the set of branch names that have been merged into main.
 * @returns {Set<string>}
 */
function getMergedBranches() {
  const raw = git(['branch', '--merged', 'main', '--format=%(refname:short)']);
  if (!raw) return new Set();
  return new Set(
    raw
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean),
  );
}

/**
 * Get the set of remote branch names.
 * @returns {Set<string>}
 */
function getRemoteBranches() {
  const raw = git(['branch', '-r', '--format=%(refname:short)']);
  if (!raw) return new Set();
  return new Set(
    raw
      .split('\n')
      .map((b) => b.trim().replace(/^origin\//, ''))
      .filter(Boolean),
  );
}

/**
 * Parse `git worktree list --porcelain` output into structured data.
 * @returns {{ path: string; branch: string; head: string; bare: boolean }[]}
 */
function listWorktrees() {
  const raw = git(['worktree', 'list', '--porcelain']);
  if (!raw) return [];

  const worktrees = [];
  let current = {};

  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) worktrees.push(current);
      current = { path: line.slice('worktree '.length).trim(), branch: '', head: '', bare: false };
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).trim().replace('refs/heads/', '');
    } else if (line === 'bare') {
      current.bare = true;
    }
  }
  if (current.path) worktrees.push(current);

  return worktrees;
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(`\n${fmt.bold('🧹 Finance — Worktree Cleanup')}`);
console.log(`${'─'.repeat(52)}`);
console.log(`  Mode: ${dryRun ? fmt.yellow('DRY RUN') : fmt.red('FORCE REMOVE')}`);
console.log('');

if (!fs.existsSync(WORKTREES_DIR)) {
  console.log(fmt.dim('  No worktrees/ directory found. Nothing to clean.'));
  process.exit(0);
}

// Fetch latest remote state (read-only operation)
console.log(fmt.dim('  Fetching remote branches...'));
git(['fetch', '--prune', 'origin']);

const mergedBranches = getMergedBranches();
const remoteBranches = getRemoteBranches();
const worktrees = listWorktrees();

// Filter to only worktrees inside the worktrees/ directory
const managedWorktrees = worktrees.filter((wt) => {
  const normalized = path.resolve(wt.path);
  return normalized.startsWith(path.resolve(WORKTREES_DIR));
});

if (managedWorktrees.length === 0) {
  console.log(fmt.dim('  No managed worktrees found in worktrees/ directory.'));
  process.exit(0);
}

console.log(`  Found ${fmt.bold(String(managedWorktrees.length))} worktree(s) in worktrees/\n`);

/** @type {{ wt: typeof managedWorktrees[0]; reason: string }[]} */
const toRemove = [];
const toKeep = [];

for (const wt of managedWorktrees) {
  const branch = wt.branch;

  if (!branch) {
    toRemove.push({ wt, reason: 'detached HEAD (no branch)' });
    continue;
  }

  if (branch === 'main') {
    toKeep.push({ wt, reason: 'main branch' });
    continue;
  }

  if (mergedBranches.has(branch)) {
    toRemove.push({ wt, reason: 'branch merged to main' });
    continue;
  }

  if (!remoteBranches.has(branch)) {
    toRemove.push({ wt, reason: 'branch deleted from remote' });
    continue;
  }

  toKeep.push({ wt, reason: 'active (unmerged, exists on remote)' });
}

// ── Report ───────────────────────────────────────────────────────────────────

if (toRemove.length > 0) {
  console.log(fmt.bold('  Candidates for removal:\n'));
  for (const { wt, reason } of toRemove) {
    const dirName = path.basename(wt.path);
    const branchInfo = wt.branch || fmt.dim('(detached)');
    console.log(`    ${fmt.red('✗')}  ${dirName}`);
    console.log(`       Branch: ${branchInfo}  —  ${fmt.dim(reason)}`);
  }
  console.log('');
}

if (toKeep.length > 0) {
  console.log(fmt.bold('  Keeping:\n'));
  for (const { wt, reason } of toKeep) {
    const dirName = path.basename(wt.path);
    console.log(`    ${fmt.green('✓')}  ${dirName}  ${fmt.dim(`(${reason})`)}`);
  }
  console.log('');
}

// ── Execute removals ─────────────────────────────────────────────────────────

if (toRemove.length === 0) {
  console.log(fmt.green('  ✅ Nothing to clean up — all worktrees are active.\n'));
  process.exit(0);
}

console.log(`${'─'.repeat(52)}`);

if (dryRun) {
  console.log(
    `\n  ${fmt.yellow('⚠️')}  ${fmt.bold(`${toRemove.length} worktree(s)`)} would be removed.`,
  );
  console.log(`  Run with ${fmt.bold('--force')} to actually remove them.\n`);
  process.exit(0);
}

// Force mode — remove worktrees
let removed = 0;
let errors = 0;

for (const { wt } of toRemove) {
  const dirName = path.basename(wt.path);
  process.stdout.write(`  Removing ${dirName}... `);

  try {
    // Remove the git worktree
    execFileSync('git', ['worktree', 'remove', '--force', wt.path], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // If the branch is merged and still exists locally, prune it
    if (wt.branch && wt.branch !== 'main' && mergedBranches.has(wt.branch)) {
      try {
        execFileSync('git', ['branch', '-d', wt.branch], {
          cwd: ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch {
        // Branch may already be deleted — ignore
      }
    }

    console.log(fmt.green('done'));
    removed++;
  } catch (err) {
    console.log(fmt.red('FAILED'));
    console.log(fmt.dim(`       ${err.message || err}`));
    errors++;
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(52)}`);
console.log(
  `  ${fmt.green('Removed:')} ${removed}   ${fmt.red('Errors:')} ${errors}   ${fmt.dim('Kept:')} ${toKeep.length}`,
);
console.log(`${'─'.repeat(52)}\n`);

if (errors > 0) {
  console.log(
    `  ${fmt.yellow('⚠️')}  Some worktrees could not be removed. Check for uncommitted changes.\n`,
  );
  process.exit(1);
}

console.log(fmt.green('  ✅ Cleanup complete!\n'));
