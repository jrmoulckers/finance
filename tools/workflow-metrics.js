#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// Workflow Metrics Collector — AI agent workflow health from the GitHub API
// =============================================================================
//
// Suggested package.json script:
//   "metrics:workflow": "node tools/workflow-metrics.js"
//
// Addresses audit issues #2866 (collector) and #2865 (per-agent acceptance /
// change-request / revert rates). Implements the automation described in
// docs/ai/workflow-metrics.md ("A future improvement is a
// tools/workflow-metrics.js script ...").
//
// Usage:
//   node tools/workflow-metrics.js                 # Markdown + JSON to stdout
//   node tools/workflow-metrics.js --days 30       # Look back 30 days (default 30)
//   node tools/workflow-metrics.js --limit 200     # Max PRs / runs to scan
//   node tools/workflow-metrics.js --json          # JSON only (no markdown)
//   node tools/workflow-metrics.js --markdown      # Markdown only (no JSON)
//   node tools/workflow-metrics.js --out-dir out   # Also write JSON + MD files
//   node tools/workflow-metrics.js --help
//
// Requires: gh CLI authenticated with repo access. If gh is missing or
// unauthenticated the script prints a clear message and exits 0 (so it never
// breaks a scheduled workflow).
//
// Metrics collected (best-effort — where a value cannot be derived it is
// emitted as null with an explanatory `notes` entry):
//   - CI failure rate per PR (failed CI runs / completed CI runs on the PR branch)
//   - Time to merge-ready (PR createdAt -> mergedAt, approximation; see notes)
//   - Fleet runs (issues with PRs from >= 2 distinct agent types)
//   - Per-agent-type acceptance / change-request / revert rates
//
// Output: JSON object + a Markdown summary.
// =============================================================================

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`
Workflow Metrics Collector — Finance AI agent workflow health

Usage:
  node tools/workflow-metrics.js [options]

Options:
  --days <n>      Look-back window in days (default: 30)
  --limit <n>     Max PRs / workflow runs to scan (default: 200)
  --json          Emit JSON only
  --markdown      Emit Markdown only
  --out-dir <d>   Also write workflow-metrics.json and workflow-metrics.md to <d>
  --help, -h      Show this help

Requires: gh CLI (https://cli.github.com/) authenticated via 'gh auth login'
or a GH_TOKEN / GITHUB_TOKEN environment variable.

Degrades gracefully: if gh is missing or unauthenticated, prints a notice and
exits 0.
`);
  process.exit(0);
}

function argVal(name, fallback) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const v = args[i + 1];
  if (v === undefined) return fallback;
  return v;
}

const days = parseInt(argVal('--days', '30'), 10) || 30;
const limit = parseInt(argVal('--limit', '200'), 10) || 200;
const jsonOnly = args.includes('--json');
const markdownOnly = args.includes('--markdown');
const outDir = argVal('--out-dir', null);

// ── Known agent types + scope→agent mapping ──────────────────────────────────
// Branches in this repo do NOT reliably follow "<agent>/<type>/<desc>-<issue>",
// so agent type is derived best-effort from (1) the conventional-commit scope in
// the PR title, then (2) recognizable branch segments. Anything else => unknown.
const AGENT_TYPES = [
  'android',
  'ios',
  'web',
  'windows',
  'devops',
  'docs',
  'core',
  'kmp',
  'backend',
  'qa',
  'security',
  'design',
  'architect',
  'finance',
  'product',
  'business',
  'marketing',
  'accessibility',
];

