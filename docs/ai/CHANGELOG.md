# AI Practice CHANGELOG

This changelog records how the Finance project's **AI-first development practice** evolves — policy decisions, agent/skill/instruction additions, MCP changes, and governance corrections. It is a decision log, not a code changelog (for code releases see the release notes and `.changeset/`).

Entries are newest-first. Use ISO dates (`YYYY-MM`). Each entry should answer: _what changed, why, and what to read for detail._

> **Why this file exists:** the AI practice is configuration-as-code, but the _reasoning_ behind each policy shift was previously only visible in PR history. This log makes the evolution legible to new agents, new humans, and auditors. (Added 2026-06 per the AI-practice audit.)

---

## 2026-07 — PWA bug-basher agent + bug-bash prompt

Source: issue #3892 (Part A of a two-part self-service bug-bash effort). Added a self-contained, single-bug PWA bug-fixing capability so a human can bash bugs as independent, standalone sessions without routing each one through a coordinator thread.

- **New `pwa-bug-basher` agent (roster 24 → 25).** A full-lifecycle web bug fixer (`write_scope: full`, `risk_level: medium`, `primary_paths: ['apps/web/**']`) that combines `@qa-tester`-style investigation with `@web-engineer` implementation. Launched as a standalone session per bug, it runs the entire flow: intake a report (+ optional screenshot) → reproduce/root-cause against `main` with verified `file:line` → file an issue-first GitHub issue (`platform:web` + `bug`/`enhancement`/`accessibility`) → surgical fix on its own worktree → pre-push lint/format → rebase → push → `gh pr create --base main` with `Closes #N` → drive cloud CI green + resolve conflicts → `gh pr merge --squash` once green AND `MERGEABLE` → remove its worktree. Bakes in the bug-bash environment caveats (shared `:5199` dev server may exist — start your own if needed; **never edit `apps/web/vite.config.ts`** because the host keeps a local-only `allowedHosts` edit there) and references `.github/instructions/workflow.instructions.md` for the canonical push/merge/conflict rules. See [`pwa-bug-basher.agent.md`](../../.github/agents/pwa-bug-basher.agent.md).
- **New `bug-bash` prompt.** A thin reusable wrapper ([`bug-bash.prompt.md`](../../.github/prompts/bug-bash.prompt.md)) with a `bug` parameter that runs the `pwa-bug-basher` flow for a single pasted bug; works standalone or inside an existing session. Listed in the [prompts README](../../.github/prompts/README.md).
- **Roster count synced to 25** across [`AGENTS.md`](../../AGENTS.md), [`README.md`](README.md), [`agents.md`](agents.md), [`agent-instructions.md`](agent-instructions.md), [`skills.md`](skills.md) (registry + skill↔agent table), [`slash-commands.md`](slash-commands.md), [`docs/INDEX.md`](../INDEX.md), and the `fleet-orchestration` / `sprint-planning` registries; `npm run ai:manifest:check` reports no drift.

---

## 2026-06 — AI-capabilities audit (Areas 1–8)

Source: a structured, area-by-area audit of every AI capability surface (agents, skills, instructions, global guidance, prompts, MCP, slash commands, and the `docs/ai` corpus), run to a single bar — accuracy + gaps + enrichment + consolidation. Each area landed as its own issue-linked PR. Highlights (the compliance-specialist / architect change is logged separately, below):

