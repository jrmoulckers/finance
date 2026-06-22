#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1

// =============================================================================
// AI Eval Runner — scaffold scorecard for agent output against golden tasks
// =============================================================================
//
// Suggested package.json script:
//   "ai:eval": "node tools/ai-eval/run-evals.js"
//
// Addresses audit issue #2862. Loads golden-task fixtures, evaluates a candidate
// agent output against each task's rubric, and prints a scorecard (JSON +
// Markdown). This is an intentional SCAFFOLD: the model-invocation step is left
// as a TODO(human) so a real agent runner can be wired in later. Until then the
// runner scores the automatable rubric checks against either a fixture-provided
// sample candidate or the current repository state, so it always runs and
// produces deterministic output.
//
// Usage:
//   node tools/ai-eval/run-evals.js                # run all golden tasks
//   node tools/ai-eval/run-evals.js --json         # JSON scorecard only
//   node tools/ai-eval/run-evals.js --task <id>    # run a single task by id
//   node tools/ai-eval/run-evals.js --help
//
// Plain Node, no dependencies. Always exits 0 (non-blocking scaffold) unless
// STRICT=1 is set, in which case it exits 1 when any task scores below its
// passThreshold.
// =============================================================================

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..');
const TASKS_DIR = path.join(HERE, 'golden-tasks');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const STRICT = process.env.STRICT === '1' || args.includes('--strict');

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`
AI Eval Runner — Finance monorepo

Usage:
  node tools/ai-eval/run-evals.js              # run all golden tasks
  node tools/ai-eval/run-evals.js --json        # JSON scorecard only
  node tools/ai-eval/run-evals.js --task <id>   # run one task by id
  STRICT=1 node tools/ai-eval/run-evals.js      # exit 1 if any task below threshold

Loads golden-task fixtures from tools/ai-eval/golden-tasks/, evaluates a
candidate agent output against each rubric, and prints a scorecard.

This is a SCAFFOLD — see the TODO(human) in this file for wiring the real agent
runner. Manual rubric items are reported as "pending" and excluded from the
automatable score.
`);
  process.exit(0);
}

function argVal(name, fallback) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1] === undefined ? fallback : args[i + 1];
}

const onlyTask = argVal('--task', null);

// ── Minimal glob matcher (supports **, *, and literals) ──────────────────────
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i += 1;
        if (glob[i + 1] === '/') i += 1; // consume the slash after **
      } else {
        re += '[^/]*';
      }
    } else if ('\\^$+?.()|{}[]'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

function matchesAny(file, patterns) {
  return patterns.some((p) => globToRegExp(p).test(file));
}

// ── Candidate resolution ─────────────────────────────────────────────────────
//
// TODO(human): wire to agent runner.
//   Replace `resolveCandidate` with a call that dispatches the task's issue
//   description to the real agent (e.g. via the GitHub Copilot CLI / agent API),
//   captures the resulting diff, and returns the actual list of files the agent
//   touched plus any produced artifacts. The rubric evaluation below is already
//   structured to consume `{ filesTouched: string[], notes?: string }`.
//
// Until that is wired, the scaffold uses:
//   1. task.sampleCandidate (if present in the fixture) — lets a fixture encode
//      a known-good or known-bad candidate for demonstration/regression; or
//   2. a repo-derived candidate — the subset of expectedFilesTouched that
//      currently exist on disk (so "files-exist" checks are meaningful).
function resolveCandidate(task) {
  if (task.sampleCandidate && Array.isArray(task.sampleCandidate.filesTouched)) {
    return {
      source: 'sampleCandidate',
      filesTouched: task.sampleCandidate.filesTouched,
      notes: task.sampleCandidate.notes || null,
    };
  }
  const existing = (task.expectedFilesTouched || []).filter((f) =>
    fs.existsSync(path.join(ROOT, f)),
  );
  return {
    source: 'repo-derived',
    filesTouched: existing,
    notes: 'Derived from current repo state (scaffold). Wire the agent runner for real output.',
  };
}

// ── Rubric evaluation ────────────────────────────────────────────────────────
function evalRubricItem(item, task, candidate) {
  switch (item.type) {
    case 'files-exist': {
      // All expectedFilesTouched (or item.files) must exist on disk.
      const files = item.files || task.expectedFilesTouched || [];
      const missing = files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
      return {
        automatable: true,
        score: files.length ? (files.length - missing.length) / files.length : 1,
        detail: missing.length ? `missing: ${missing.join(', ')}` : 'all present',
      };
    }
    case 'files-touched': {
      // Candidate must have touched all expected files.
      const files = item.files || task.expectedFilesTouched || [];
      const touched = new Set(candidate.filesTouched);
      const missing = files.filter((f) => !touched.has(f));
      return {
        automatable: true,
        score: files.length ? (files.length - missing.length) / files.length : 1,
        detail: missing.length
          ? `not touched: ${missing.join(', ')}`
          : 'all expected files touched',
      };
    }
    case 'no-forbidden-edits': {
      // Candidate must NOT have touched any forbidden path/glob.
      const patterns = item.patterns || task.forbiddenFilesTouched || [];
      const violations = candidate.filesTouched.filter((f) => matchesAny(f, patterns));
      return {
        automatable: true,
        score: violations.length ? 0 : 1,
        detail: violations.length
          ? `forbidden edits: ${violations.join(', ')}`
          : 'no forbidden edits',
      };
    }
    case 'manual':
    default: {
      return {
        automatable: false,
        score: null,
        detail: item.guidance || 'requires human/model judgement (pending)',
      };
    }
  }
}

function evalTask(task) {
  const candidate = resolveCandidate(task);
  const rubric = Array.isArray(task.rubric) ? task.rubric : [];
  const results = rubric.map((item) => {
    const r = evalRubricItem(item, task, candidate);
    return {
      id: item.id,
      description: item.description || '',
      weight: typeof item.weight === 'number' ? item.weight : 1,
      type: item.type || 'manual',
      ...r,
    };
  });

  const automatable = results.filter((r) => r.automatable);
  const totalWeight = automatable.reduce((a, r) => a + r.weight, 0);
  const weighted = automatable.reduce((a, r) => a + r.weight * r.score, 0);
  const score = totalWeight ? weighted / totalWeight : null;
  const pendingCount = results.length - automatable.length;
  const passThreshold = typeof task.passThreshold === 'number' ? task.passThreshold : 0.8;

  return {
    id: task.id,
    title: task.title || task.id,
    agentType: task.agentType || 'unknown',
    candidateSource: candidate.source,
    automatableScore: score === null ? null : Math.round(score * 1000) / 1000,
    passThreshold,
    passed: score === null ? null : score >= passThreshold,
    pendingManualChecks: pendingCount,
    results,
  };
}

function loadTasks() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  return fs
    .readdirSync(TASKS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const raw = fs.readFileSync(path.join(TASKS_DIR, f), 'utf-8');
      try {
        return { file: f, ...JSON.parse(raw) };
      } catch (e) {
        throw new Error(`Invalid JSON in golden task ${f}: ${e.message}`, {
          cause: e,
        });
      }
    });
}