// Maps a conventional-commit scope / branch keyword to a normalized agent area.
const SCOPE_MAP = {
  web: 'web',
  android: 'android',
  ios: 'ios',
  windows: 'windows',
  desktop: 'windows',
  api: 'backend',
  backend: 'backend',
  services: 'backend',
  service: 'backend',
  db: 'backend',
  supabase: 'backend',
  edge: 'backend',
  design: 'design',
  tokens: 'design',
  ui: 'design',
  ux: 'design',
  deploy: 'devops',
  workflows: 'devops',
  workflow: 'devops',
  ci: 'devops',
  cd: 'devops',
  infra: 'devops',
  tools: 'devops',
  build: 'devops',
  release: 'devops',
  docs: 'docs',
  doc: 'docs',
  architecture: 'architect',
  arch: 'architect',
  adr: 'architect',
  e2e: 'qa',
  qa: 'qa',
  test: 'qa',
  tests: 'qa',
  security: 'security',
  sec: 'security',
  a11y: 'accessibility',
  accessibility: 'accessibility',
  kmp: 'kmp',
  shared: 'kmp',
  core: 'core',
  finance: 'finance',
  product: 'product',
  pm: 'product',
  marketing: 'marketing',
  gtm: 'marketing',
};

function mapScope(token) {
  if (!token) return null;
  const t = token.toLowerCase().trim();
  if (AGENT_TYPES.includes(t)) return t;
  return SCOPE_MAP[t] || null;
}

