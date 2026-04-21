#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// Sprint Status — Dashboard view of the agent fleet
// =============================================================================
//
// Usage:
//   node tools/agent-scripts/sprint-status.js
//   node tools/agent-scripts/sprint-status.js --json
//
// Shows:
//   - Open PRs by agent
//   - Issues by sprint and agent
//   - Active worktree status
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
${fmt.bold('Finance — Sprint Status Dashboard')}

Shows a consolidated view of the agent fleet: open PRs, issues by sprint,
and active worktrees.

${fmt.bold('Usage:')}
  node tools/agent-scripts/sprint-status.js
  node tools/agent-scripts/sprint-status.js --json

${fmt.bold('Options:')}
  --json       Output only machine-readable JSON
  --help, -h   Show this help message
`);
  process.exit(0);
}

const jsonOnly = args.includes('--json');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Run a command and return trimmed stdout, or null on failure.
 * @param {string} cmd
 * @param {string[]} cmdArgs
 * @returns {string | null}
 */
function tryRun(cmd, cmdArgs) {
  try {
    return execFileSync(cmd, cmdArgs, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

// ── Data collection ──────────────────────────────────────────────────────────

const dashboard = {
  timestamp: new Date().toISOString(),
  prs: [],
  issues: {
    bySprint: {},
    byAgent: {},
    total: 0,
  },
  worktrees: [],
};

// 1. Open PRs
const prJson = tryRun('gh', [
  'pr',
  'list',
  '--state',
  'open',
  '--limit',
  '50',
  '--json',
  'number,title,headRefName,author,labels,createdAt,isDraft,reviewDecision',
]);

if (prJson) {
  try {
    const prs = JSON.parse(prJson);
    dashboard.prs = prs.map((pr) => {
      const labels = (pr.labels || []).map((l) => l.name);
      const agentLabel = labels.find((l) => l.startsWith('agent:'));
      // Infer agent from branch name if no label
      const branchAgent = pr.headRefName.split('/')[0];

      return {
        number: pr.number,
        title: pr.title,
        branch: pr.headRefName,
        author: pr.author?.login || 'unknown',
        agent: agentLabel ? agentLabel.replace('agent:', '') : branchAgent || null,
        isDraft: pr.isDraft,
        reviewDecision: pr.reviewDecision || null,
        labels,
        createdAt: pr.createdAt,
      };
    });
  } catch {
    // Parse failure — leave prs empty
  }
}

// 2. Open issues
const issueJson = tryRun('gh', [
  'issue',
  'list',
  '--state',
  'open',
  '--limit',
  '100',
  '--json',
  'number,title,labels,assignees,state',
]);

if (issueJson) {
  try {
    const issues = JSON.parse(issueJson);
    dashboard.issues.total = issues.length;

    for (const issue of issues) {
      const labels = (issue.labels || []).map((l) => l.name);
      const sprintLabel = labels.find((l) => l.startsWith('sprint:'));
      const agentLabel = labels.find((l) => l.startsWith('agent:'));
      const sprint = sprintLabel ? sprintLabel.replace('sprint:', '') : 'unassigned';
      const agent = agentLabel ? agentLabel.replace('agent:', '') : 'unassigned';

      // By sprint
      if (!dashboard.issues.bySprint[sprint]) dashboard.issues.bySprint[sprint] = [];
      dashboard.issues.bySprint[sprint].push({
        number: issue.number,
        title: issue.title,
        agent,
        labels,
      });

      // By agent
      if (!dashboard.issues.byAgent[agent]) dashboard.issues.byAgent[agent] = [];
      dashboard.issues.byAgent[agent].push({
        number: issue.number,
        title: issue.title,
        sprint,
      });
    }
  } catch {
    // Parse failure
  }
}

// 3. Worktrees
const worktreeOutput = tryRun('git', ['worktree', 'list', '--porcelain']);

if (worktreeOutput) {
  const lines = worktreeOutput.split('\n');
  let current = {};

  for (const line of lines) {
    if (line.startsWith('worktree ')) {
      if (current.path) dashboard.worktrees.push(current);
      current = {
        path: line.slice('worktree '.length).trim(),
        branch: '',
        bare: false,
      };
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).trim().replace('refs/heads/', '');
    } else if (line === 'bare') {
      current.bare = true;
    }
  }
  if (current.path) dashboard.worktrees.push(current);

  // Filter out the main worktree — only show agent worktrees
  dashboard.worktrees = dashboard.worktrees.filter(
    (wt) => !wt.bare && wt.branch !== 'main' && wt.branch !== '',
  );
}

// ── Output ───────────────────────────────────────────────────────────────────

if (jsonOnly || process.env.AGENT_JSON) {
  console.log(JSON.stringify(dashboard, null, 2));
  process.exit(0);
}

// Human-readable dashboard
console.log(`\n${fmt.bold('📊 Finance — Sprint Status Dashboard')}`);
console.log(`${'═'.repeat(60)}`);
console.log(fmt.dim(`  ${dashboard.timestamp}`));

// ── Open PRs ─────────────────────────────────────────────────────────────────

console.log(`\n${fmt.bold('  Open PRs')} (${dashboard.prs.length}):`);
console.log(`  ${'─'.repeat(56)}`);

if (dashboard.prs.length === 0) {
  console.log(fmt.dim('    No open PRs.'));
} else {
  // Group by agent
  const prsByAgent = {};
  for (const pr of dashboard.prs) {
    const agent = pr.agent || 'other';
    if (!prsByAgent[agent]) prsByAgent[agent] = [];
    prsByAgent[agent].push(pr);
  }

  for (const [agent, prs] of Object.entries(prsByAgent)) {
    console.log(`\n    ${fmt.cyan(fmt.bold(agent))} (${prs.length}):`);
    for (const pr of prs) {
      const draftTag = pr.isDraft ? fmt.dim(' [draft]') : '';
      const reviewIcon =
        pr.reviewDecision === 'APPROVED'
          ? fmt.green(' ✓')
          : pr.reviewDecision === 'CHANGES_REQUESTED'
            ? fmt.red(' ✗')
            : '';
      console.log(`      #${pr.number} ${pr.title}${draftTag}${reviewIcon}`);
    }
  }
}

