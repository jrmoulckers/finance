# AI Development Workflow — Finance

This directory contains comprehensive documentation for the AI-first development workflow used in the Finance monorepo. Every aspect of AI agent configuration, tooling, and usage is documented here for full transparency.

> **New here (agent or human)?** Start with **[start-here.md](start-here.md)** — the canonical entry point that links the workflow, restrictions, agent roster, skills, and MCP setup in reading order.
>
> **Canonical activation preparation:** The 25 local definitions listed below are still active. A later atomic Studio materialization is planned to provide 22 generated canonical agents and retain `finance-domain` as Finance's sole local agent. No sync or runtime-file removal has happened yet.

## Why AI-First?

Finance is developed with AI agents as first-class contributors. This means:

- **Every code change** can be initiated, reviewed, or refined by AI agents
- **Every decision** is documented with rationale (human or AI-generated)
- **Every configuration** for AI tooling lives in version control
- **Every agent** has a defined role, clear boundaries, and documented capabilities

## Documentation Index

### Core Workflow

| Document                                | Description                                                            |
| --------------------------------------- | ---------------------------------------------------------------------- |
| [Start Here](start-here.md)             | Canonical entry point for new agents and humans                        |
| [Workflow](workflow.md)                 | Day-to-day AI development workflow guide                               |
| [Agent Cookbook](agent-cookbook.md)     | Step-by-step recipes for common agent tasks                            |
| [Worktrees](worktrees.md)               | Git worktree setup and lifecycle for parallel agent work               |
| [Fleet Operations](fleet-operations.md) | Fleet dispatch patterns, CI monitoring, self-healing, and coordination |
| [CI Monitoring](ci-monitoring.md)       | Correct CI monitoring pattern using `gh pr checks`                     |
| [Slash Commands](slash-commands.md)     | Prototype Copilot CLI slash commands (`/feature`, `/issue`, `/sprint`) |
| [Troubleshooting](troubleshooting.md)   | Common issues and solutions for agent workflows                        |

### Agent Configuration

| Document                                    | Description                                                    |
| ------------------------------------------- | -------------------------------------------------------------- |
| [Agents](agents.md)                         | Custom Copilot agent definitions and their roles               |
| [Agent Instructions](agent-instructions.md) | Consolidated agent roles, skills, and workflow rules reference |
| [Skills](skills.md)                         | Reusable agent skills for domain knowledge                     |
| [Instructions](instructions.md)             | Copilot instruction files and how they work                    |
| [MCP](mcp.md)                               | Model Context Protocol server configuration                    |

### Governance & Quality

| Document                                                           | Description                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [Fleet CI Analysis](fleet-ci-analysis.md)                          | Historical (2026-04 snapshot) — root-cause analysis of fleet CI failures              |
| [Pain Points](pain-points.md)                                      | Tracked workflow friction, inefficiencies, and known issues                           |
| [Workflow Metrics](workflow-metrics.md)                            | Metrics for measuring workflow efficiency and quality                                 |
| [Restrictions](restrictions.md)                                    | Human-gated operations and AI safety guardrails                                       |
| [Responsible AI](responsible-ai.md)                                | Ethical AI principles, commitments, and product AI guidelines                         |
| [AI Code Policy](ai-code-policy.md)                                | Code ownership, copyright, and contributor responsibilities                           |
| [AI Governance](governance.md)                                     | NIST AI RMF crosswalk + EU AI Act note mapped to repo controls                        |
| [Incident Response](incident-response.md)                          | Runbook for agent misbehavior — injection, secret exposure, runaway merges            |
| [AI Practice CHANGELOG](CHANGELOG.md)                              | Decision log for how the AI practice has evolved over time                            |
| [AI-Practice Audit (2026-06)](audits/ai-practice-audit-2026-06.md) | Consultant-fleet audit of the AI-first practice — risks, gaps, and maturity scorecard |

## Quick Reference

### File Locations

```
.github/
├── CONTRIBUTING.md                   # Contribution guidelines
├── ISSUE_TEMPLATE/                   # Issue templates
├── copilot-instructions.md          # Global Copilot instructions
├── instructions/                     # Path-specific instructions (14 files as of 2026-06; .github/instructions/ is the source of truth)
│   ├── agents.instructions.md
│   ├── apps.instructions.md
│   ├── build-logic.instructions.md
│   ├── config.instructions.md
│   ├── docs.instructions.md
│   ├── export.instructions.md
│   ├── packages.instructions.md
│   ├── services.instructions.md
│   ├── skills.instructions.md
│   ├── tokens.instructions.md
│   ├── tools.instructions.md
│   ├── web.instructions.md
│   ├── workflow.instructions.md
│   └── workflows.instructions.md
├── agents/                           # Custom agent definitions (25 agents as of 2026-06; .github/agents/ is the source of truth)
│   ├── accessibility-reviewer.agent.md
│   ├── ai-ops-engineer.agent.md
│   ├── android-engineer.agent.md
│   ├── architect.agent.md
│   ├── backend-engineer.agent.md
│   ├── bug-basher.agent.md
│   ├── business-analyst.agent.md
│   ├── compliance-specialist.agent.md
│   ├── data-engineer.agent.md
│   ├── design-engineer.agent.md
│   ├── devops-engineer.agent.md
│   ├── docs-writer.agent.md
│   ├── experimentation-engineer.agent.md
│   ├── finance-domain.agent.md
│   ├── ios-engineer.agent.md
│   ├── kmp-engineer.agent.md
│   ├── localization-engineer.agent.md
│   ├── marketing-strategist.agent.md
│   ├── performance-engineer.agent.md
│   ├── product-manager.agent.md
│   ├── qa-tester.agent.md
│   ├── release-manager.agent.md
│   ├── security-reviewer.agent.md
│   ├── web-engineer.agent.md
│   └── windows-engineer.agent.md
├── skills/                           # Reusable domain knowledge (20 skills as of 2026-06; .github/skills/ is the source of truth)
│   ├── accessibility-testing/SKILL.md
│   ├── design-tokens/SKILL.md
│   ├── dev-onboarding/SKILL.md
│   ├── edge-sync/SKILL.md
│   ├── financial-modeling/SKILL.md
│   ├── fleet-orchestration/SKILL.md
│   ├── go-to-market/SKILL.md
│   ├── i18n-localization/SKILL.md
│   ├── issue-management/SKILL.md
│   ├── kmp-development/SKILL.md
│   ├── mcp-agent-tooling/SKILL.md
│   ├── monetization/SKILL.md
│   ├── performance-budgets/SKILL.md
│   ├── privacy-compliance/SKILL.md
│   ├── project-management/SKILL.md
│   ├── prompt-engineering/SKILL.md
│   ├── security-review-methodology/SKILL.md
│   ├── sprint-planning/SKILL.md
│   ├── supabase-powersync/SKILL.md
│   └── ux-testing/SKILL.md
└── workflows/                        # CI/CD workflows
    └── copilot-setup-steps.yml       # CI environment for coding agent

.vscode/
├── mcp.json                          # MCP server configuration
├── settings.json                     # Copilot-optimized editor settings
└── extensions.json                   # Recommended extensions

AGENTS.md                             # Root-level agent guidance (all AI tools)
```

