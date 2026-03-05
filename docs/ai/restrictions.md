# AI Restrictions & Human-Gated Operations — Finance

This document defines operations that AI agents MUST NOT perform without explicit human approval. These restrictions apply to ALL AI tools working in this repository.

## Why Restrictions?

Finance is a financial tracking application handling sensitive personal and monetary data. Unrestricted AI agent operations pose risks:

- **Data integrity** — Unreviewed changes to financial logic could produce incorrect results
- **Security** — Autonomous remote operations could expose credentials or data
- **Compliance** — GDPR, CCPA, and financial regulations require human oversight of data-affecting operations
- **Reversibility** — Many remote operations (publishing, pushing, merging) are difficult or impossible to undo

## Restriction Categories

### 1. Git Remote Operations ⛔

**Operations requiring human approval:**
- `git push` (all variants including `--force`, `--force-with-lease`)
- `git pull` and `git fetch` from untrusted remotes
- `git remote add`, `remove`, `set-url`
- `git merge` from remote branches
- `git rebase` onto remote branches

**Safe operations (auto-approved):**
- `git status`, `git log`, `git diff`, `git show`
- `git add`, `git commit` (local only)
- `git branch` (listing), `git stash list`

### 2. Pull Request & Review Operations ⛔

**Operations requiring human approval:**
- `gh pr create`, `merge`, `close`, `approve`, `review`
- `gh pr edit` (modifying PR metadata)
- Requesting or dismissing reviewers
- Any GitHub API call that modifies PR state

**Safe operations (auto-approved):**
- `gh pr list`, `view`, `diff`, `checks`
- Reading PR comments and review content

### 3. Remote Platform Operations ⛔

**Operations requiring human approval:**
- `gh issue close`, `delete`, `transfer`
- `gh repo` management commands
- `gh release create`, `edit`, `delete`
- Deployment triggers
- Cloud service API calls (AWS, GCP, Azure)
- Any API call that mutates remote state

**Safe operations (auto-approved):**
- `gh issue list`, `view`
- `gh repo view`
- Reading remote state without modification

### 4. Operations Outside Project Boundary ⛔

**Operations requiring human approval:**
- Reading or writing files outside the repository root
- Accessing system directories (`C:\Windows`, `/etc`, `~/.ssh`, etc.)
- Modifying environment variables, PATH, or system configuration
- Installing global packages (`npm install -g`, `pip install --user`)
- Accessing other repositories or projects on the machine

**Safe operations (auto-approved):**
- All operations within the repository root directory
- Reading node_modules/ (installed locally in the project)

### 5. Destructive File Operations ⛔

**Operations requiring human approval:**
- `rm -rf`, `del /S /Q`, `Remove-Item -Recurse -Force` on directories
- Disk formatting, partitioning, or system-level file operations
- Bulk file deletion (more than 5 files at once)
- Overwriting files without reading them first

**Safe operations (auto-approved):**
- Deleting individual known files (e.g., removing a test fixture)
- File edits via the standard edit tool

### 6. Package Publishing & Distribution ⛔

**Operations requiring human approval:**
- `npm publish`, `yarn publish`, `pnpm publish`
- App store or distribution platform submissions
- Container image pushes (`docker push`)
- Any command that distributes code to external registries

**Safe operations (auto-approved):**
- `npm install`, `npm ci` (local dependency installation)
- `npm run build`, `npm test`

### 7. Secret & Credential Operations ⛔

**Operations requiring human approval:**
- Creating or modifying `.env` files with real credentials
- Accessing keychain, credential stores, or secrets managers
- Generating, rotating, or revoking API keys or tokens
- Modifying authentication configuration
- Reading files in `secrets/` directory

**Safe operations (auto-approved):**
- Creating `.env.example` files with placeholder values
- Referencing environment variable names (without values)

### 8. Database Destructive Operations ⛔

**Operations requiring human approval:**
- `DROP TABLE`, `DROP DATABASE`, `TRUNCATE TABLE`
- `DELETE FROM` without a WHERE clause
- Schema migrations on any non-local-dev database
- Bulk data insertion or modification
- Database backup or restore operations

**Safe operations (auto-approved):**
- `SELECT` queries (read-only)
- `INSERT` for test data in local development
- Schema migrations on local development databases (with review)

## Enforcement Mechanisms

These restrictions are enforced at multiple levels:

| Level | Mechanism | File |
|-------|-----------|------|
| **IDE** | Terminal allowlist/denylist | `.vscode/settings.json` |
| **Global Instructions** | Declared restrictions for Copilot | `.github/copilot-instructions.md` |
| **Agent Instructions** | Per-agent boundary rules | `.github/agents/*.agent.md` |
| **Root Guidance** | Cross-tool restrictions | `AGENTS.md` |
| **Documentation** | This file | `docs/ai/restrictions.md` |

## Agent Behavior When Hitting a Restriction

When an AI agent encounters a task that requires a gated operation, it MUST:

1. **STOP** — Do not attempt the operation
2. **EXPLAIN** — Clearly state what operation is needed and why
3. **WAIT** — Wait for explicit human approval before proceeding
4. **NEVER WORKAROUND** — Do not attempt alternative methods to bypass the restriction (e.g., using a different command to achieve the same remote effect)

## Modifying These Restrictions

To change these restrictions:
1. Discuss the change with the team
2. Update this document first
3. Update all enforcement points (settings.json, copilot-instructions.md, agent files, AGENTS.md)
4. Commit with clear rationale in the commit message
5. This change itself requires human review — AI agents MUST NOT modify restriction policies
