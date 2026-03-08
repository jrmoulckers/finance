# AI Development Workflow — Finance

This directory contains comprehensive documentation for the AI-first development workflow used in the Finance monorepo. Every aspect of AI agent configuration, tooling, and usage is documented here for full transparency.

## Why AI-First?

Finance is developed with AI agents as first-class contributors. This means:

- **Every code change** can be initiated, reviewed, or refined by AI agents
- **Every decision** is documented with rationale (human or AI-generated)
- **Every configuration** for AI tooling lives in version control
- **Every agent** has a defined role, clear boundaries, and documented capabilities

## Documentation Index

| Document | Description |
|----------|-------------|
| [Agents](agents.md) | Custom Copilot agent definitions and their roles |
| [Skills](skills.md) | Reusable agent skills for domain knowledge |
| [Instructions](instructions.md) | Copilot instruction files and how they work |
| [MCP](mcp.md) | Model Context Protocol server configuration |
| [Workflow](workflow.md) | Day-to-day AI development workflow guide |
| [Restrictions](restrictions.md) | Human-gated operations and AI safety guardrails |
| [Responsible AI](responsible-ai.md) | Ethical AI principles, commitments, and product AI guidelines |
| [AI Code Policy](ai-code-policy.md) | Code ownership, copyright, and contributor responsibilities |

## Quick Reference

### File Locations

```
.github/
├── CONTRIBUTING.md                   # Contribution guidelines
├── ISSUE_TEMPLATE/                   # Issue templates
├── copilot-instructions.md          # Global Copilot instructions
├── instructions/                     # Path-specific instructions
│   ├── apps.instructions.md
│   ├── packages.instructions.md
│   ├── services.instructions.md
│   └── docs.instructions.md
├── agents/                           # Custom agent definitions (13 agents)
│   ├── accessibility-reviewer.agent.md
│   ├── android-engineer.agent.md
│   ├── architect.agent.md
│   ├── backend-engineer.agent.md
│   ├── design-engineer.agent.md
│   ├── devops-engineer.agent.md
│   ├── docs-writer.agent.md
│   ├── finance-domain.agent.md
│   ├── ios-engineer.agent.md
│   ├── kmp-engineer.agent.md
│   ├── security-reviewer.agent.md
│   ├── web-engineer.agent.md
│   └── windows-engineer.agent.md
├── skills/                           # Reusable domain knowledge (6 skills)
│   ├── dev-onboarding/SKILL.md
│   ├── edge-sync/SKILL.md
│   ├── financial-modeling/SKILL.md
│   ├── kmp-development/SKILL.md
│   ├── privacy-compliance/SKILL.md
│   └── supabase-powersync/SKILL.md
└── workflows/                        # CI/CD workflows
    └── copilot-setup-steps.yml       # CI environment for coding agent

.vscode/
├── mcp.json                          # MCP server configuration
├── settings.json                     # Copilot-optimized editor settings
└── extensions.json                   # Recommended extensions

AGENTS.md                             # Root-level agent guidance (all AI tools)
```

### Supported AI Tools

| Tool | Usage |
|------|-------|
| GitHub Copilot (VS Code) | In-editor completions, chat, agent mode |
| GitHub Copilot CLI | Terminal-based AI assistance, `/fleet` for parallel agents |
| GitHub Copilot Coding Agent | Autonomous issue-to-PR workflow on GitHub |
| MCP Servers | Extended tool access (5 servers: GitHub, sequential-thinking, memory, filesystem, context7) |

## Getting Started with AI Development

1. Install [VS Code](https://code.visualstudio.com/) with the [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) and [GitHub Copilot Chat](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) extensions
2. Ensure `github.copilot.chat.agent.enabled` is `true` in VS Code settings (already configured in `.vscode/settings.json`)
3. Review the [Workflow Guide](workflow.md) for day-to-day usage
4. Familiarize yourself with the [Custom Agents](agents.md) available in this project
