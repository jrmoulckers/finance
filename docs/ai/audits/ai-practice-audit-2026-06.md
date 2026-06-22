# AI-First Practice — Consultant Fleet Audit

**Date:** 2026-06-21 · **Method:** 7 specialist consultant agents, each owning one facet (agents, skills, instructions, MCP, docs, governance, industry benchmark). Read-only analysis. npm package names verified against the live registry.

---

## Executive synthesis

This is a **top-decile AI-first _process_** — frontier-grade fleet orchestration, 17 file-owned specialist agents, skills/instructions-as-code, and a risk-proportional human-gating taxonomy — sitting on top of a genuinely differentiated KMP cross-platform core. **But the assurance layer has not kept pace with the autonomy layer.** Three classes of systemic risk dominate: (1) two MCP servers point at non-existent npm packages, one of them handed an RLS-bypassing `service_role` key; (2) the "hard enforcement" the governance docs advertise is largely illusory — the pre-push hook is bypassed by design and only 2 CI checks are blocking; (3) pervasive documentation drift, including a **false control claim** in the public Responsible-AI doc and contradictory merge/force-push policy across governance files.

**Maturity scorecard (architect benchmark):**

| Dimension               | Level                  | Note                                                                       |
| ----------------------- | ---------------------- | -------------------------------------------------------------------------- |
| Orchestration           | **Managed**            | 3 waves / 140+ PRs, dependency-ordered dispatch; no fleet-integration test |
| Agent design            | **Managed**            | 17 role-scoped, file-owned agents; no per-agent eval loop                  |
| Context / MCP           | **Repeatable→Defined** | Strong tools; inventory disagrees across 3 sources; 2 fake packages        |
| Governance / Safety     | **Defined→Managed**    | Best-in-class taxonomy; enforcement advisory-only for Cat 5–8              |
| Measurement / Evals     | **Repeatable**         | Metric catalog exists but values are placeholders; no agent-output evals   |
| Documentation           | **Managed**            | Excellent IA; heavy count drift                                            |
| Cross-platform leverage | **Managed→Optimizing** | KMP core → 4 first-class targets; real moat                                |

---

## 1. WHERE WE'RE TOP-TIER

- **Fleet orchestration is frontier-grade.** Quantified wave sizing, dependency-graph dispatch, SQL-tracked todos, documented self-healing CI loop — more rigorous than most orgs running Copilot/Claude/Codex have written down.
- **File-ownership as a concurrency-control primitive** (`AGENTS.md` ownership table + label→agent routing + schema serialization) cleanly solves the #1 multi-agent failure mode (write conflicts).
- **Risk-proportional human-gating taxonomy** (8 categories) — auto-approves low-risk push/PR/self-merge, hard-gates secrets/DB/publishing. More sophisticated than binary approve-everything models.
- **Platform-agent boundaries are crisp** — each app agent declares one primary dir + explicit "do NOT edit" peer zones, mirrored in `AGENTS.md`.
- **Domain guardrails are serious** — finance-domain mandates integer-cents + banker's rounding; security-reviewer maps OWASP MASVS + STRIDE; accessibility-reviewer has per-platform WCAG 2.2 AA checklists.
- **Skills are domain-rich and repo-specific** (edge-sync component map, financial engines, privacy export/deletion flows) — not generic filler.
- **Documentation information architecture is exemplary** — dual index (`docs/INDEX.md` + `docs/ai/README.md`), "I want to… / Start here" nav, most docs reachable in ≤2 clicks.
- **Honest enforcement-tier table** — `restrictions.md` openly grades controls hard vs advisory (rare and commendable).
- **Real CI strengths** — CodeQL JS/TS is blocking; a sensitive-data-logging grep gate fails the build; all GitHub Actions pinned to commit SHAs; Dependabot across npm/Gradle/Actions; strong SECURITY.md disclosure posture.
- **Three core MCP servers are authentic** official packages (`@modelcontextprotocol/server-{sequential-thinking,memory,filesystem}`, `@upstash/context7-mcp`); secrets use `${input:...}` prompts, never hardcoded.

---

## 2. WHERE WE CAN IMPROVE

### Measurement & evals (biggest frontier gap)

