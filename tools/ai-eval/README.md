# AI Output Eval Harness (scaffold)

> Addresses audit issue **#2862** — a repeatable way to measure the quality of
> AI-agent output against a curated set of "golden" tasks.

This directory holds a lightweight, dependency-free **evaluation scaffold** for
agent output. It runs in CI (non-blocking initially) and locally with plain
Node, so it has zero setup cost and never blocks contributors.

## Why

Agent instructions, skills, and MCP configuration change over time. Without a
regression signal, a change that quietly degrades agent output (e.g. an agent
starts editing files it doesn't own, or stops adding tests) can land unnoticed.
A golden-task eval gives us a **scorecard** to catch those regressions.

## Approach

1. **Golden tasks** (`golden-tasks/*.json`) describe a realistic issue: the
   issue text, the responsible agent type, the files we expect the agent to
   touch, the files it must **not** touch, and a weighted **rubric**.
2. A **runner** (`run-evals.js`) loads each task, obtains a **candidate** agent
   output, evaluates it against the rubric, and prints a scorecard (text,
   `--json`, and a GitHub Actions job-summary table).
3. Rubric items are either **automatable** (scored deterministically by the
   runner) or **manual** (scored by a human/model reviewer and reported as
   `pending`). The headline score is the weighted average of the automatable
   items only, so the scaffold is meaningful even before a model is wired in.

### Candidate resolution (the `TODO(human)`)

The runner does **not** yet invoke a real agent. `resolveCandidate()` in
`run-evals.js` is marked with `// TODO(human): wire to agent runner`. Today it
uses, in priority order:

1. `task.sampleCandidate.filesTouched` — a fixture-encoded known-good (or
   known-bad) candidate, useful for regression-testing the scorecard itself; or
2. a **repo-derived** candidate — the subset of `expectedFilesTouched` that
   currently exist on disk.

To make the eval real, replace `resolveCandidate()` so it dispatches the issue
description to the actual agent (GitHub Copilot CLI / agent API), captures the
resulting diff, and returns `{ filesTouched: string[], notes?: string }`. The
rubric evaluation already consumes that shape, so no other code needs to change.

## Golden task schema

```jsonc
{
  "id": "kebab-case-unique-id",
  "title": "Human-readable task title",
  "agentType": "devops", // which agent should handle this
  "issue": { "number": 2866, "description": "..." },
  "expectedFilesTouched": ["tools/x.js"], // files a correct solution creates/edits
  "forbiddenFilesTouched": ["package.json", "packages/**"], // globs the agent must not touch
  "passThreshold": 0.8, // automatable score needed to PASS
  "sampleCandidate": {
    // optional — demo/regression candidate
    "filesTouched": ["tools/x.js"],
    "notes": "...",
  },
  "rubric": [
    { "id": "files-exist", "type": "files-exist", "weight": 2, "description": "..." },
    { "id": "touched", "type": "files-touched", "weight": 2, "description": "..." },
    { "id": "ownership", "type": "no-forbidden-edits", "weight": 3, "description": "..." },
    {
      "id": "judgement",
      "type": "manual",
      "weight": 1,
      "description": "...",
      "guidance": "What a reviewer/model should check",
    },
  ],
}
```

### Rubric item types

| `type`               | Automatable? | Passes when …                                                  |
| -------------------- | ------------ | -------------------------------------------------------------- |
| `files-exist`        | yes          | every file in `files` (or `expectedFilesTouched`) exists       |
| `files-touched`      | yes          | the candidate touched every expected file                      |
| `no-forbidden-edits` | yes          | the candidate touched none of the `patterns`/`forbidden` globs |
| `manual`             | no (pending) | a human/model reviewer judges it (reported, not scored)        |

`files` / `patterns` glob matching supports `*` and `**`.

## Usage

```bash
# Run every golden task and print a scorecard
node tools/ai-eval/run-evals.js

# JSON scorecard (for dashboards / further processing)
node tools/ai-eval/run-evals.js --json

# Run a single task
node tools/ai-eval/run-evals.js --task devops-workflow-metrics-collector

# Make CI fail when any task is below its threshold (off by default)
STRICT=1 node tools/ai-eval/run-evals.js
```

Suggested `package.json` script (cannot be added here — `package.json` is
shared and owned elsewhere):

```jsonc
"ai:eval": "node tools/ai-eval/run-evals.js"
```

## CI

`.github/workflows/ai-eval.yml` runs the scaffold on pull requests that change
`.github/agents/**` or `.github/skills/**`. It is **non-blocking initially**
(no `STRICT`), so it surfaces a scorecard in the job summary without gating
merges. Flip it to blocking later by setting `STRICT=1` once the agent runner is
wired and thresholds are calibrated.

## Adding a golden task

1. Copy one of the fixtures in `golden-tasks/` and give it a unique `id`.
2. Point `expectedFilesTouched` / `forbiddenFilesTouched` at real paths.
3. Keep automatable rubric items where possible; reserve `manual` for genuine
   judgement calls.
4. Run `node tools/ai-eval/run-evals.js --task <id>` to verify it scores.
