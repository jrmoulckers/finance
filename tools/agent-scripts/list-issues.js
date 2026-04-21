#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// List Issues — Query GitHub issues filtered by sprint and/or agent label
// =============================================================================
//
// Usage:
//   node tools/agent-scripts/list-issues.js
//   node tools/agent-scripts/list-issues.js --sprint 3
//   node tools/agent-scripts/list-issues.js --agent android
//   node tools/agent-scripts/list-issues.js --sprint 3 --agent android --state open
//
// Output: JSON array of issues
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
${fmt.bold('Finance — List Issues')}

Queries GitHub issues filtered by sprint label and/or agent label.

${fmt.bold('Usage:')}
  node tools/agent-scripts/list-issues.js [options]

${fmt.bold('Options:')}
  --sprint <N>       Filter by sprint label (e.g. "sprint:3")
  --agent <type>     Filter by agent label (e.g. "agent:android")
  --state <state>    Filter by state: open, closed, all (default: open)
  --limit <N>        Maximum issues to return (default: 50)
  --json             Output only machine-readable JSON
  --help, -h         Show this help message

${fmt.bold('Examples:')}
  node tools/agent-scripts/list-issues.js --sprint 3
  node tools/agent-scripts/list-issues.js --agent android --state open
  node tools/agent-scripts/list-issues.js --sprint 3 --agent web --json
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

const sprint = getFlag('--sprint');
const agent = getFlag('--agent');
const state = getFlag('--state') || 'open';
const limit = getFlag('--limit') || '50';
const jsonOnly = args.includes('--json');

// ── Main ─────────────────────────────────────────────────────────────────────

// Build gh issue list command
const ghArgs = [
  'issue',
  'list',
  '--state',
  state,
  '--limit',
  limit,
  '--json',
  'number,title,labels,assignees,state,createdAt,updatedAt',
];

// Add label filters
const labelFilters = [];
if (sprint) labelFilters.push(`sprint:${sprint}`);
if (agent) labelFilters.push(`agent:${agent}`);

for (const label of labelFilters) {
  ghArgs.push('--label', label);
}

let issues = [];

try {
  const output = execFileSync('gh', ghArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  issues = JSON.parse(output);
} catch (err) {
  if (!jsonOnly) {
    console.error(`${fmt.red('Error:')} Failed to list issues: ${err.stderr || err.message}`);
  }
  if (jsonOnly) {
    console.log(JSON.stringify({ error: err.message, issues: [] }, null, 2));
  }
  process.exit(1);
}

// Enrich with parsed labels
const enriched = issues.map((issue) => {
  const labels = (issue.labels || []).map((l) => l.name);
  const sprintLabel = labels.find((l) => l.startsWith('sprint:'));
  const agentLabel = labels.find((l) => l.startsWith('agent:'));

  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    sprint: sprintLabel ? sprintLabel.replace('sprint:', '') : null,
    agent: agentLabel ? agentLabel.replace('agent:', '') : null,
    labels,
    assignees: (issue.assignees || []).map((a) => a.login),
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
});

// ── Output ───────────────────────────────────────────────────────────────────

if (jsonOnly || process.env.AGENT_JSON) {
  console.log(JSON.stringify(enriched, null, 2));
  process.exit(0);
}

// Human-readable output
console.log(`\n${fmt.bold('📋 Finance — Issues')}`);
console.log(`${'─'.repeat(60)}`);

const filterParts = [];
if (sprint) filterParts.push(`sprint:${sprint}`);
if (agent) filterParts.push(`agent:${agent}`);
if (filterParts.length > 0) {
  console.log(`  Filters: ${filterParts.join(', ')}`);
} else {
  console.log(`  Filters: ${fmt.dim('none')}`);
}
console.log(`  State:   ${state}`);
console.log(`  Found:   ${enriched.length} issue(s)`);
console.log('');

if (enriched.length === 0) {
  console.log(fmt.dim('  No issues match the filters.\n'));
  process.exit(0);
}

// Group by sprint if not filtered
const grouped = {};
for (const issue of enriched) {
  const key = issue.sprint || 'unassigned';
  if (!grouped[key]) grouped[key] = [];
  grouped[key].push(issue);
}

for (const [sprintKey, sprintIssues] of Object.entries(grouped)) {
  console.log(`  ${fmt.bold(`Sprint ${sprintKey}:`)} (${sprintIssues.length})`);
  for (const issue of sprintIssues) {
    const agentTag = issue.agent ? fmt.cyan(`[${issue.agent}]`) : '';
    const stateIcon = issue.state === 'OPEN' ? fmt.green('○') : fmt.dim('●');
    console.log(`    ${stateIcon} #${issue.number} ${issue.title} ${agentTag}`);
  }
  console.log('');
}

console.log(`${'─'.repeat(60)}\n`);