- **Agents & skills registries reconciled** against the source-of-truth directories — `agents.md` / `skills.md` enumerations completed, every agent given a **Related skills** line, and a skill↔agent mapping table added. Counts pinned to **24 agents / 20 skills** with `npm run ai:manifest:check` wired in to catch future drift.
- **Instructions:** added a 14th path-instruction file (`config.instructions.md`) and eradicated the dead `config/tokens/**` glob (repointed to `packages/design-tokens/**`); the [`instructions.md`](instructions.md) catalog and several `applyTo` labels were corrected.
- **Global guidance:** restructured the [`copilot-instructions.md`](../../.github/copilot-instructions.md) opener into an explicit auto-approved-vs-gated **Operation Approval Policy**, and aligned three stale `ci:check` pre-push gates in [`AGENTS.md`](../../AGENTS.md) to `format:check && eslint`.
- **Prompts & MCP:** the 7 reusable prompts were de-drifted (canonical label→agent pointer, `HUSKY=0` pushes, self-merge tails); the 7-server MCP posture (read-only, secret-free filesystem root) was synced across [`mcp.md`](mcp.md), the ai-agents guide, and the `mcp-agent-tooling` skill.
- **Slash commands:** the prototype [`slash-commands.md`](slash-commands.md) doc was reconciled with its three `dispatch-*.js` scripts (full 24-agent roster, extended pre-push sequence).
- **`docs/ai` corpus (8a–8e):** corrected onboarding/navigation counts and broken `gh pr create` newlines; restored U+FE0F variation selectors in pre-push anchor links; refreshed workflow / worktrees / metrics guidance; de-duplicated and resolved entries in [`pain-points.md`](pain-points.md); **consolidated the branch-protection docs to one source of truth** ([`.github/branch-protection.md`](../../.github/branch-protection.md)) and reconciled [`restrictions.md`](restrictions.md) to the active Husky hook model.

This entry is the capstone; see the per-area PRs for the detailed diffs.

---

## 2026-06 — Compliance specialist agent + architect enrichment

Source: the AI-capabilities audit (Area 1 addendum). Added a 24th agent and broadened the architect's remit.

- **New `compliance-specialist` agent (roster 23 → 24).** A doc-owning **advisory** role for financial, governmental, and regional regulatory compliance. It stewards the existing [`docs/compliance/`](../compliance/) corpus (GDPR/CCPA audits, retention schedule, VPAT, app-store privacy labels) and extends it with an obligation matrix, a jurisdictional data-residency map, and DPIA/RoPA records. Its niche is regulatory **obligations & the jurisdictional matrix**, distinct from `security-reviewer`'s **technical controls**; the two share the `privacy-compliance` skill. `security-reviewer` keeps the `security`/`privacy` labels while `compliance`/`regulatory` now route to the new agent. See [`compliance-specialist.agent.md`](../../.github/agents/compliance-specialist.agent.md).
- **Enriched the `architect` agent.** Its description, `when_to_use`, and Capabilities now foreground **holistic system design, cross-platform feature definition, and technical investigation & root-cause resolution** alongside the existing edge-first/ADR remit. See [`architect.agent.md`](../../.github/agents/architect.agent.md).
- **Roster count synced to 24** across [`AGENTS.md`](../../AGENTS.md), [`README.md`](README.md), [`agents.md`](agents.md), [`agent-instructions.md`](agent-instructions.md), the skill↔agent mapping in [`skills.md`](skills.md), and the `fleet-orchestration` / `sprint-planning` registries; `npm run ai:manifest:check` reports no drift.

---

## 2026-06 — Audit human-action follow-up

Follow-up to the audit remediation below, closing the actionable items that were
left as `Needs Human Action` where an agent could in fact complete them.

- **Verified & corrected MCP pins.** All 7 MCP servers in [`.vscode/mcp.json`](../../.vscode/mcp.json) were verified against the npm registry (2026-06-21) and bumped to the actual latest published versions (the prior pins were placeholders); the `TODO(human): verify pin` notes are resolved.
- **Fixed a wrong pinned action SHA.** The `gitleaks-action` pin was `44c470ff…` (an _untagged_ commit); corrected to `ff98106e…`, the commit tagged **v2.3.9**. `actions/checkout` / `setup-node` / `upload-artifact` pins were confirmed to match their tags and the "verify" comments removed.
- **Made `CODEOWNERS` valid.** Removed the invalid `@jrmoulckers-org/security-reviewers` placeholder team (an unknown handle that broke CODEOWNERS validation). Adding a real second reviewer remains a human step.
- **Authored the incident-response runbook.** New [`incident-response.md`](incident-response.md) with playbooks for prompt injection, secret exposure, runaway merges, and destructive ops — closing the governance "🔴 Gap".
- **Added a branch-protection apply script.** [`tools/setup-branch-protection.sh`](../../tools/setup-branch-protection.sh) lets a maintainer apply the documented `main` protection with one command (human-run only).
- Updated [`governance.md`](governance.md) and [`branch-protection.md`](../../.github/branch-protection.md) to mark the now-completed items and re-scope the remaining human-only steps (enable GHAS, mark the gatekeeper required, add a real second reviewer, provision a read-only Supabase token, legal AI classification).

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
