# MCP Server Configuration — Finance

The Model Context Protocol (MCP) extends GitHub Copilot's capabilities by connecting it to external tools, APIs, and services. MCP configuration for this project lives in `.vscode/mcp.json`.

## What is MCP?

MCP (Model Context Protocol) is a standard that allows AI agents to interact with external systems through a unified interface. In VS Code, MCP servers appear as tools available to Copilot Chat in Agent Mode.

## Current Configuration

### Servers

The following MCP servers are configured in `.vscode/mcp.json`:

#### 1. GitHub (`github`)
- **Type:** HTTP
- **Purpose:** GitHub API access — issue/PR management, code search, Actions inspection
- **Auth:** GitHub Personal Access Token (prompted on first use)
- **PAT scopes needed:** Read-only fine-grained token scoped to this repo (Contents, Issues, PRs, Metadata). ⚠️ Do NOT use `repo` write scope — this bypasses local git hooks.
- **Risk level:** LOW with read-only PAT; HIGH with write PAT

#### 2. Sequential Thinking (`sequential-thinking`)
- **Type:** stdio (runs locally via npx)
- **Purpose:** Enables step-by-step chain-of-thought reasoning for complex tasks
- **Why:** Dramatically improves accuracy for debugging, architecture analysis, and multi-step problem solving
- **No auth required**

#### 3. Memory (`memory`)
- **Type:** stdio (runs locally via npx)
- **Purpose:** Persistent memory across Copilot Chat sessions
- **Why:** Maintains context about ongoing work, decisions, and patterns even after session resets
- **No auth required**

#### 4. Filesystem (`filesystem`)
- **Type:** stdio (runs locally via npx)
- **Purpose:** Sandboxed file system access scoped to the workspace
- **Why:** Enables Copilot to read, write, and search files directly during agent mode
- **No auth required**

#### 5. Context7 (`context7`)
- **Type:** stdio (runs locally via npx)
- **Purpose:** Injects up-to-date library/framework documentation into prompts
- **Why:** Ensures Copilot uses current API signatures instead of outdated training data
- **No auth required**

## Adding MCP Servers

### HTTP/REST Servers

For cloud APIs:
```json
{
  "servers": {
    "my-api": {
      "type": "http",
      "url": "https://api.example.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${input:api_key}"
      }
    }
  }
}
```

### Stdio Servers (Local Tools)

For local tools and scripts:
```json
{
  "servers": {
    "my-tool": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@some-package/mcp-server"]
    }
  }
}
```

## Managing MCP Servers in VS Code

1. **View servers:** Command Palette → `MCP: List Servers`
2. **Start/stop:** Command Palette → `MCP: Start Server` / `MCP: Stop Server`
3. **Configure tools:** In Copilot Chat, click the tools icon to enable/disable specific tools

## MCP Server Status

All configured and planned MCP servers:

| Server | Purpose | Status |
|--------|---------|--------|
| GitHub | GitHub API access | ✅ Configured |
| Sequential Thinking | Step-by-step reasoning | ✅ Configured |
| Memory | Persistent context | ✅ Configured |
| Filesystem | Sandboxed file access | ✅ Configured |
| Context7 | Live docs injection | ✅ Configured |
| Database | Local dev database queries | 📋 Planned |
| Playwright | Browser automation & E2E testing | 📋 Planned |

## Security Notes

- MCP servers can execute arbitrary code — **only use trusted server definitions**
- Store API keys and tokens using VS Code's `${input:...}` prompt mechanism, not hardcoded
- Review the `.vscode/mcp.json` file when pulling changes — ensure no untrusted servers were added
- MCP configuration is committed to version control so the team shares the same setup

## Prerequisites

- VS Code 1.99 or later
- GitHub Copilot extension with active subscription
- GitHub Copilot Chat extension
- Agent Mode enabled: `github.copilot.chat.agent.enabled: true` (configured in `.vscode/settings.json`)