- **[P0] Metrics are defined but not collected** — every value in the scorecards is `—`. Ship the "future" `tools/workflow-metrics.js` to populate CI/quality/fleet metrics from the GitHub API.
- **[P0] No agent-output eval harness** — a change to an agent prompt/skill has zero measurable quality signal. Build a golden-task corpus + per-agent success/regression scoring + a gate on instruction changes. This is the single biggest lever from "Managed" → "Optimizing."
- **[P1] No agent-output quality metrics** (PR acceptance rate, human-requested-changes rate, revert rate per agent type) — the most important AI-first quality signal is absent.

### Structure & governance-as-code

- **[P1] Collapse duplicated procedure to one canonical source.** The pre-push sequence lives in 6+ files and has already diverged (step counts 6/7/8; one uses `--force-with-lease`); the agent roster lives in 4 places and no two agree. Point everything at one source + a generated manifest.
- **[P1] Generate agent/skill/server manifests from the filesystem** and add a `ci:check:quick` lint that fails when README/INDEX/AGENTS counts disagree with reality — kills the entire drift class permanently.
- **[P1] Extend agent frontmatter** beyond `name/description/tools` to include `model`, `when-to-use`, `primary_paths`, `write_scope`, `risk_level`; encode a model strategy (stronger model for architecture/security/financial logic).
- **[P1] Resolve ownership collisions** — finance-domain vs kmp-engineer (both `packages/core`); design-engineer vs kmp-engineer (design-tokens); product-manager vs business-analyst (`docs/business`). Define exclusive lead owner + reviewer per shared zone.
- **[P1] Sharpen skill boundaries** — the 4 PM-adjacent skills (fleet-orchestration / sprint-planning / project-management / issue-management) bleed together, as do edge-sync / supabase-powersync / kmp-development on sync.

### Coverage gaps

- **[P2] Missing agent roles** for a frontier practice: AI-ops/prompt-engineering, release-manager, performance, data/analytics, localization.
- **[P1] Missing skills:** accessibility-testing, security-review-methodology, design-tokens, performance-budgets, i18n-localization, mcp-agent-tooling, prompt-engineering patterns.
- **[P1] Missing instruction files** for owned-but-unscoped areas: `.github/workflows/`, `build-logic/`, `config/tokens/`, `.github/agents`, `.github/skills`.
- **[O] Missing docs:** a "start here" agent-onboarding path, an AI-practice CHANGELOG/decision log, an MCP usage runbook ("when to use which server").

### Fintech governance maturity

- **[P1] Formalize product-side AI governance** — no NIST AI RMF (Govern/Map/Measure/Manage) crosswalk, no EU AI Act risk classification, no agent/model inventory, no incident-response runbook for _agent misbehavior_. Table stakes for a regulated-adjacent financial product audit.

---

## 3. RISKS TO ELIMINATE (prioritized)

### P0 — fix before this configuration is used anywhere

1. **Fake/typosquat-bait MCP package: Playwright.** `.vscode/mcp.json` → `@anthropic/mcp-server-playwright` returns **404**; the `@anthropic` npm scope is **entirely unclaimed**. Official is Microsoft's `@playwright/mcp`. Under `npx -y` anyone who claims that name gets **silent RCE on every agent machine**. Replace with `@playwright/mcp@<pinned>`.
2. **Fake MCP package handed a `service_role` key: Supabase.** `@nicepkg/supabase-mcp@latest` returns **404** (official: `@supabase/mcp-server-supabase`) — and is passed the Supabase **`service_role`** key, which **bypasses Row-Level Security** (total read/write to all financial data). Combines supply-chain RCE + crown-jewel credential handover.
3. **`service_role` has no place in a prompt-injection-exposed agent context.** Blast radius = the entire database on a single injection. Move to least-privilege: read-only management token / anon+RLS / local synthetic DB.
4. **"Hard enforcement" is illusory.** The pre-push hook (graded "hard block, blocks AI agents") is bypassed by the _official_ workflow (`$env:HUSKY="0"; git push --no-verify`), so the only client-side gate is disabled by design. Move checks into a non-bypassable CI gate.
5. **`responsible-ai.md` states a false control.** Line 76: _"No AI-authored code is merged without human approval"_ — directly contradicted by `AGENTS.md` line 189 (mandated self-merge). For a financial product this is a governance/compliance integrity risk. Fix the doc or reinstate the control.
6. **Governance docs contradict each other on the two riskiest ops** — `agent-instructions.md` still gates PR merge that `restrictions.md`/`AGENTS.md` now auto-approve; `force-with-lease` is simultaneously "auto-approved" and "human-approval-required" across files, with `slash-commands.md` actively instructing the gated action.