function main() {
  let tasks = loadTasks();
  if (onlyTask) tasks = tasks.filter((t) => t.id === onlyTask);

  if (tasks.length === 0) {
    process.stdout.write('ai-eval: no golden tasks found (or no match for --task). Exiting 0.\n');
    process.exit(0);
  }

  const scorecards = tasks.map(evalTask);

  if (asJson) {
    process.stdout.write(
      JSON.stringify({ generatedAt: new Date().toISOString(), tasks: scorecards }, null, 2) + '\n',
    );
  } else {
    process.stdout.write('AI Eval Scorecard (scaffold)\n');
    process.stdout.write('============================\n\n');
    for (const sc of scorecards) {
      const scoreStr =
        sc.automatableScore === null ? 'N/A' : `${(sc.automatableScore * 100).toFixed(1)}%`;
      const verdict = sc.passed === null ? 'PENDING' : sc.passed ? 'PASS' : 'FAIL';
      process.stdout.write(`Task: ${sc.id} (${sc.agentType}) — ${sc.title}\n`);
      process.stdout.write(
        `  Candidate: ${sc.candidateSource} | Automatable score: ${scoreStr} ` +
          `(threshold ${(sc.passThreshold * 100).toFixed(0)}%) => ${verdict}\n`,
      );
      if (sc.pendingManualChecks) {
        process.stdout.write(`  Pending manual checks: ${sc.pendingManualChecks}\n`);
      }
      for (const r of sc.results) {
        const mark = !r.automatable ? '·' : r.score >= 1 ? '+' : r.score > 0 ? '~' : 'x';
        const sStr = r.score === null ? 'pending' : `${(r.score * 100).toFixed(0)}%`;
        process.stdout.write(`    ${mark} [${r.id}] ${sStr} — ${r.detail}\n`);
      }
      process.stdout.write('\n');
    }
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = ['### AI Eval Scorecard (scaffold)', ''];
    lines.push('| Task | Agent | Score | Threshold | Verdict | Pending |');
    lines.push('| ---- | ----- | ----- | --------- | ------- | ------- |');
    for (const sc of scorecards) {
      const scoreStr =
        sc.automatableScore === null ? 'N/A' : `${(sc.automatableScore * 100).toFixed(1)}%`;
      const verdict = sc.passed === null ? 'PENDING' : sc.passed ? 'PASS' : 'FAIL';
      lines.push(
        `| ${sc.id} | ${sc.agentType} | ${scoreStr} | ${(sc.passThreshold * 100).toFixed(0)}% | ${verdict} | ${sc.pendingManualChecks} |`,
      );
    }
    lines.push('');
    lines.push('_Scaffold run — manual rubric items are pending until the agent runner is wired._');
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
    } catch (err) {
      console.error('Could not write GitHub job summary:', err.message);
    }
  }

  const failed = scorecards.filter((s) => s.passed === false);
  if (STRICT && failed.length) {
    process.stdout.write(`x ${failed.length} task(s) below threshold (STRICT=1).\n`);
    process.exit(1);
  }
  process.exit(0);
}

main();
