# AI Development Workflow — Finance

This guide describes how to work with AI agents day-to-day when developing the Finance application.

## Tools Overview

### GitHub Copilot in VS Code

The primary AI development interface. Provides:

- **Inline completions** — Context-aware code suggestions as you type
- **Copilot Chat** — Conversational AI with full codebase context
- **Agent Mode** — Autonomous multi-step task execution with tool use
- **Custom agents** — Invoke specialized agents with `@agent-name`
- **MCP tools** — Extended capabilities through Model Context Protocol servers

### GitHub Copilot CLI

Terminal-based AI assistance for:

- Command-line task automation
- Multi-file editing from the terminal
- Build/test debugging
- Git workflow automation

### GitHub Copilot Coding Agent

Autonomous agent that runs on GitHub's infrastructure:

- Assign issues to `@copilot` on GitHub to trigger
- Runs in an isolated environment configured by `copilot-setup-steps.yml`
- Creates PRs with proposed changes
- Can run builds and tests to validate its work
- Managed via the repository's "Agents" tab on GitHub

## Daily Workflows

### 1. Feature Development

```
1. Create a GitHub issue describing the feature
2. (Option A) Work locally with VS Code Copilot Chat in Agent Mode
3. (Option B) Assign the issue to @copilot for autonomous development
4. Request review from @security-reviewer and @accessibility-reviewer
5. Merge when all checks pass
```

### 2. Code Review with AI

```
1. Open a PR
2. In Copilot Chat, ask @security-reviewer to review the changes
3. Ask @accessibility-reviewer for any UI changes
4. Ask @finance-domain to verify financial logic correctness
5. Address flagged issues, then proceed with human review
```

### 3. Architecture Decisions

```
1. Ask @architect to evaluate options for a design decision
2. @architect creates an ADR in docs/architecture/
3. Review and discuss the ADR
4. Update agents/instructions if the decision changes coding patterns
```

### 4. Documentation Updates

```
1. After merging code changes, ask @docs-writer to update relevant docs
2. @docs-writer ensures README files, API docs, and AI docs stay current
3. Review for accuracy
```

### 5. Fleet Mode (Parallel Agent Execution)

For complex, multi-faceted tasks, use Copilot CLI's `/fleet` command:

```bash
# Break a large task into parallel subtasks
/fleet implement transaction categorization with tests and documentation

# Fleet orchestrator will:
# 1. Analyze the task and identify subtasks
# 2. Dispatch subtasks to specialized agents in parallel
# 3. Manage dependencies between subtasks
# 4. Aggregate results
```

**Best practices for fleet mode:**

- Describe the full scope so the orchestrator can partition effectively
- Works best for tasks with naturally separable concerns (code + tests + docs)
- Monitor progress — intervene if agents drift or conflict
- Review all PRs before merging, especially when agents touch overlapping files

## Using Custom Agents

### In VS Code Copilot Chat

Type `@` followed by the agent name:

```
@architect How should we structure the sync protocol for offline-first support?
@security-reviewer Review this PR for security issues
@accessibility-reviewer Check this component for WCAG compliance
@finance-domain Is this budgeting calculation correct?
@docs-writer Update the API docs for the new endpoint
```

### On GitHub (Coding Agent)

1. Create an issue with clear requirements
2. Assign to `@copilot`
3. The coding agent will:
   - Read the issue and relevant code
   - Load applicable instructions and skills
   - Make changes and create a PR
   - Run tests if configured in `copilot-setup-steps.yml`
4. Review the PR in the "Agents" tab

## Updating AI Configuration

### When to Update Instructions

- New coding standards adopted → Update `copilot-instructions.md`
- New directory added → Consider a new path-specific instruction file
- Platform-specific patterns established → Update `apps.instructions.md`

### When to Update Agents

- New specialist role needed → Create a new `.agent.md`
- Agent producing poor results → Refine instructions in its `.agent.md`
- Project scope changes → Update agent boundaries

### When to Update Skills

- New domain knowledge needed → Create a new skill directory with `SKILL.md`
- Existing knowledge outdated → Update the skill's Markdown body
- New trigger keywords needed → Update the skill's description in frontmatter

### When to Update MCP

- New external tool needed → Add server to `.vscode/mcp.json`
- API credentials rotated → Update tokens via VS Code input prompts
- New team member onboarding → Ensure they have required API access

## Best Practices

1. **Start with AI, refine with humans** — Let agents draft, then critically review
2. **Use the right agent** — Don't ask a generic Copilot when a specialist exists
3. **Provide context** — The more specific your prompt, the better the output
4. **Review critically** — AI agents make mistakes, especially with financial logic
5. **Keep config current** — Stale instructions produce stale output
6. **Document everything** — If an agent made a decision, document the rationale
7. **Test AI output** — All AI-generated code must pass the same tests as human code

## Troubleshooting

### Agent not loading instructions

- Verify `copilot-instructions.md` is on the default branch
- Check that `applyTo` globs in instruction files match your file paths
- Ensure VS Code Copilot extensions are up to date

### MCP server not connecting

- Run `MCP: List Servers` in Command Palette to check status
- Verify API tokens are valid
- Check VS Code Output panel → "GitHub Copilot" channel for errors

### Coding agent not starting

- Ensure `copilot-setup-steps.yml` is on the default branch
- Verify the job is named exactly `copilot-setup-steps`
- Check GitHub Actions tab for workflow run errors