### P1 — close soon

7. **No human-in-the-loop for security/schema/financial-logic/RLS changes** — agents self-merge and may `gh pr merge --admin` to override branch protection; admins are explicitly _not_ included in restrictions; no path-based required reviewer for `services/api/`, sync, or migrations.
8. **The "quality gate" is largely self-asserted** — only **2** required status checks (ESLint/Prettier + PR-title); CodeQL-JVM, dependency review, secret detection, npm audit are all `continue-on-error`/informational, so "CI green" can be true while security scans failed.
9. **Secret-leak prevention is shallow** — pre-commit runs only lint-staged (no secret scan), pushes use `--no-verify`, server-side TruffleHog uses `--only-verified` (ignores unverifiable real secrets) and is non-blocking; VS Code config _allowlists_ reading `.env`/secrets with no deny entry.
10. **Path-filter "never-run = passing"** — a PR touching only `*.sql`/RLS/`*.kt` skips the required JS checks entirely and can merge. Add an always-on gatekeeper job.
11. **Credentials passed on the command line** (`--supabase-key=...`) leak via process listing/shell history; `npx -y …@latest` is unpinned/integrity-unchecked for every server.
12. **Filesystem MCP can read gitignored secrets** within the workspace root (live `.env`/`.env.local`/`*.key`). Narrow the root or deny `**/.env*`/`**/*.key`/`**/secrets/**`.
13. **Reviewer-agent mutability is contradictory** — accessibility-reviewer and security-reviewer are documented read-only yet told to "implement fixes directly"; tools omit `edit`.
14. **CODEOWNERS = single human** (`@jrmoulckers`) for everything; bus factor 1, no separation of duties for security-sensitive paths.
15. **Stale/contradictory skill guidance** — `ux-testing` tells agents to skip Android ("scaffold only") despite 218 Kotlin files; two skills teach `os.tmpdir()` (violates scratch-path safety); financial-modeling examples use `Double`/JS `number` for money, contradicting its own no-floats rule.
16. **Lifecycle policy drift in agent files** — many still list "merge/approve PRs" as human-gated, contradicting the current self-merge policy → agents may stop before Definition of Done.

### Documentation drift (P1/P2, pervasive)

17. **Every hand-maintained count is wrong:** agents 13/16 (actual **17**, `qa-tester` undocumented everywhere); skills 6/11 (actual **13**); MCP servers 5 (actual **7**, the two riskiest mislabeled "planned"); instruction files 4/5 (actual **8**); MCP also stated as 4 in `agency.toml`.
18. **Stale snapshots indexed as living docs** — `fleet-ci-analysis.md` (2026-04) recommends `ci:check`/`ready-for-pr` as canonical, contradicting current "remote CI is source of truth"; `pain-points.md` last touched 2025-07 but references 2026 fleet waves elsewhere. Mark historical.
19. **Orphans / mislabels** — `slash-commands.md` (still "Prototype", orphaned from both indexes) and `ci-monitoring.md` (half-orphaned); `agent-instructions.md` billed "canonical" while being the most-drifted doc with an unfilled `[auto-generated]` timestamp.

---

## Recommended first moves (highest leverage)

1. **Replace both fake MCP packages with pinned official ones; remove `service_role` from any agent MCP context.** (P0 risks 1–3)
2. **Reconcile governance to one voice** — fix the false Responsible-AI claim and the merge/force-push contradictions; pick the autonomy model and update `agent-instructions.md` + agent files. (P0 risks 5–6, 16)
3. **Make the quality gate real** — promote CodeQL (both langs), Secret Detection, Dependency Review, npm-audit, and the logging job to required/blocking; add an always-on gatekeeper job; require human review on sensitive paths (`services/api/`, migrations, RLS). (P1 risks 7–10)
4. **Generate manifests + add a count-drift CI check** to permanently kill documentation drift. (improvement + risk 17)
5. **Stand up measurement** — ship the metrics collector and a golden-set agent-output eval harness. (P0 opportunities)
