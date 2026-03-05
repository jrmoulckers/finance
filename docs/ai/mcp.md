# MCP Server Configuration — Finance

The Model Context Protocol (MCP) extends GitHub Copilot's capabilities by connecting it to external tools, APIs, and services. MCP configuration for this project lives in `.vscode/mcp.json`.

## What is MCP?

MCP (Model Context Protocol) is a standard that allows AI agents to interact with external systems through a unified interface. In VS Code, MCP servers appear as tools available to Copilot Chat in Agent Mode.

## Current Configuration

### GitHub MCP Server

**File:** `.vscode/mcp.json`

```json
{
  "servers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${input:github_mcp_pat}"
      }
    }
  }
}
```

This connects Copilot to GitHub's API, enabling:
- Issue and PR management from Copilot Chat
- Repository search and file browsing
- Actions workflow inspection
- Code search across GitHub

**Setup:** When first used, VS Code will prompt for a GitHub Personal Access Token.

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

## Planned MCP Servers

As the project develops, we may add MCP servers for:

| Server | Purpose | Status |
|--------|---------|--------|
| GitHub | GitHub API access | ✅ Configured |
| Database | Local dev database queries | 📋 Planned |
| Design System | Component library reference | 📋 Planned |
| Analytics | Usage data queries (anonymized) | 📋 Planned |

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
