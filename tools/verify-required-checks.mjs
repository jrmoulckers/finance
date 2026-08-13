#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1
//
// verify-required-checks.mjs
// -----------------------------------------------------------------------------
// Robustly gate a production deploy on a required aggregate check-run (by
// default the "Required Checks Gatekeeper" produced by ci-security.yml) for a
// specific commit SHA, using the GitHub check-runs REST API directly.
//
// Why this exists (issue #3915):
//   The gatekeeper job `needs:` the ~20-30 min CodeQL/security jobs, so GitHub
//   does not CREATE its check-run until those upstream jobs finish. A staging
//   deploy finishes quickly and triggers promotion, so the deploy's wait step
//   used to look for a gatekeeper check-run that legitimately does not exist yet
//   and hard-failed with "The requested check was never run against this ref".
//   A fixed discovery timeout (even 600s) cannot reliably outlast CodeQL.
//
// Behaviour (fail-closed, security-preserving):
//   - PASS  → the gatekeeper check-run COMPLETED with an allowed conclusion
//             (default: success, skipped). Exit 0.
//   - FAIL  → the gatekeeper check-run COMPLETED with a disallowed conclusion
//             (failure, cancelled, timed_out, ...). Exit 1 immediately — do not
//             keep waiting on a genuine failure.
//   - WAIT  → the gatekeeper check-run is missing / queued / in_progress. Keep
//             polling until the deadline, because it is created late by design.
//   - At the deadline with no PASS → exit 1 (never deploy an ungated SHA),
//             reporting whether the check-run was never seen vs. never completed.
//
// Usage:
//   node tools/verify-required-checks.mjs --sha <commit-sha> [options]
//
// Options (env fallbacks in brackets):
//   --sha <sha>                 Commit SHA to verify.            [VERIFY_SHA, GITHUB_SHA]
//   --repo <owner/name>         Repository.                      [GITHUB_REPOSITORY]
//   --check-name <name>         Required check-run name.
//                               [VERIFY_CHECK_NAME] (default: "Required Checks Gatekeeper")
//   --allowed-conclusions a,b   Comma-separated allowed conclusions.
//                               [VERIFY_ALLOWED_CONCLUSIONS] (default: "success,skipped")
//   --timeout <seconds>         Overall wait budget.             [VERIFY_TIMEOUT] (default: 1800)
//   --interval <seconds>        Poll interval.                   [VERIFY_INTERVAL] (default: 20)
//   --self-test                 Run the built-in assertions and exit.
//   --help                      Show this help.
//
// Auth: reads a token from GITHUB_TOKEN (or GH_TOKEN). Needs `checks: read`.
// -----------------------------------------------------------------------------

import { pathToFileURL } from 'node:url';

const DEFAULT_CHECK_NAME = 'Required Checks Gatekeeper';
const DEFAULT_ALLOWED = ['success', 'skipped'];
const DEFAULT_TIMEOUT_SECONDS = 1800;
const DEFAULT_INTERVAL_SECONDS = 20;

/**
 * Pick the most recently started check-run matching `name`.
 * The API can return several runs sharing a name across suites; the newest
 * (by started_at, then id) is the authoritative one.
 * @param {Array<object>} runs
 * @param {string} name
 * @returns {object | null}
 */
export function selectLatestCheckRun(runs, name) {
  const matches = (runs ?? []).filter((run) => run && run.name === name);
  if (matches.length === 0) return null;
  return matches.reduce((latest, run) => {
    const a = Date.parse(run.started_at ?? '') || 0;
    const b = Date.parse(latest.started_at ?? '') || 0;
    if (a !== b) return a > b ? run : latest;
    return (run.id ?? 0) > (latest.id ?? 0) ? run : latest;
  });
}

/**
 * Classify a gatekeeper check-run into a deploy-gate decision.
 * @param {object | null} run  The selected check-run, or null if absent.
 * @param {string[]} allowedConclusions
 * @returns {{ decision: 'missing' | 'pending' | 'pass' | 'fail', conclusion: string | null }}
 */
