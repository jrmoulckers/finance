# Contributing to Finance

Thank you for contributing to Finance! This project uses AI agents as first-class development tools alongside human contributors. This guide will get you set up.

## Prerequisites

Before cloning, ensure you have:

| Tool | Version | Purpose |
|------|---------|---------|
| [Git](https://git-scm.com/) | 2.40+ | Version control |
| [Node.js](https://nodejs.org/) | 22+ | Build tools, MCP servers |
| [VS Code](https://code.visualstudio.com/) | 1.99+ | Primary editor |
| [GitHub Copilot](https://github.com/features/copilot) | Pro+ recommended | AI development |

### VS Code Extensions (Required)

These install automatically when you open the workspace (via `.vscode/extensions.json`):

- **GitHub Copilot** — AI completions
- **GitHub Copilot Chat** — AI chat and agent mode
- **EditorConfig** — Consistent formatting

### VS Code Extensions (Recommended)

- **GitLens** — Git history and blame
- **Markdown All in One** — Doc authoring
- **Markdown Mermaid** — Diagram rendering
- **Code Spell Checker** — Typo detection

## Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/jrmoulckers/finance.git
cd finance

# 2. Install git hooks (required — blocks AI agents from pushing)
git config core.hooksPath tools/git-hooks

# 3. Install dependencies
npm install

# 4. Open in VS Code
code .
```

When VS Code opens, it will:
- Prompt you to install recommended extensions
- Load Copilot instructions and agent configurations automatically
- Start MCP servers when you open Copilot Chat

### MCP Server Setup

The project uses several MCP (Model Context Protocol) servers to enhance Copilot's capabilities. These are configured in `.vscode/mcp.json` and require:

1. **Node.js 22+** — MCP servers run via `npx`
2. **GitHub PAT (read-only)** — For the GitHub MCP server, create a [fine-grained Personal Access Token](https://github.com/settings/personal-access-tokens/new) scoped to the `jrmoulckers/finance` repository with **read-only** permissions (Contents, Issues, Pull requests, Metadata). ⚠️ Do NOT use a classic PAT with `repo` write scope — this would allow AI agents to bypass local restrictions via the API.

MCP servers start automatically in Copilot Chat Agent Mode. Check them with: `Ctrl+Shift+P` → `MCP: List Servers`.

## AI Development Workflow

### Using Custom Agents

This project has 5 specialized agents you can invoke in Copilot Chat:

```
@architect    — System design and architecture decisions
@docs-writer  — Documentation authoring and maintenance
@security-reviewer — Security and privacy code review
@accessibility-reviewer — Accessibility compliance review
@finance-domain — Financial logic and domain modeling
```

### Using Fleet Mode (Parallel Agents)

For large tasks, use Copilot CLI's `/fleet` command to run multiple agents in parallel:

```bash
# In Copilot CLI
/fleet implement transaction categorization with tests and docs
```

This breaks the task down and dispatches subtasks to specialized agents concurrently.

### Coding Agent (GitHub Issues)

You can assign GitHub issues to `@copilot` to have the coding agent work autonomously:

1. Create a well-described issue
2. Assign it to `@copilot`
3. The agent creates a PR with proposed changes
4. Review the PR in the repo's "Agents" tab

## Code Standards

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

Types: feat, fix, docs, style, refactor, test, chore, ci, perf
Scope: the app/package/service being changed
```

When AI agents create commits, include the trailer:
`Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`

### Issue References (Required)

Every commit must reference a GitHub issue number. Include `(#N)` at the end of the commit subject line:

```
feat(core): implement savings rate calculation (#137)
```

If no issue exists for your change, create one first with `gh issue create`.

### Security Rules (Financial App)

- **NEVER** hardcode secrets, API keys, or credentials
- **NEVER** log sensitive financial data
- **ALWAYS** use parameterized queries
- **ALWAYS** encrypt financial data at rest and in transit
- **ALWAYS** validate and sanitize inputs

### Accessibility Rules

- All UI must meet WCAG 2.2 AA minimum
- Test with screen readers (VoiceOver, TalkBack, NVDA)
- Support keyboard navigation and focus management
- Never convey information through color alone

### Financial Calculation Rules

- **NEVER** use floating point for money — use integer cents
- Use banker's rounding (round half to even)
- Always store ISO 4217 currency codes with monetary values

## Project Structure

```
finance/
├── apps/           # Platform-specific apps (iOS, Android, Web, Windows)
├── packages/       # Shared libraries (core, models, sync)
├── services/       # Backend API (sync layer only)
├── docs/           # Documentation (ai, architecture, design)
├── tools/          # Development tools and scripts
├── .github/        # GitHub config, Copilot agents/skills/instructions
└── .vscode/        # VS Code workspace config (MCP, settings)
```

## Need Help?

- Read `docs/ai/` for full AI workflow documentation
- Check `AGENTS.md` for AI agent guidance
- Review `.github/copilot-instructions.md` for coding standards
