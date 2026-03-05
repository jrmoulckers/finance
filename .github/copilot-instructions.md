# GitHub Copilot Instructions — Finance Monorepo

You are working in the Finance monorepo — a multi-platform, native-first financial tracking application.

## Human Approval Required (CRITICAL)

The following operations require EXPLICIT human approval. NEVER perform these autonomously:

- **Git remote operations** — No `git push`, `pull`, `fetch`, `remote`, `merge` from remote, `rebase` onto remote
- **PR/review operations** — No creating, merging, closing, or approving PRs or reviews
- **Remote platform mutations** — No GitHub API writes (issue close, label changes, repo settings, releases, deployments)
- **Outside project boundary** — No file access outside the repository root; no system config changes; no global package installs
- **Destructive file operations** — See detailed rules below
- **Package publishing** — See detailed rules below
- **Secret/credential access** — See detailed rules below
- **Database destructive ops** — See detailed rules below

If you need to perform any of these, STOP, explain what you need and why, and wait for human approval.

### Destructive File Operations — Detailed Rules

You MUST NOT delete directories or perform bulk file removal. Specific prohibitions:
- NEVER run `rm -rf`, `del /S`, `Remove-Item -Recurse -Force`, or any recursive delete
- NEVER delete more than one file in a single command without listing each file explicitly
- NEVER overwrite a file without reading it first to understand what you're replacing
- NEVER use wildcard deletion (`rm *.js`, `del *.log`) — always name each file

**Instead, do this:**
- To remove a single file: use the standard file tools, not shell commands
- To remove multiple files: list each file by name and explain why each should be deleted
- To clean build artifacts: tell the human to run `npm run clean` or equivalent
- If a directory needs removal: state the directory path and contents, then ask the human to delete it

### Package Publishing — Detailed Rules

You MUST NOT distribute code to any external registry or platform. Specific prohibitions:
- NEVER run `npm publish`, `yarn publish`, `pnpm publish`, or any publish command
- NEVER run `docker push`, `docker buildx push`, or push container images
- NEVER submit to app stores, package registries, or CDNs
- NEVER run deployment scripts (`deploy.sh`, `cdk deploy`, `terraform apply`, etc.)
- NEVER create GitHub Releases with attached binaries

**Instead, do this:**
- Prepare the package/release and document the steps for the human to execute
- Create a checklist of pre-publish verification steps
- Write release notes and changelogs, then ask the human to publish

### Secret & Credential Operations — Detailed Rules

You MUST NOT access, create, or modify real credentials. Specific prohibitions:
- NEVER create or edit `.env` files containing actual API keys, passwords, tokens, or connection strings
- NEVER read files in a `secrets/`, `.secrets/`, or `credentials/` directory
- NEVER access the system keychain, Windows Credential Manager, macOS Keychain, or Linux secret-service
- NEVER generate real API keys or tokens (e.g., via `openssl rand`, `ssh-keygen`, `gpg --gen-key`)
- NEVER hardcode any value that looks like a secret (long random strings, base64 blobs, connection URIs with passwords)
- NEVER echo, log, or display the contents of environment variables that may contain secrets

**Instead, do this:**
- Create `.env.example` or `.env.template` files with placeholder values like `YOUR_API_KEY_HERE`
- Reference environment variable names (`process.env.DATABASE_URL`) without the actual values
- Document what secrets are needed and where the human should configure them
- Use placeholder values in tests (e.g., `test-api-key-not-real`)

### Database Destructive Operations — Detailed Rules

You MUST NOT execute operations that delete, truncate, or irreversibly modify database data. Specific prohibitions:
- NEVER run `DROP TABLE`, `DROP DATABASE`, `DROP INDEX`, or any `DROP` statement
- NEVER run `TRUNCATE TABLE` or `TRUNCATE`
- NEVER run `DELETE FROM` without a `WHERE` clause (full table deletion)
- NEVER run `ALTER TABLE ... DROP COLUMN` (irreversible schema change)
- NEVER execute database migration scripts against anything other than a local dev database
- NEVER run `pg_restore`, `mongorestore`, or database restore commands
- NEVER modify database connection strings to point at production/staging systems

**Instead, do this:**
- Write migration scripts and ask the human to review and execute them
- Use `SELECT` queries to inspect data before proposing changes
- Create migration files with both `up` and `down` operations
- For test data: use `INSERT` into local development databases only
- Propose the SQL and explain its impact, then let the human run it

## Architecture Context

- **Monorepo** with apps/, packages/, services/, docs/, tools/
- **Edge-first**: Business logic runs on client devices; backend is for sync only
- **Platforms**: iOS (SwiftUI), Android (Kotlin), Web (PWA), Windows 11
- **Shared code** lives in packages/ (core logic, data models, sync engine)
- **Single backend API** in services/api/ for data synchronization

## Code Quality Requirements

- Write clean, self-documenting code with minimal but meaningful comments
- Every public function/method must have a documentation comment
- Follow platform-native conventions (don't force one language's patterns on another)
- Prefer pure functions and immutable data structures where possible
- All business logic must have unit tests; sync operations need integration tests
- Use descriptive variable and function names that reflect financial domain terminology

## Security (CRITICAL for financial app)

- NEVER hardcode secrets, API keys, or credentials
- NEVER log sensitive financial data (account numbers, balances, transactions) in plain text
- Always use parameterized queries — no string interpolation in SQL/queries
- Validate and sanitize all inputs at trust boundaries
- Use encryption at rest and in transit for financial data
- Follow the principle of least privilege for all API endpoints and data access

## Accessibility

- All UI must meet WCAG 2.2 AA standards minimum
- Use semantic HTML/native elements; support screen readers
- Respect user preferences: reduced motion, high contrast, font scaling
- Never convey information through color alone
- All interactive elements must have appropriate labels and focus management

## Privacy & Ethics

- Collect only the minimum data necessary
- All data collection must be transparent and documented
- Support data export and deletion (GDPR/CCPA compliance)
- Never sell, share, or use financial data for advertising
- Default to the most private option in every design decision

## Commit Messages

- Use conventional commits: `type(scope): description`
- Types: feat, fix, docs, style, refactor, test, chore, ci, perf
- Scope should reference the app/package/service being changed
- Include "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" trailer

## Dependencies

- Document the reason for every new dependency in the PR description
- Prefer well-maintained, actively developed packages
- Evaluate security posture before adding financial/crypto dependencies
- Minimize dependency count — prefer standard library solutions when adequate

## File Organization

- One concern per file; split when files exceed ~300 lines
- Group by feature, not by type (e.g., `feature/component.tsx` + `feature/component.test.tsx`)
- Shared utilities go in the appropriate package under packages/
