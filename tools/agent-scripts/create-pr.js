#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// Create PR — Push branch and create a GitHub pull request
// =============================================================================
//
// Usage:
//   node tools/agent-scripts/create-pr.js --title "feat(web): add widgets" --body "Details" --closes 381,382 --branch android/feat/widgets-381
//
// Steps:
//   1. Sets HUSKY=0
//   2. Pushes branch with --no-verify
//   3. Creates PR with gh pr create
//   4. Adds Closes #N lines to body
//   5. Polls gh pr checks up to 3 times (30s intervals)
//   6. Returns PR number and check status
//
// Output: JSON { prNumber, prUrl, branch, checks }
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

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${fmt.bold('Finance — Create PR')}

Pushes the current branch and creates a GitHub pull request.

${fmt.bold('Usage:')}
  node tools/agent-scripts/create-pr.js [options]

${fmt.bold('Options:')}
  --title <title>      PR title (required, use conventional commit format)
  --body <body>        PR body/description
  --closes <numbers>   Comma-separated issue numbers to close (e.g. 381,382)
  --branch <branch>    Branch to push (default: current branch)
  --base <base>        Base branch for PR (default: main)
  --draft              Create as draft PR
  --no-checks          Skip polling for check status
  --json               Output machine-readable JSON
  --help, -h           Show this help message

${fmt.bold('Example:')}
  node tools/agent-scripts/create-pr.js \\
    --title "feat(web): add budget widgets (#381)" \\
    --body "Implements the budget widget component" \\
    --closes 381 \\
    --branch web/feat/budget-widgets-381
