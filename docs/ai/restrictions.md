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
- Bulk file deletion (more than one file per command without naming each explicitly)
- Wildcard deletion (`rm *.js`, `del *.log`) — always name each file
- Overwriting files without reading them first

**Instead, agents should:**
- Use the standard file edit/create tools, not shell delete commands
- To remove files: list each file by name and explain why each should be deleted
- To clean build artifacts: tell the human to run `npm run clean` or equivalent
- If a directory needs removal: state the path and contents, ask the human to delete it

**Safe operations (auto-approved):**
- Deleting individual known files by name (e.g., removing a test fixture)
- File edits via the standard edit tool

### 6. Package Publishing & Distribution ⛔

**Operations requiring human approval:**
- `npm publish`, `yarn publish`, `pnpm publish` or any publish command
- `docker push`, `docker buildx push` or container image pushes
- App store submission, CDN upload, or release distribution commands
- Deployment scripts (`deploy.sh`, `cdk deploy`, `terraform apply`, etc.)
- Creating GitHub Releases with attached binaries

**Instead, agents should:**
- Prepare the package/release and document the steps for the human to execute
- Create a pre-publish verification checklist
- Write release notes and changelogs, then ask the human to publish

**Safe operations (auto-approved):**
- `npm install`, `npm ci` (local dependency installation)
- `npm run build`, `npm test`

### 7. Secret & Credential Operations ⛔

**Operations requiring human approval:**
- Creating or editing `.env` files containing actual API keys, passwords, tokens, or connection strings
- Reading files in `secrets/`, `.secrets/`, or `credentials/` directories
- Accessing the system keychain, Windows Credential Manager, macOS Keychain, or Linux secret-service
- Generating real API keys or tokens (`openssl rand`, `ssh-keygen`, `gpg --gen-key`)
- Hardcoding any value that looks like a secret (long random strings, base64 blobs, URIs with passwords)
- Echoing, logging, or displaying environment variable contents that may contain secrets

**Instead, agents should:**
- Create `.env.example` or `.env.template` files with placeholder values like `YOUR_API_KEY_HERE`
- Reference environment variable names (`process.env.DATABASE_URL`) without actual values
- Document what secrets are needed and where the human should configure them
- Use placeholder values in tests (e.g., `test-api-key-not-real`)

**Safe operations (auto-approved):**
- Creating `.env.example` files with placeholder values
- Referencing environment variable names (without values)

### 8. Database Destructive Operations ⛔

**Operations requiring human approval:**
- `DROP TABLE`, `DROP DATABASE`, `DROP INDEX`, or any `DROP` statement
- `TRUNCATE TABLE` or `TRUNCATE`
- `DELETE FROM` without a `WHERE` clause (full table deletion)
- `ALTER TABLE ... DROP COLUMN` (irreversible schema change)
- Database migration scripts against anything other than a local dev database
- `pg_restore`, `mongorestore`, or database restore commands
- Modifying database connection strings to point at production or staging systems

**Instead, agents should:**
- Write migration scripts and ask the human to review and execute them
- Use `SELECT` queries to inspect data before proposing changes
- Create migration files with both `up` and `down` operations
- For test data: use `INSERT` into local development databases only
- Propose the SQL and explain its impact, then let the human run it

**Safe operations (auto-approved):**
- `SELECT` queries (read-only)
- `INSERT` for test data in local development
- Schema migrations on local development databases (with review)

## Enforcement Mechanisms

These restrictions are enforced at multiple levels:

| Level | Mechanism | Enforces? | Scope |
|-------|-----------|-----------|-------|
| **Server-side** | GitHub branch protection / rulesets | ✅ Hard block | Cannot be bypassed by any client |
| **Git hooks** | `pre-push` hook in `tools/git-hooks/` | ✅ Hard block (non-interactive) | Blocks AI agents; prompts humans |
| **IDE** | Terminal allowlist/denylist | ⚠️ VS Code only | Only applies in Copilot Chat Agent Mode |
| **Instructions** | copilot-instructions.md, agent.md, AGENTS.md | ⚠️ Advisory | AI models should follow but can violate |
| **Documentation** | This file | ⚠️ Advisory | Reference for humans and AI |

### Understanding Enforcement Tiers

**Hard enforcement (cannot be bypassed):**
- GitHub branch protection rules prevent direct pushes to `main` — changes must go through reviewed PRs
- The `pre-push` Git hook detects non-interactive sessions (AI agents) and blocks the push automatically

**Soft enforcement (advisory — relies on AI model compliance):**
- Instruction files tell AI agents what they should/shouldn't do
- VS Code denylist blocks commands only within VS Code's Copilot Chat terminal
- These layers are still valuable as a "first line of defense" for well-behaved AI tools

### Required Human Setup

For full enforcement, repository collaborators must:
1. **Enable GitHub branch protection** on `main` (see repository Settings → Rules)
2. **Install git hooks** locally: `git config core.hooksPath tools/git-hooks`

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
