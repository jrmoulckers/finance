# GitHub Copilot Instructions — Finance Monorepo

You are working in the Finance monorepo — a multi-platform, native-first financial tracking application.

## Human Approval Required (CRITICAL)

The following operations require EXPLICIT human approval. NEVER perform these autonomously:

- **Git remote operations** — No `git push`, `pull`, `fetch`, `remote`, `merge` from remote, `rebase` onto remote
- **PR/review operations** — No creating, merging, closing, or approving PRs or reviews
- **Remote platform mutations** — No GitHub API writes (issue close, label changes, repo settings, releases, deployments)
- **Outside project boundary** — No file access outside the repository root; no system config changes; no global package installs
- **Destructive file operations** — No `rm -rf`, bulk deletion, disk formatting
- **Package publishing** — No `npm publish` or equivalent distribution commands
- **Secret/credential access** — No creating/reading `.env` with real credentials, no keychain/secrets manager access
- **Database destructive ops** — No `DROP`, `TRUNCATE`, schema migrations, or bulk `DELETE` without human review

If you need to perform any of these, STOP, explain what you need and why, and wait for human approval.

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