### Future Canonical Mapping (Not Active)

This table records where each current authoritative role's Finance-specific behavior will live after activation. Same-slug entries become Studio-generated canonical definitions supplemented by local overlays.

| Current role               | Future runtime target                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `accessibility-reviewer`   | Canonical `accessibility-reviewer`; four-platform checks and review-only routing stay in local instructions |
| `ai-ops-engineer`          | Canonical `ai-ops-engineer`; Finance overlay and manifest conventions stay local                            |
| `android-engineer`         | Canonical `native-app-engineer`                                                                             |
| `architect`                | Canonical `architect`                                                                                       |
| `backend-engineer`         | Canonical `backend-engineer`, with database and reliability seams routed separately                         |
| `bug-basher`               | No permanent role; `.github/prompts/bug-bash.prompt.md` plus workflow instructions                          |
| `business-analyst`         | Canonical `business-analyst`                                                                                |
| `compliance-specialist`    | Canonical `compliance-specialist`                                                                           |
| `data-engineer`            | Canonical `data-engineer`; product telemetry remains distinct from financial reporting                      |
| `design-engineer`          | Canonical `design-engineer`                                                                                 |
| `devops-engineer`          | Canonical `devops-engineer`; SLO/incident/recovery semantics route to `sre-engineer`                        |
| `docs-writer`              | Canonical `docs-writer`                                                                                     |
| `experimentation-engineer` | Canonical `experimentation-engineer`                                                                        |
| `finance-domain`           | **Local `finance-domain` retained** as Finance's financial-correctness specialist                           |
| `ios-engineer`             | Canonical `native-app-engineer`                                                                             |
| `kmp-engineer`             | Canonical `native-app-engineer`                                                                             |
| `localization-engineer`    | Canonical `localization-engineer`                                                                           |
| `marketing-strategist`     | Canonical `marketing-strategist`                                                                            |
| `performance-engineer`     | Canonical `performance-engineer`                                                                            |
| `product-manager`          | Canonical `product-manager`                                                                                 |
| `qa-tester`                | Canonical `qa-tester`                                                                                       |
| `release-manager`          | Canonical `release-manager`                                                                                 |
| `security-reviewer`        | Canonical `security-reviewer`                                                                               |
| `web-engineer`             | Canonical `web-engineer`                                                                                    |
| `windows-engineer`         | Canonical `native-app-engineer`                                                                             |

The planned canonical roster is: `accessibility-reviewer`, `ai-ops-engineer`, `architect`, `backend-engineer`, `business-analyst`, `compliance-specialist`, `data-engineer`, `database-engineer`, `design-engineer`, `devops-engineer`, `docs-writer`, `experimentation-engineer`, `localization-engineer`, `marketing-strategist`, `native-app-engineer`, `performance-engineer`, `product-manager`, `qa-tester`, `release-manager`, `security-reviewer`, `sre-engineer`, and `web-engineer`.

The future runtime therefore contains 23 physical agent files: 22 generated canonical files and one Finance-authored local file. Activation remains blocked until the backbone member configuration opts Finance into canonical agents, declares `finance-domain` as local, resolves canonical skill references, and confirms the database/SRE/DevOps ownership seams. Until then, counts and active dispatch continue to reflect the 25-file roster. `node tools/check-ai-manifest.js --strict` validates both current filesystem counts and this preparation mapping.

### Supported AI Tools

| Tool                        | Usage                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| GitHub Copilot (VS Code)    | In-editor completions, chat, agent mode                                                                              |
| GitHub Copilot CLI          | Terminal-based AI assistance, `/fleet` for parallel agents                                                           |
| GitHub Copilot Coding Agent | Autonomous issue-to-PR workflow on GitHub                                                                            |
| MCP Servers                 | Extended tool access (7 servers as of 2026-06 — see [MCP Configuration](mcp.md) for the authoritative, current list) |

## Getting Started with AI Development

1. Install [VS Code](https://code.visualstudio.com/) with the [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) and [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) extensions
2. Ensure `github.copilot.chat.agent.enabled` is `true` in VS Code settings (already configured in `.vscode/settings.json`)
3. Review the [Workflow Guide](workflow.md) for day-to-day usage
4. Familiarize yourself with the [Custom Agents](agents.md) available in this project