// ── gh helpers ───────────────────────────────────────────────────────────────
function gh(ghArgs) {
  try {
    return execFileSync('gh', ghArgs, {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 60000,
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

function ghJson(ghArgs) {
  const raw = gh(ghArgs);
  if (raw === null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function hasGh() {
  return gh(['--version']) !== null;
}

function isAuthed() {
  // `gh auth status` exits non-zero when not logged in; gh() returns null then.
  return gh(['auth', 'status']) !== null;
}

// ── Derivation helpers ───────────────────────────────────────────────────────
function agentTypeFromPr(pr) {
  // 1. Conventional-commit scope from the title: "type(scope): subject".
  const title = pr.title || '';
  const scopeMatch = title.match(/^[a-z]+\(([^)]+)\)!?:/i);
  if (scopeMatch) {
    // A scope may be comma-separated (e.g. "web,api"); take the first match.
    for (const part of scopeMatch[1].split(/[,/]/)) {
      const mapped = mapScope(part);
      if (mapped) return mapped;
    }
  }
  // 2. Recognizable branch segments.
  let b = String(pr.headRefName || '').toLowerCase();
  if (b.startsWith('wt-')) b = b.slice(3);
  for (const seg of b.split(/[/-]/)) {
    const mapped = mapScope(seg);
    if (mapped) return mapped;
  }
  return 'unknown';
}

function issueNumberFromPr(pr) {
  // Prefer trailing issue number on the branch (…-381), else first #N in title.
  const branch = pr.headRefName || '';
  const branchMatch = branch.match(/(\d+)\s*$/);
  if (branchMatch) return branchMatch[1];
  const titleMatch = (pr.title || '').match(/#(\d+)/);
  if (titleMatch) return titleMatch[1];
  return null;
}

function hoursBetween(a, b) {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function avg(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round(n, dp = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function pct(part, whole) {
  if (!whole) return null;
  return round((part / whole) * 100, 1);
}

// ── Collection ───────────────────────────────────────────────────────────────
function collect() {
  const notes = [];
  const since = new Date(Date.now() - days * 86_400_000);

  // Repo "owner/name" (best-effort; gh resolves it from the local remote).
  const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);

  const prs =
    ghJson([
      'pr',
      'list',
      '--state',
      'all',
      '--limit',
      String(limit),
      '--json',
      'number,title,headRefName,author,createdAt,mergedAt,closedAt,state,reviewDecision,labels,isDraft',
    ]) || [];

  const runs =
    ghJson([
      'run',
      'list',
      '--limit',
      String(limit),
      '--json',
      'databaseId,headBranch,headSha,event,status,conclusion,createdAt,updatedAt,name,attempt',
    ]) || [];

  if (prs.length === 0) {
    notes.push('No pull requests returned by gh (empty repo, narrow window, or API limit).');
  }
  if (runs.length === 0) {
    notes.push('No workflow runs returned by gh; CI failure rate per PR will be null.');
  }

  // Index PR-event runs by head branch.
  const runsByBranch = new Map();
  for (const r of runs) {
    if (!r.headBranch) continue;
    if (r.event && r.event !== 'pull_request') continue;
    if (r.createdAt && new Date(r.createdAt) < since) continue;
    if (!runsByBranch.has(r.headBranch)) runsByBranch.set(r.headBranch, []);
    runsByBranch.get(r.headBranch).push(r);
  }

  // Per-PR records within the window.
  const inWindow = prs.filter((p) => p.createdAt && new Date(p.createdAt) >= since);
  const perPr = inWindow.map((p) => {
    const branchRuns = runsByBranch.get(p.headRefName) || [];
    const completed = branchRuns.filter((r) => r.status === 'completed');
    const failed = completed.filter(
      (r) => r.conclusion === 'failure' || r.conclusion === 'timed_out',
    ).length;
    const ciFailureRate = completed.length ? pct(failed, completed.length) : null;
    const isRevert =
      /^revert[\s:(]/i.test(p.title || '') || /\brevert\b/i.test(p.headRefName || '');
    return {
      number: p.number,
      title: p.title,
      branch: p.headRefName,
      agentType: agentTypeFromPr(p),
      issue: issueNumberFromPr(p),
      state: p.state,
      merged: Boolean(p.mergedAt),
      reviewDecision: p.reviewDecision || null,
      changesRequested: p.reviewDecision === 'CHANGES_REQUESTED',
      isRevert,
      createdAt: p.createdAt,
      mergedAt: p.mergedAt || null,
      timeToMergeHours: p.mergedAt ? round(hoursBetween(p.createdAt, p.mergedAt), 2) : null,
      ciRunsCompleted: completed.length,
      ciRunsFailed: failed,
      ciFailureRatePct: ciFailureRate,
    };
  });

  // ── CI failure rate (overall, across PRs with run data) ────────────────────
  const prsWithRuns = perPr.filter((p) => p.ciRunsCompleted > 0);
  const totalCompleted = prsWithRuns.reduce((a, p) => a + p.ciRunsCompleted, 0);
  const totalFailed = prsWithRuns.reduce((a, p) => a + p.ciRunsFailed, 0);
  const ciFailureRate = {
    perPrAveragePct: avg(prsWithRuns.map((p) => p.ciFailureRatePct).filter((x) => x !== null)),
    weightedPct: totalCompleted ? pct(totalFailed, totalCompleted) : null,
    prsWithRunData: prsWithRuns.length,
    note:
      prsWithRuns.length === 0
        ? 'No PR-branch workflow runs found in window; gh run list may not cover these branches.'
        : null,
  };
  ciFailureRate.perPrAveragePct = round(ciFailureRate.perPrAveragePct, 1);
  if (ciFailureRate.note) notes.push(ciFailureRate.note);

  // ── Time to merge-ready ────────────────────────────────────────────────────
  const mergeTimes = perPr
    .filter((p) => p.timeToMergeHours !== null)
    .map((p) => p.timeToMergeHours);
  const timeToMergeReady = {
    metric: 'PR createdAt -> mergedAt (hours)',
    medianHours: round(median(mergeTimes), 2),
    averageHours: round(avg(mergeTimes), 2),
    sampleSize: mergeTimes.length,
    note: 'Approximation of CT-2/CT-3. The exact "merge-ready" instant (all checks first green, no conflicts) is not exposed by the API, so creation->merge is used as a proxy.',
  };
  notes.push(timeToMergeReady.note);
  if (mergeTimes.length === 0) {
    timeToMergeReady.medianHours = null;
    timeToMergeReady.averageHours = null;
    notes.push('No merged PRs in window; time-to-merge-ready is null.');
  }

  // ── Fleet runs ─────────────────────────────────────────────────────────────
  // Heuristic: an issue with PRs from >= 2 distinct agent types is a fleet run.
  const byIssue = new Map();
  for (const p of perPr) {
    if (!p.issue) continue;
    if (!byIssue.has(p.issue)) byIssue.set(p.issue, new Set());
    byIssue.get(p.issue).add(p.agentType);
  }
  const fleetIssues = [...byIssue.entries()]
    .filter(([, types]) => {
      const real = [...types].filter((t) => t !== 'unknown');
      return real.length >= 2;
    })
    .map(([issue, types]) => ({ issue, agentTypes: [...types].filter((t) => t !== 'unknown') }));
  const fleetRuns = {
    count: fleetIssues.length,
    issues: fleetIssues,
    note: 'Heuristic: parent issues that received PRs from >= 2 distinct agent types within the window. Branches lacking an agent-type prefix are not counted.',
  };
  notes.push(fleetRuns.note);

  // ── Per-agent-type acceptance / change-request / revert ────────────────────
  const byAgent = new Map();
  for (const p of perPr) {
    const key = p.agentType;
    if (!byAgent.has(key)) {
      byAgent.set(key, {
        agentType: key,
        totalPrs: 0,
        merged: 0,
        closedUnmerged: 0,
        open: 0,
        changesRequested: 0,
        reverts: 0,
        mergeTimes: [],
        ciFailureRates: [],
      });
    }
    const a = byAgent.get(key);
    a.totalPrs += 1;
    if (p.merged) a.merged += 1;
    else if (p.state === 'CLOSED') a.closedUnmerged += 1;
    else a.open += 1;
    if (p.changesRequested) a.changesRequested += 1;
    if (p.isRevert) a.reverts += 1;
    if (p.timeToMergeHours !== null) a.mergeTimes.push(p.timeToMergeHours);
    if (p.ciFailureRatePct !== null) a.ciFailureRates.push(p.ciFailureRatePct);
  }

  const perAgentType = [...byAgent.values()]
    .map((a) => {
      const decided = a.merged + a.closedUnmerged; // resolved PRs
      return {
        agentType: a.agentType,
        totalPrs: a.totalPrs,
        merged: a.merged,
        closedUnmerged: a.closedUnmerged,
        open: a.open,
        // Acceptance = merged / resolved (merged + closed-unmerged).
        acceptanceRatePct: decided ? pct(a.merged, decided) : null,
        changeRequestRatePct: pct(a.changesRequested, a.totalPrs),
        revertRatePct: pct(a.reverts, a.totalPrs),
        medianTimeToMergeHours: round(median(a.mergeTimes), 2),
        avgCiFailureRatePct: round(avg(a.ciFailureRates), 1),
        notes: decided
          ? null
          : 'No resolved PRs yet; acceptance rate is null until PRs merge or close.',
      };
    })
    .sort((x, y) => y.totalPrs - x.totalPrs);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repo: repo || null,
    windowDays: days,
    scanLimit: limit,
    sample: {
      pullRequestsScanned: prs.length,
      pullRequestsInWindow: inWindow.length,
      workflowRunsScanned: runs.length,
    },
    metrics: {
      ciFailureRate,
      timeToMergeReady,
      fleetRuns,
      perAgentType,
    },
    notes: [...new Set(notes)].filter(Boolean),
  };
}

// ── Markdown rendering ───────────────────────────────────────────────────────
function toMarkdown(m) {
  const lines = [];
  lines.push('# Workflow Metrics Report');
  lines.push('');
  lines.push(`- **Generated:** ${m.generatedAt}`);
  lines.push(`- **Repo:** ${m.repo || 'unknown'}`);
  lines.push(`- **Window:** last ${m.windowDays} day(s)`);
  lines.push(
    `- **Sample:** ${m.sample.pullRequestsInWindow} PR(s) in window (${m.sample.pullRequestsScanned} scanned), ${m.sample.workflowRunsScanned} workflow run(s) scanned`,
  );
  lines.push('');

  const ci = m.metrics.ciFailureRate;
  lines.push('## CI Failure Rate (per PR)');
  lines.push('');
  lines.push(`- Per-PR average: **${fmtPct(ci.perPrAveragePct)}**`);
  lines.push(`- Run-weighted: **${fmtPct(ci.weightedPct)}**`);
  lines.push(`- PRs with run data: ${ci.prsWithRunData}`);
  lines.push('');

  const tt = m.metrics.timeToMergeReady;
  lines.push('## Time to Merge-Ready');
  lines.push('');
  lines.push(`- Metric: ${tt.metric}`);
  lines.push(`- Median: **${fmtH(tt.medianHours)}**`);
  lines.push(`- Average: **${fmtH(tt.averageHours)}**`);
  lines.push(`- Sample size: ${tt.sampleSize}`);
  lines.push('');

  const fr = m.metrics.fleetRuns;
  lines.push('## Fleet Runs');
  lines.push('');
  lines.push(`- Detected fleet runs: **${fr.count}**`);
  if (fr.issues.length) {
    for (const i of fr.issues) {
      lines.push(`  - Issue #${i.issue}: ${i.agentTypes.join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Per-Agent-Type');
  lines.push('');
  if (m.metrics.perAgentType.length) {
    lines.push(
      '| Agent | PRs | Merged | Acceptance % | Change-Req % | Revert % | Median TTM (h) | Avg CI fail % |',
    );
    lines.push(
      '| ----- | --- | ------ | ------------ | ------------ | -------- | -------------- | ------------- |',
    );
    for (const a of m.metrics.perAgentType) {
      lines.push(
        `| ${a.agentType} | ${a.totalPrs} | ${a.merged} | ${fmtPct(a.acceptanceRatePct)} | ${fmtPct(
          a.changeRequestRatePct,
        )} | ${fmtPct(a.revertRatePct)} | ${fmtH(a.medianTimeToMergeHours)} | ${fmtPct(
          a.avgCiFailureRatePct,
        )} |`,
      );
    }
  } else {
    lines.push('_No PR data in window._');
  }
  lines.push('');

  if (m.notes.length) {
    lines.push('## Notes & Caveats');
    lines.push('');
    for (const n of m.notes) lines.push(`- ${n}`);
    lines.push('');
  }

  return lines.join('\n');
}

function fmtPct(v) {
  return v === null || v === undefined ? 'N/A' : `${v}%`;
}
function fmtH(v) {
  return v === null || v === undefined ? 'N/A' : `${v}h`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
  if (!hasGh()) {
    process.stdout.write(
      'workflow-metrics: gh CLI not found. Install https://cli.github.com/ to collect metrics. Skipping (exit 0).\n',
    );
    process.exit(0);
  }
  if (!isAuthed()) {
    process.stdout.write(
      'workflow-metrics: gh CLI is not authenticated. Run `gh auth login` or set GH_TOKEN/GITHUB_TOKEN. Skipping (exit 0).\n',
    );
    process.exit(0);
  }

  const metrics = collect();
  const markdown = toMarkdown(metrics);

  if (outDir) {
    const dir = path.isAbsolute(outDir) ? outDir : path.join(ROOT, outDir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-metrics.json'), JSON.stringify(metrics, null, 2));
    fs.writeFileSync(path.join(dir, 'workflow-metrics.md'), markdown + '\n');
    process.stdout.write(`workflow-metrics: wrote JSON + Markdown to ${dir}\n`);
  }

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
  } else if (markdownOnly) {
    process.stdout.write(markdown + '\n');
  } else {
    process.stdout.write(markdown + '\n\n');
    process.stdout.write('```json\n');
    process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
    process.stdout.write('```\n');
  }

  // If running in GitHub Actions, append the Markdown to the job summary.
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
    } catch (err) {
      console.error('Could not write GitHub job summary:', err.message);
    }
  }

  process.exit(0);
}

main();
