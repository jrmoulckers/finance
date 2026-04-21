# Agent Scripts

Automation scripts that AI agents can call directly to reduce token usage. Each script replaces multi-step inline command sequences with a single call.

## Why?

Every mundane operation agents perform (git, npm, PR creation, file ops) typically requires 5–10 inline commands. These scripts consolidate each operation into a single call, saving hundreds of tokens per agent invocation and ensuring consistent behavior across all agents.

## Scripts

### `setup-worktree.js` — Create agent worktree

Creates a git worktree for agent work with automatic npm install.

```sh
node tools/agent-scripts/setup-worktree.js <agent-type> <branch-type> <description> <issue-number>
# or
npm run agent:worktree -- android feat widgets 381
```

**Arguments:**

| Arg            | Values                                                                   | Example          |
| -------------- | ------------------------------------------------------------------------ | ---------------- |
| `agent-type`   | `android`, `ios`, `web`, `windows`, `devops`, `docs`, `core`, `security` | `android`        |
| `branch-type`  | `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `ci`, `perf`         | `feat`           |
| `description`  | kebab-case description                                                   | `budget-widgets` |
| `issue-number` | GitHub issue number                                                      | `381`            |

**Result:** Worktree at `../wt-android-feat-widgets-381`, branch `android/feat/widgets-381`.

---

### `pre-push-check.js` — Lint & format checks

Runs the mandatory pre-push format and lint checks. With `--fix`, auto-fixes and amends the commit.

```sh
node tools/agent-scripts/pre-push-check.js          # check only
node tools/agent-scripts/pre-push-check.js --fix     # fix + amend commit
# or
npm run agent:check
npm run agent:check -- --fix
```

**Steps:**

1. `npm run format` (--fix only)
2. `npx eslint . --fix` (--fix only)
3. `npm run format:check` (verify)
4. `npx eslint . --max-warnings 0` (verify)
5. `git add -A && git commit --amend --no-edit` (--fix only, if changes)

---

### `create-pr.js` — Push and create PR

Pushes the branch and creates a GitHub pull request with CI check polling.

```sh
node tools/agent-scripts/create-pr.js \
  --title "feat(web): add budget widgets (#381)" \
  --body "Implements budget widget component" \
  --closes 381 \
  --branch web/feat/budget-widgets-381
# or
npm run agent:pr -- --title "..." --body "..." --closes 381
```

**Options:**

| Flag          | Required | Description                           |
| ------------- | -------- | ------------------------------------- |
| `--title`     | Yes      | PR title (conventional commit format) |
| `--body`      | No       | PR description                        |
| `--closes`    | No       | Comma-separated issue numbers         |
| `--branch`    | No       | Branch to push (default: current)     |
| `--base`      | No       | Base branch (default: main)           |
| `--draft`     | No       | Create as draft PR                    |
| `--no-checks` | No       | Skip CI check polling                 |

---

### `rebase-and-push.js` — Rebase onto main and push

Fetches origin/main, rebases, runs checks, and pushes with `--force-with-lease`.

```sh
node tools/agent-scripts/rebase-and-push.js [branch]
# or
npm run agent:rebase -- my-branch
```

**Steps:**

1. `git fetch origin main`
2. `git rebase origin/main`
3. If conflicts → reports conflicting files and exits 1
4. Runs `pre-push-check.js --fix`
5. `git push --force-with-lease --no-verify`

---

### `check-pr-status.js` — Query PR checks

Queries GitHub for a PR's check status and mergeability.

```sh
node tools/agent-scripts/check-pr-status.js <pr-number>
node tools/agent-scripts/check-pr-status.js 381 --json
```

**Output (JSON):**

```json
{
  "prNumber": 381,
  "title": "feat(web): add budget widgets",
  "state": "OPEN",
  "mergeable": "MERGEABLE",
  "reviewDecision": "REVIEW_REQUIRED",
  "checks": {
    "pass": 8,
    "fail": 0,
    "pending": 2,
    "total": 10,
    "status": "pending"
  }
}
```

---

### `list-issues.js` — List filtered issues

Lists GitHub issues filtered by sprint and/or agent label.

```sh
node tools/agent-scripts/list-issues.js --sprint 3 --agent android --json
# or
npm run agent:issues -- --sprint 3 --agent android
```

**Options:**

| Flag              | Description                       |
| ----------------- | --------------------------------- |
| `--sprint <N>`    | Filter by `sprint:N` label        |
| `--agent <type>`  | Filter by `agent:<type>` label    |
| `--state <state>` | `open` (default), `closed`, `all` |
| `--limit <N>`     | Max results (default: 50)         |
| `--json`          | Machine-readable JSON only        |

---

### `sprint-status.js` — Fleet dashboard

Shows a consolidated dashboard: open PRs by agent, issues by sprint, and active worktrees.

```sh
node tools/agent-scripts/sprint-status.js
node tools/agent-scripts/sprint-status.js --json
# or
npm run agent:status
```

---

## npm Script Aliases

All scripts are available as npm scripts in the root `package.json`:

```sh
npm run agent:worktree -- android feat widgets 381
npm run agent:check -- --fix
npm run agent:pr -- --title "..." --closes 381
npm run agent:rebase -- my-branch
npm run agent:status
npm run agent:issues -- --sprint 3
```

## JSON Output

All scripts support machine-readable JSON output for agent consumption:

- **`--json` flag:** Output only JSON (no human-readable text)
- **`AGENT_JSON=1` env var:** Append JSON after human-readable output

Agents should use `--json` for programmatic consumption and parse the JSON directly.

## Cross-Platform

All scripts use Node.js (`child_process`) with no bash dependencies. They work on:

- Windows (PowerShell)
- macOS (zsh/bash)
- Linux (bash)

## Token Savings

| Operation           | Without script                 | With script                  | Savings          |
| ------------------- | ------------------------------ | ---------------------------- | ---------------- |
| Setup worktree      | ~15 commands, ~400 tokens      | 1 command, ~30 tokens        | ~370 tokens      |
| Pre-push check      | ~6 commands, ~200 tokens       | 1 command, ~20 tokens        | ~180 tokens      |
| Create PR           | ~8 commands, ~300 tokens       | 1 command, ~40 tokens        | ~260 tokens      |
| Rebase + push       | ~8 commands, ~250 tokens       | 1 command, ~20 tokens        | ~230 tokens      |
| Check PR status     | ~4 commands, ~150 tokens       | 1 command, ~20 tokens        | ~130 tokens      |
| **Total per cycle** | **~41 commands, ~1300 tokens** | **~5 commands, ~130 tokens** | **~1170 tokens** |