export function classifyGatekeeper(run, allowedConclusions = DEFAULT_ALLOWED) {
  if (!run) return { decision: 'missing', conclusion: null };
  if (run.status !== 'completed')
    return { decision: 'pending', conclusion: run.conclusion ?? null };
  const conclusion = run.conclusion ?? null;
  if (conclusion && allowedConclusions.includes(conclusion)) {
    return { decision: 'pass', conclusion };
  }
  return { decision: 'fail', conclusion };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
        opts.help = true;
        break;
      case '--self-test':
        opts.selfTest = true;
        break;
      case '--sha':
        opts.sha = argv[++i];
        break;
      case '--repo':
        opts.repo = argv[++i];
        break;
      case '--check-name':
        opts.checkName = argv[++i];
        break;
      case '--allowed-conclusions':
        opts.allowed = argv[++i];
        break;
      case '--timeout':
        opts.timeout = argv[++i];
        break;
      case '--interval':
        opts.interval = argv[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function resolveConfig(opts) {
  const sha = opts.sha ?? process.env.VERIFY_SHA ?? process.env.GITHUB_SHA;
  const repo = opts.repo ?? process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const checkName = opts.checkName ?? process.env.VERIFY_CHECK_NAME ?? DEFAULT_CHECK_NAME;
  const allowed = (
    opts.allowed ??
    process.env.VERIFY_ALLOWED_CONCLUSIONS ??
    DEFAULT_ALLOWED.join(',')
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const timeoutSeconds = Number(
    opts.timeout ?? process.env.VERIFY_TIMEOUT ?? DEFAULT_TIMEOUT_SECONDS,
  );
  const intervalSeconds = Number(
    opts.interval ?? process.env.VERIFY_INTERVAL ?? DEFAULT_INTERVAL_SECONDS,
  );

  const errors = [];
  if (!sha) errors.push('A commit SHA is required (--sha or VERIFY_SHA/GITHUB_SHA).');
  if (!repo) errors.push('A repository is required (--repo or GITHUB_REPOSITORY).');
  if (!token) errors.push('A token is required (GITHUB_TOKEN or GH_TOKEN).');
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0)
    errors.push('--timeout must be a positive number.');
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0)
    errors.push('--interval must be a positive number.');
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  return { sha, repo, token, checkName, allowed, timeoutSeconds, intervalSeconds };
}

async function fetchCheckRuns({ repo, sha, token }) {
  const runs = [];
  let page = 1;
  // Paginate defensively; a busy SHA can carry many check-runs.
  for (;;) {
    const url = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100&page=${page}`;
    const response = await globalThis.fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'finance-verify-required-checks',
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `GitHub API ${response.status} ${response.statusText} while listing check-runs: ${body.slice(0, 300)}`,
      );
    }
    const payload = await response.json();
    const pageRuns = payload.check_runs ?? [];
    runs.push(...pageRuns);
    if (pageRuns.length < 100) break;
    page += 1;
  }
  return runs;
}

const sleep = (seconds) => new Promise((done) => setTimeout(done, seconds * 1000));

/*
 * Report builders.
 *
 * These were inline template literals inside `run()`. A sentinel mutation sweep (issue #4303)
 * found 0 of this tool's 35 interpolation sites asserted by any test -- not because the tests
 * were weak, but because `run()` is an async polling loop that reaches the network, so no test
 * could call the code that produces the sentences. Extraction is the precondition for assertion;
 * it does not by itself supply one, so each builder below has a test that reads its values.
 *
 * These sentences are the durable record of why a deploy was permitted or refused. An unasserted
 * deploy-gate report can degrade to naming the wrong SHA, the wrong check, or the wrong
 * conclusion while the gate still exits with the correct status.
 */

/**
 * Build the three startup lines describing what the gate is about to wait for.
 *
 * @param {{checkName: string, repo: string, sha: string, allowed: string[],
 *   timeoutSeconds: number, intervalSeconds: number}} config Resolved configuration.
 * @returns {string[]} Startup lines.
 */
export function startupLines(config) {
  return [
    `Verifying required check "${config.checkName}" on ${config.repo}@${config.sha.slice(0, 12)}`,
    `Allowed conclusions: ${config.allowed.join(', ')}`,
    `Wait budget: ${config.timeoutSeconds}s, poll interval: ${config.intervalSeconds}s`,
  ];
}

/**
 * Build the terminal line for a completed gatekeeper run.
 *
 * @param {'pass' | 'fail'} decision Classification from `classifyGatekeeper`.
 * @param {{checkName: string, conclusion: string | null, sha: string}} context Reporting context.
 * @returns {string} The pass or fail sentence.
 */
export function decisionLine(decision, context) {
  if (decision === 'pass') {
    return `✅ "${context.checkName}" completed with conclusion "${context.conclusion}" — gate passed.`;
  }
  return (
    `❌ "${context.checkName}" completed with disallowed conclusion "${context.conclusion}" — ` +
    `refusing to deploy ${context.sha.slice(0, 12)}.`
  );
}

/**
 * Build the line printed on each poll while the gate is still undecided.
 *
 * @param {{decision: string, checkName: string, status: string | null,
 *   conclusion: string | null, total: number, intervalSeconds: number,
 *   remainingSeconds: number}} state Poll state.
 * @returns {string} The waiting sentence.
 */
export function waitingLine(state) {
  const tail = `Retrying in ${state.intervalSeconds}s (${state.remainingSeconds}s left).`;
  if (state.decision === 'missing') {
    return (
      `⏳ "${state.checkName}" check-run not created yet (it is produced after the ` +
      `security/CodeQL jobs). ${state.total} check-run(s) on SHA so far. ${tail}`
    );
  }
  const conclusion = state.conclusion ? ` (${state.conclusion})` : '';
  return `⏳ "${state.checkName}" is ${state.status}${conclusion} — waiting for completion. ${tail}`;
}

/**
 * Build the fail-closed line printed when the wait budget is exhausted.
 *
 * The three branches are distinguished because they call for different actions: a gatekeeper that
 * never appeared alongside other checks points at the producing workflow, no check-runs at all
 * points at CI not running, and a found-but-incomplete gatekeeper points at a stuck job.
 *
 * @param {{everSawGatekeeper: boolean, sawAnyCheckRuns: boolean, checkName: string,
 *   sha: string, timeoutSeconds: number}} state Terminal state.
 * @returns {string} The timeout sentence.
 */
export function timeoutLine(state) {
  const prefix = `❌ Timed out after ${state.timeoutSeconds}s: "${state.checkName}"`;
  const shaShort = state.sha.slice(0, 12);
  if (state.everSawGatekeeper) {
    return (
      `${prefix} was found but never completed on ${shaShort}. ` +
      'Refusing to deploy an ungated commit.'
    );
  }
  return (
    `${prefix} check-run was never found on ${shaShort}. ` +
    (state.sawAnyCheckRuns
      ? 'Other checks ran but the required gatekeeper did not — did ci-security.yml execute for this commit?'
      : 'No check-runs were found at all — CI may not have run for this commit.')
  );
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return 0;
  }
  if (opts.selfTest) {
    return selfTest();
  }

  const config = resolveConfig(opts);
  const deadline = Date.now() + config.timeoutSeconds * 1000;

  for (const line of startupLines(config)) console.log(line);

  let everSawGatekeeper = false;
  let sawAnyCheckRuns = false;

  for (;;) {
    let allRuns;
    try {
      allRuns = await fetchCheckRuns(config);
    } catch (error) {
      // Transient API/network hiccups should not abort a 30-min gate; log and retry.
      console.warn(`⚠️  ${error.message}`);
      if (Date.now() >= deadline) break;
      await sleep(config.intervalSeconds);
      continue;
    }

    if (allRuns.length > 0) sawAnyCheckRuns = true;
    const gatekeeper = selectLatestCheckRun(allRuns, config.checkName);
    if (gatekeeper) everSawGatekeeper = true;
    const { decision, conclusion } = classifyGatekeeper(gatekeeper, config.allowed);

    if (decision === 'pass') {
      console.log(decisionLine('pass', { ...config, conclusion }));
      return 0;
    }
    if (decision === 'fail') {
      console.error(decisionLine('fail', { ...config, conclusion }));
      return 1;
    }

    if (Date.now() >= deadline) {
      break;
    }

    const remaining = Math.round((deadline - Date.now()) / 1000);
    console.log(
      waitingLine({
        decision,
        checkName: config.checkName,
        status: gatekeeper?.status ?? null,
        conclusion,
        total: allRuns.length,
        intervalSeconds: config.intervalSeconds,
        remainingSeconds: remaining,
      }),
    );
    await sleep(config.intervalSeconds);
  }

  // Fail closed: never promote a SHA whose required gate did not demonstrably pass.
  console.error(timeoutLine({ ...config, everSawGatekeeper, sawAnyCheckRuns }));
  return 1;
}

function printHelp() {
  const header = '\nverify-required-checks.mjs — gate a deploy on a required check-run for a SHA\n';
  console.log(header);
  console.log('Usage: node tools/verify-required-checks.mjs --sha <commit-sha> [options]\n');
  console.log('Options:');
  console.log('  --sha <sha>                 Commit SHA to verify (env: VERIFY_SHA / GITHUB_SHA)');
  console.log('  --repo <owner/name>         Repository (env: GITHUB_REPOSITORY)');
  console.log(
    `  --check-name <name>         Required check-run name (default: "${DEFAULT_CHECK_NAME}")`,
  );
  console.log(
    `  --allowed-conclusions a,b   Allowed conclusions (default: "${DEFAULT_ALLOWED.join(',')}")`,
  );
  console.log(
    `  --timeout <seconds>         Overall wait budget (default: ${DEFAULT_TIMEOUT_SECONDS})`,
  );
  console.log(`  --interval <seconds>        Poll interval (default: ${DEFAULT_INTERVAL_SECONDS})`);
  console.log('  --self-test                 Run built-in assertions and exit');
  console.log('  --help                      Show this help\n');
  console.log('Auth: GITHUB_TOKEN or GH_TOKEN (needs `checks: read`).');
}

function assert(condition, message) {
  if (!condition) throw new Error(`Self-test failed: ${message}`);
}

function selfTest() {
  // selectLatestCheckRun picks the newest run by started_at.
  const runs = [
    {
      id: 1,
      name: 'Required Checks Gatekeeper',
      status: 'completed',
      conclusion: 'failure',
      started_at: '2026-07-18T10:00:00Z',
    },
    {
      id: 2,
      name: 'Required Checks Gatekeeper',
      status: 'completed',
      conclusion: 'success',
      started_at: '2026-07-18T11:00:00Z',
    },
    {
      id: 3,
      name: 'Other Check',
      status: 'completed',
      conclusion: 'failure',
      started_at: '2026-07-18T12:00:00Z',
    },
  ];
  assert(
    selectLatestCheckRun(runs, 'Required Checks Gatekeeper').id === 2,
    'should pick newest matching run',
  );
  assert(selectLatestCheckRun(runs, 'Nope') === null, 'should return null when nothing matches');

  // classifyGatekeeper decisions.
  assert(classifyGatekeeper(null).decision === 'missing', 'null run => missing');
  assert(
    classifyGatekeeper({ name: 'g', status: 'in_progress', conclusion: null }).decision ===
      'pending',
    'in_progress => pending',
  );
  assert(
    classifyGatekeeper({ name: 'g', status: 'queued', conclusion: null }).decision === 'pending',
    'queued => pending',
  );
  assert(
    classifyGatekeeper({ name: 'g', status: 'completed', conclusion: 'success' }).decision ===
      'pass',
    'completed+success => pass',
  );
  assert(
    classifyGatekeeper({ name: 'g', status: 'completed', conclusion: 'skipped' }).decision ===
      'pass',
    'completed+skipped => pass (allowed by default)',
  );
  assert(
    classifyGatekeeper({ name: 'g', status: 'completed', conclusion: 'failure' }).decision ===
      'fail',
    'completed+failure => fail',
  );
  assert(
    classifyGatekeeper({ name: 'g', status: 'completed', conclusion: 'cancelled' }).decision ===
      'fail',
    'completed+cancelled => fail',
  );
  assert(
    classifyGatekeeper({ name: 'g', status: 'completed', conclusion: 'skipped' }, ['success'])
      .decision === 'fail',
    'skipped is fail when not in allowed list',
  );

  console.log('✅ verify-required-checks self-test passed.');
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly || process.env.VERIFY_FORCE_RUN === '1') {
  run()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    });
}