`);
  process.exit(0);
}

/**
 * Parse a CLI flag value.
 * @param {string} flag
 * @returns {string | undefined}
 */
function getFlag(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const title = getFlag('--title');
const body = getFlag('--body') || '';
const closesRaw = getFlag('--closes') || '';
const branch = getFlag('--branch');
const base = getFlag('--base') || 'main';
const isDraft = args.includes('--draft');
const noChecks = args.includes('--no-checks');

if (!title) {
  console.error(`${fmt.red('Error:')} --title is required.`);
  process.exit(1);
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

// Utility run functions are defined above via `run()` helper.

/**
 * Sleep for ms milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${fmt.bold('📋 Finance — Create PR')}`);
  console.log(`${'─'.repeat(52)}`);

  // Determine branch
  let currentBranch = branch;
  if (!currentBranch) {
    try {
      currentBranch = run('git', ['branch', '--show-current']);
    } catch {
      console.error(`${fmt.red('Error:')} Could not determine current branch.`);
      process.exit(1);
    }
  }

  console.log(`  Branch: ${fmt.cyan(currentBranch)}`);
  console.log(`  Base:   ${base}`);
  console.log(`  Title:  ${title}`);
  console.log(`  Draft:  ${isDraft ? 'yes' : 'no'}`);

  // Build body with Closes lines
  const closeNumbers = closesRaw
    .split(',')
    .map((n) => n.trim())
    .filter((n) => /^\d+$/.test(n));

  let fullBody = body;
  if (closeNumbers.length > 0) {
    const closeLines = closeNumbers.map((n) => `Closes #${n}`).join('\n');
    fullBody = fullBody ? `${fullBody}\n\n${closeLines}` : closeLines;
    console.log(`  Closes: ${closeNumbers.map((n) => `#${n}`).join(', ')}`);
  }

  console.log('');

  // Step 1: Push branch
  console.log(fmt.dim('  Pushing branch...'));
  try {
    run('git', ['push', '--no-verify', 'origin', currentBranch], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(`  ${fmt.green('✓')} Branch pushed`);
  } catch {
    // Push might fail if upstream is already set — try with -u
    try {
      run('git', ['push', '--no-verify', '-u', 'origin', currentBranch], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      console.log(`  ${fmt.green('✓')} Branch pushed (with upstream set)`);
    } catch (err2) {
      console.error(`  ${fmt.red('✗')} Push failed: ${err2.stderr || err2.message}`);
      process.exit(1);
    }
  }

  // Step 2: Check if PR already exists
  let existingPr = null;
  try {
    const prJson = run('gh', ['pr', 'view', currentBranch, '--json', 'number,url,state']);
    existingPr = JSON.parse(prJson);
  } catch {
    // No existing PR — that's fine
  }

  let prNumber;
  let prUrl;

  if (existingPr && existingPr.state === 'OPEN') {
    console.log(
      `  ${fmt.yellow('⚠')} PR #${existingPr.number} already exists — skipping creation.`,
    );
    prNumber = existingPr.number;
    prUrl = existingPr.url;
  } else {
    // Step 3: Create PR
    console.log(fmt.dim('  Creating PR...'));
    const ghArgs = [
      'pr',
      'create',
      '--title',
      title,
      '--body',
      fullBody,
      '--base',
      base,
      '--head',
      currentBranch,
    ];
    if (isDraft) ghArgs.push('--draft');

    try {
      const prOutput = run('gh', ghArgs);
      // gh pr create outputs the PR URL
      prUrl = prOutput;
      // Extract PR number from URL
      const prMatch = prUrl.match(/\/pull\/(\d+)/);
      prNumber = prMatch ? parseInt(prMatch[1], 10) : null;
      console.log(`  ${fmt.green('✓')} PR created: ${prUrl}`);
    } catch (err) {
      console.error(`  ${fmt.red('✗')} PR creation failed: ${err.stderr || err.message}`);
      process.exit(1);
    }
  }

  // Step 4: Poll checks
  const result = {
    prNumber,
    prUrl,
    branch: currentBranch,
    base,
    closes: closeNumbers.map(Number),
    checks: { pass: 0, fail: 0, pending: 0, total: 0, status: 'unknown' },
  };

  if (!noChecks && prNumber) {
    console.log('');
    console.log(fmt.dim('  Polling CI checks...'));

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) {
        console.log(fmt.dim(`  Waiting 30s before poll #${attempt}...`));
        await sleep(30000);
      }

      try {
        const checksJson = run('gh', [
          'pr',
          'checks',
          String(prNumber),
          '--json',
          'name,state,conclusion',
        ]);
        const checks = JSON.parse(checksJson);

        let pass = 0;
        let fail = 0;
        let pending = 0;

        for (const check of checks) {
          if (check.state === 'COMPLETED') {
            if (check.conclusion === 'SUCCESS' || check.conclusion === 'NEUTRAL') {
              pass++;
            } else {
              fail++;
            }
          } else {
            pending++;
          }
        }

        result.checks = {
          pass,
          fail,
          pending,
          total: checks.length,
          status: fail > 0 ? 'failing' : pending > 0 ? 'pending' : 'passing',
        };

        const statusIcon = fail > 0 ? fmt.red('✗') : pending > 0 ? fmt.yellow('◷') : fmt.green('✓');
        console.log(
          `  ${statusIcon} Checks (poll ${attempt}/3): ${fmt.green(`${pass} pass`)} / ${fmt.red(`${fail} fail`)} / ${fmt.yellow(`${pending} pending`)}`,
        );

        // Stop polling if all checks are complete
        if (pending === 0) break;
      } catch {
        console.log(fmt.dim(`  Poll ${attempt}/3: No checks reported yet.`));
      }
    }
  }

  // ── Output ─────────────────────────────────────────────────────────────────

  console.log(`\n${'─'.repeat(52)}`);
  console.log(`${fmt.green('✅')} PR #${prNumber} ready: ${prUrl}`);
  console.log('');

  // Machine-readable JSON output
  if (process.env.AGENT_JSON || args.includes('--json')) {
    console.log('--- JSON ---');
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch((err) => {
  console.error(`${fmt.red('Error:')} ${err.message}`);
  process.exit(1);
});
