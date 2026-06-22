# AI Practice CHANGELOG

This changelog records how the Finance project's **AI-first development practice** evolves — policy decisions, agent/skill/instruction additions, MCP changes, and governance corrections. It is a decision log, not a code changelog (for code releases see the release notes and `.changeset/`).

Entries are newest-first. Use ISO dates (`YYYY-MM`). Each entry should answer: _what changed, why, and what to read for detail._

> **Why this file exists:** the AI practice is configuration-as-code, but the _reasoning_ behind each policy shift was previously only visible in PR history. This log makes the evolution legible to new agents, new humans, and auditors. (Added 2026-06 per the AI-practice audit.)

---

## 2026-06 — AI-practice audit remediation

Source: the consultant-fleet [AI-Practice Audit (2026-06)](audits/ai-practice-audit-2026-06.md). This wave reconciled governance documentation with the actual control environment and expanded the agent/skill roster.

### Governance corrections

- **Fixed a false compliance claim (P0).** [`responsible-ai.md`](responsible-ai.md) previously asserted _"No AI-authored code is merged without human approval."_ This was untrue — agents self-merge their own PRs. The Commitments section and the "uniform quality standards" disclosure were rewritten, and a new **[Control Environment](responsible-ai.md#the-control-environment)** section now describes the _real_ controls: issue-first traceability, branch protection, required CI checks, the quality gate (CI green AND `MERGEABLE`), scoped self-merge, documented restrictions, and the `Co-authored-by` audit trail — including the honest limitation that not all CI security scans are blocking yet.
- **Added [AI Governance](governance.md).** A lightweight **NIST AI RMF** (Govern / Map / Measure / Manage) crosswalk and an **EU AI Act** note appropriate to a personal-finance app, mapping each function to the concrete control in this repo. Genuinely external/legal decisions are marked `## Needs Human Action`.

### Policy reconciliation (merge + force-push)

- **Self-merge policy made consistent everywhere.** Agents self-merge the PRs **they author** once the quality gate passes (CI green AND `MERGEABLE`); merging/approving/closing a PR an agent did **not** author — and merging human-authored PRs — stays human-gated. Reconciled across [`AGENTS.md`](../../AGENTS.md), [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md), [`workflow.md`](workflow.md), [`fleet-operations.md`](fleet-operations.md), [`restrictions.md`](restrictions.md), [`worktrees.md`](worktrees.md), and [`agent-instructions.md`](agent-instructions.md). Removed leftover "merge requires human approval" / "Merge (human only)" text.
- **`--force-with-lease` clarified.** Auto-approved **only** on the agent's **own** feature branch to re-push after a rebase/conflict resolution; forbidden on shared/integration branches. Plain `git push --force` remains forbidden entirely. Fixed the prior contradiction where one doc auto-approved it and another required human approval.

### Roster & inventory changes

- **5 new agent roles added** (roster grew toward 22; `.github/agents/` is the source of truth): `ai-ops-engineer` (owns `.github/agents`, `.github/skills`, `.github/instructions`, prompts, evals, AI manifest), `release-manager`, `performance-engineer`, `data-engineer`, `localization-engineer`. The previously-undocumented `qa-tester` is now listed in the roster and ownership tables.
- **Reviewer roles clarified.** `accessibility-reviewer` = **review-only** (routes fixes to platform agents); `security-reviewer` = **emergency fixer** (may implement CRITICAL/HIGH fixes with owning-agent coordination).
- **7 new skills referenced** in the skills inventory: `accessibility-testing`, `security-review-methodology`, `design-tokens`, `performance-budgets`, `i18n-localization`, `mcp-agent-tooling`, `prompt-engineering`.

### Documentation drift fixes

- **Corrected hardcoded counts.** [`README.md`](README.md) (was "13 agents / 6 skills / 5 MCP servers"), [`INDEX.md`](../INDEX.md), [`agent-instructions.md`](agent-instructions.md), and [`instructions.md`](instructions.md) now state the current counts with an "as of 2026-06" caveat and point to the source-of-truth directories (and the planned `ai-manifest`) to prevent future drift.
- **Marked stale docs historical.** [`fleet-ci-analysis.md`](fleet-ci-analysis.md) carries a `Historical (as of 2026-04)` banner; [`pain-points.md`](pain-points.md) carries a freshness note.
- **Fixed orphaned navigation.** Added [`start-here.md`](start-here.md) as the canonical entry point; linked previously-orphaned `ci-monitoring.md` and `slash-commands.md` from both indexes; added this CHANGELOG, `governance.md`, and the [audit report](audits/ai-practice-audit-2026-06.md) to the indexes.

> **Audit-report location.** The consolidated report lives at [`docs/ai/audits/ai-practice-audit-2026-06.md`](audits/ai-practice-audit-2026-06.md).

### MCP (handled by the MCP owner — referenced here for the record)

- The audit flagged two MCP packages pointing at non-existent npm names (one handed a `service_role` key) and an over-broad filesystem root. Remediation of [`mcp.md`](mcp.md) / `.vscode/mcp.json` is owned by the MCP/AI-ops track; see the audit's P0 risks 1–3 and `mcp.md` for status.

---

## Before 2026-06 — baseline (reconstructed)

The AI practice predates this changelog. Notable milestones visible in the docs at the time this log was started:

- **Fleet orchestration** across multiple waves (see [`fleet-operations.md`](fleet-operations.md) "Wave 3 Learnings" and the historical [`fleet-ci-analysis.md`](fleet-ci-analysis.md)).
- **File-ownership concurrency model** — the per-agent ownership table in [`AGENTS.md`](../../AGENTS.md) as a write-conflict control.
- **Risk-proportional human-gating taxonomy** — the 8-category restriction model in [`restrictions.md`](restrictions.md).
- **Issue-first + worktree workflow** — established as the mandatory development loop.

_New entries go above this line, newest-first._