// ── Issues by Sprint ─────────────────────────────────────────────────────────

console.log(`\n${fmt.bold('  Issues by Sprint')} (${dashboard.issues.total} total open):`);
console.log(`  ${'─'.repeat(56)}`);

const sprints = Object.keys(dashboard.issues.bySprint).sort((a, b) => {
  if (a === 'unassigned') return 1;
  if (b === 'unassigned') return -1;
  return a.localeCompare(b, undefined, { numeric: true });
});

if (sprints.length === 0) {
  console.log(fmt.dim('    No open issues.'));
} else {
  for (const sprint of sprints) {
    const issues = dashboard.issues.bySprint[sprint];
    console.log(`\n    ${fmt.bold(`Sprint ${sprint}`)} (${issues.length}):`);
    for (const issue of issues.slice(0, 10)) {
      const agentTag = issue.agent !== 'unassigned' ? fmt.cyan(` [${issue.agent}]`) : '';
      console.log(`      #${issue.number} ${issue.title}${agentTag}`);
    }
    if (issues.length > 10) {
      console.log(fmt.dim(`      ... and ${issues.length - 10} more`));
    }
  }
}

// ── Active Worktrees ─────────────────────────────────────────────────────────

console.log(`\n${fmt.bold('  Active Worktrees')} (${dashboard.worktrees.length}):`);
console.log(`  ${'─'.repeat(56)}`);

if (dashboard.worktrees.length === 0) {
  console.log(fmt.dim('    No active agent worktrees.'));
} else {
  for (const wt of dashboard.worktrees) {
    const dirName = path.basename(wt.path);
    console.log(`    ${fmt.cyan('●')} ${dirName}`);
    console.log(`      ${fmt.dim(`branch: ${wt.branch}`)}`);
  }
}

console.log(`\n${'═'.repeat(60)}\n`);
