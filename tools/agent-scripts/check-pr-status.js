#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// Check PR Status — Query GitHub PR checks and mergeable status
// =============================================================================
//
// Usage:
//   node tools/agent-scripts/check-pr-status.js <pr-number>
//   node tools/agent-scripts/check-pr-status.js 381
//
// Output: JSON with check counts, individual check details, and merge status
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
const prNumber = args.find((a) => /^\d+$/.test(a));

if (args.includes('--help') || args.includes('-h') || !prNumber) {
  console.log(`
${fmt.bold('Finance — Check PR Status')}

Queries GitHub for a PR's check status and mergeability.

${fmt.bold('Usage:')}
  node tools/agent-scripts/check-pr-status.js <pr-number>

${fmt.bold('Arguments:')}
  pr-number    GitHub PR number (required)

${fmt.bold('Options:')}
  --json       Output only machine-readable JSON (no human output)
  --help, -h   Show this help message

${fmt.bold('Example:')}
  node tools/agent-scripts/check-pr-status.js 381
`);
  process.exit(prNumber ? 0 : 1);
}

const jsonOnly = args.includes('--json');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Run a command and return trimmed stdout.
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @returns {string}
 */
function run(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────

const result = {
  prNumber: parseInt(prNumber, 10),
  title: '',
  state: '',
  branch: '',
  base: '',
  mergeable: 'UNKNOWN',
  reviewDecision: 'UNKNOWN',
  checks: {
    pass: 0,
    fail: 0,
    pending: 0,
    total: 0,
    status: 'unknown',
  },
  details: [],
};

// Get PR metadata
try {
  const prJson = run('gh', [
    'pr',
    'view',
    prNumber,
    '--json',
    'number,title,state,headRefName,baseRefName,mergeable,reviewDecision',
  ]);
  const pr = JSON.parse(prJson);
  result.title = pr.title || '';
  result.state = pr.state || '';
  result.branch = pr.headRefName || '';
  result.base = pr.baseRefName || '';
  result.mergeable = pr.mergeable || 'UNKNOWN';
  result.reviewDecision = pr.reviewDecision || 'UNKNOWN';
} catch (err) {
  if (!jsonOnly) {
    console.error(
      `${fmt.red('Error:')} Could not fetch PR #${prNumber}: ${err.stderr || err.message}`,
    );
  }
  if (jsonOnly) {
    console.log(JSON.stringify({ error: `PR #${prNumber} not found`, ...result }, null, 2));
  }
  process.exit(1);
}

// Get check status
try {
  const checksJson = run('gh', [
    'pr',
    'checks',
    prNumber,
    '--json',
    'name,state,conclusion,startedAt,completedAt',
  ]);
  const checks = JSON.parse(checksJson);

  let pass = 0;
  let fail = 0;
  let pending = 0;

  for (const check of checks) {
    const detail = {
      name: check.name,
      state: check.state,
      conclusion: check.conclusion || null,
    };

    if (check.state === 'COMPLETED') {
      if (check.conclusion === 'SUCCESS' || check.conclusion === 'NEUTRAL') {
        detail.status = 'pass';
        pass++;
      } else {
        detail.status = 'fail';
        fail++;
      }
    } else {
      detail.status = 'pending';
      pending++;
    }

    result.details.push(detail);
  }

  result.checks = {
    pass,
    fail,
    pending,
    total: checks.length,
    status: fail > 0 ? 'failing' : pending > 0 ? 'pending' : pass > 0 ? 'passing' : 'none',
  };
} catch {
  // No checks available yet — that's fine
  result.checks.status = 'none';
}

// ── Human-readable output ────────────────────────────────────────────────────

if (!jsonOnly) {
  console.log(`\n${fmt.bold('📊 Finance — PR Status')}`);
  console.log(`${'─'.repeat(52)}`);
  console.log(`  PR:       #${result.prNumber} — ${result.title}`);
  console.log(`  State:    ${result.state}`);
  console.log(`  Branch:   ${fmt.cyan(result.branch)} → ${result.base}`);
  console.log(`  Merge:    ${formatMergeable(result.mergeable)}`);
  console.log(`  Review:   ${formatReview(result.reviewDecision)}`);
  console.log('');

  // Check summary
  const { pass, fail, pending, total } = result.checks;
  const statusIcon =
    fail > 0 ? fmt.red('✗') : pending > 0 ? fmt.yellow('◷') : pass > 0 ? fmt.green('✓') : '—';
  console.log(
    `  Checks:   ${statusIcon} ${fmt.green(`${pass} pass`)} / ${fmt.red(`${fail} fail`)} / ${fmt.yellow(`${pending} pending`)} (${total} total)`,
  );

  // Individual checks
  if (result.details.length > 0) {
    console.log('');
    for (const d of result.details) {
      const icon =
        d.status === 'pass' ? fmt.green('✓') : d.status === 'fail' ? fmt.red('✗') : fmt.yellow('◷');
      console.log(`    ${icon} ${d.name}`);
    }
  }

  console.log(`\n${'─'.repeat(52)}\n`);
}

// ── JSON output ──────────────────────────────────────────────────────────────

if (jsonOnly || process.env.AGENT_JSON) {
  console.log(
    jsonOnly ? JSON.stringify(result, null, 2) : `--- JSON ---\n${JSON.stringify(result, null, 2)}`,
  );
}

// ── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Format mergeable status with color.
 * @param {string} status
 * @returns {string}
 */
function formatMergeable(status) {
  switch (status) {
    case 'MERGEABLE':
      return fmt.green('Mergeable');
    case 'CONFLICTING':
      return fmt.red('Conflicts');
    case 'UNKNOWN':
      return fmt.yellow('Unknown');
    default:
      return fmt.dim(status);
  }
}

/**
 * Format review decision with color.
 * @param {string} decision
 * @returns {string}
 */
function formatReview(decision) {
  switch (decision) {
    case 'APPROVED':
      return fmt.green('Approved');
    case 'CHANGES_REQUESTED':
      return fmt.red('Changes requested');
    case 'REVIEW_REQUIRED':
      return fmt.yellow('Review required');
    default:
      return fmt.dim(decision || 'None');
  }
}
