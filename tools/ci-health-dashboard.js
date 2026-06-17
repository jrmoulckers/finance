#!/usr/bin/env node

/**
 * CI Health Dashboard - Monitor CI pipeline health metrics locally.
 *
 * Usage:
 *   node tools/ci-health-dashboard.js          # Show dashboard
 *   node tools/ci-health-dashboard.js --days 14 # Custom time range
 *   node tools/ci-health-dashboard.js --help    # Show usage
 *
 * Requires: gh CLI authenticated with repo access
 *
 * Displays:
 *   - Workflow success/failure rates
 *   - Average build durations
 *   - Flaky test detection
 *   - Performance trends
 *   - Alerting recommendations
 *
 * Issue: #sprint-9
 */

const { execSync } = require('child_process');
const { resolve } = require('path');

const ROOT = resolve(__dirname, '..');
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
CI Health Dashboard - Finance Monorepo

Usage:
  node tools/ci-health-dashboard.js [options]

Options:
  --days <n>       Number of days to analyze (default: 7)
  --workflows <w>  Comma-separated workflow names to check
  --json           Output JSON results
  --alerts-only    Show only alerts (degraded pipelines)
  --help, -h       Show this help message

Requires: gh CLI (GitHub CLI) authenticated
`);
  process.exit(0);
}

const days = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1], 10) : 7;
const doJson = args.includes('--json');
const alertsOnly = args.includes('--alerts-only');

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;
const fmt = {
  bold: (s) => (supportsColor ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s) => (supportsColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s) => (supportsColor ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (supportsColor ? `\x1b[33m${s}\x1b[0m` : s),
  dim: (s) => (supportsColor ? `\x1b[2m${s}\x1b[0m` : s),
};
const PASS = '\u2705';
const FAIL = '\u274C';
const WARN = '\u26A0\uFE0F';

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe', timeout: 30000 }).trim();
  } catch {
    return null;
  }
}

function hasGhCli() {
  return run('gh --version') !== null;
}

const WORKFLOWS = [
  { file: 'ci-shared.yml', name: 'Shared Packages' },
  { file: 'ci-android.yml', name: 'Android CI' },
  { file: 'ci-ios.yml', name: 'iOS CI' },
  { file: 'ci-web.yml', name: 'Web CI' },
  { file: 'ci-windows.yml', name: 'Windows CI' },
  { file: 'ci-lint.yml', name: 'Lint' },
  { file: 'ci-security.yml', name: 'Security Scan' },
];

function getWorkflowRuns(workflowFile) {
  const result = run(
    `gh run list --workflow="${workflowFile}" --limit=50 --json=status,conclusion,createdAt,updatedAt,event,headBranch,databaseId,attempt`,
  );
  if (!result) return [];
  try {
    return JSON.parse(result);
  } catch {
    return [];
  }
}

function analyzeWorkflow(wf) {
  const runs = getWorkflowRuns(wf.file);
  const since = new Date(Date.now() - days * 86400000);
  const recent = runs.filter((r) => new Date(r.createdAt) >= since);

  const completed = recent.filter((r) => r.status === 'completed');
  const success = completed.filter((r) => r.conclusion === 'success').length;
  const failure = completed.filter((r) => r.conclusion === 'failure').length;
  const total = completed.length;

  const rate = total > 0 ? ((success / total) * 100).toFixed(1) : null;

  // Duration estimate (from created to updated)
  const durations = completed
    .filter((r) => r.createdAt && r.updatedAt)
    .map((r) => (new Date(r.updatedAt) - new Date(r.createdAt)) / 60000)
    .sort((a, b) => a - b);
  const avgDuration =
    durations.length > 0
      ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1)
      : null;
  const p90Duration =
    durations.length > 0 ? durations[Math.floor(durations.length * 0.9)].toFixed(1) : null;

  // Flaky detection: re-runs on same commit
  const reRuns = recent.filter((r) => r.attempt > 1);

  return {
    name: wf.name,
    file: wf.file,
    total,
    success,
    failure,
    rate,
    avgDuration,
    p90Duration,
    flakyRuns: reRuns.length,
    healthy: rate === null || parseFloat(rate) >= 80,
  };
}

function main() {
  console.log('');
  console.log(fmt.bold('\uD83C\uDFE5 Finance - CI Health Dashboard'));
  console.log('\u2550'.repeat(60));
  console.log(`  Period: last ${days} day(s)`);
  console.log(`  Date: ${new Date().toISOString().split('T')[0]}`);

  if (!hasGhCli()) {
    console.log(`\n  ${FAIL} gh CLI not found or not authenticated.`);
    console.log('  Install: https://cli.github.com/');
    console.log('  Auth: gh auth login');
    process.exit(2);
  }

  console.log('\n  Collecting metrics...');
  const results = WORKFLOWS.map(analyzeWorkflow);

  if (!alertsOnly) {
    console.log(fmt.bold('\n\uD83D\uDCCA Pipeline Health'));
    console.log('\u2500'.repeat(60));
    console.log('  Workflow            | Runs | Pass | Fail | Rate   | Avg    | P90');
    console.log('  ' + '\u2500'.repeat(58));

    for (const r of results) {
      const icon =
        r.rate === null
          ? '\u26AA'
          : parseFloat(r.rate) >= 95
            ? '\uD83D\uDFE2'
            : parseFloat(r.rate) >= 80
              ? '\uD83D\uDFE1'
              : '\uD83D\uDD34';
      const name = r.name.padEnd(18);
      const runs = String(r.total).padStart(4);
      const pass = String(r.success).padStart(4);
      const fail = String(r.failure).padStart(4);
      const rate = (r.rate ? r.rate + '%' : 'N/A').padStart(6);
      const avg = (r.avgDuration ? r.avgDuration + 'm' : 'N/A').padStart(6);
      const p90 = (r.p90Duration ? r.p90Duration + 'm' : 'N/A').padStart(6);
      console.log(`  ${icon} ${name} | ${runs} | ${pass} | ${fail} | ${rate} | ${avg} | ${p90}`);
    }

    // Flaky tests
    const flaky = results.filter((r) => r.flakyRuns > 0);
    if (flaky.length > 0) {
      console.log(fmt.bold('\n\uD83C\uDFB2 Flaky Test Detection'));
      console.log('\u2500'.repeat(60));
      for (const r of flaky) {
        console.log(`  ${WARN} ${r.name}: ${r.flakyRuns} re-run(s) in last ${days} days`);
      }
    }
  }

  // Alerts
  const degraded = results.filter((r) => !r.healthy);
  if (degraded.length > 0) {
    console.log(fmt.bold('\n\uD83D\uDEA8 Alerts'));
    console.log('\u2500'.repeat(60));
    for (const r of degraded) {
      console.log(
        `  ${FAIL} ${r.name}: ${r.rate}% success rate (${r.failure}/${r.total} failures)`,
      );
      console.log(
        `    Action: Review workflow logs with "gh run list --workflow=${r.file} --status=failure"`,
      );
    }
  } else {
    console.log(`\n  ${PASS} All pipelines healthy.`);
  }

  // Interpretation
  if (!alertsOnly) {
    console.log(fmt.bold('\n\uD83D\uDCCB Legend'));
    console.log('\u2500'.repeat(60));
    console.log('  \uD83D\uDFE2 >= 95%  Healthy');
    console.log('  \uD83D\uDFE1 80-95%  Needs attention');
    console.log('  \uD83D\uDD34 < 80%   Critical');
  }

  if (doJson) {
    console.log('\n--- CI_HEALTH_JSON ---');
    console.log(
      JSON.stringify({ timestamp: new Date().toISOString(), days, results, degraded }, null, 2),
    );
    console.log('--- END_CI_HEALTH_JSON ---');
  }

  process.exit(degraded.length > 0 ? 1 : 0);
}

main();
