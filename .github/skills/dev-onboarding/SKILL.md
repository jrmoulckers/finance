---
name: dev-onboarding
description: >
  Developer onboarding and environment setup knowledge for the Finance
  monorepo. Use for topics related to setup, install, onboarding, getting
  started, prerequisites, environment, or new developer.
---

# Developer Onboarding Skill

This skill provides knowledge for setting up the Finance development environment and onboarding new contributors.

## Prerequisites Checklist

| Tool | Minimum Version | Install Guide | Purpose |
|------|----------------|---------------|---------|
| Git | 2.40+ | https://git-scm.com/ | Version control |
| Node.js | 22+ | https://nodejs.org/ | Build tools, MCP servers |
| VS Code | 1.99+ | https://code.visualstudio.com/ | Primary editor |
| GitHub Copilot | Latest | VS Code Marketplace | AI completions + chat |
| GitHub Copilot Chat | Latest | VS Code Marketplace | Agent mode, custom agents |

### Platform-Specific Prerequisites (Add as needed)

| Platform | Tools | Status |
|----------|-------|--------|
| iOS/macOS | Xcode 16+, Swift 6+ | 📋 Not yet configured |
| Android | Android Studio, Kotlin 2+ | 📋 Not yet configured |
| Web | Already covered by Node.js | ✅ Ready |
| Windows | Visual Studio 2022+, .NET 9+ | 📋 Not yet configured |

## First-Time Setup Steps

```bash
# 1. Clone
git clone https://github.com/jrmoulckers/finance.git
cd finance

# 2. Install Node.js dependencies
npm install

# 3. Open in VS Code
code .

# 4. Wait for VS Code to prompt for recommended extensions
# 5. Accept all extension install recommendations

# 6. Open Copilot Chat (Ctrl+Shift+I or Cmd+Shift+I)
# 7. Enable Agent Mode if not already enabled
# 8. VS Code will prompt for GitHub PAT when MCP GitHub server is first used
```

## MCP Server Verification

After opening the workspace, verify MCP servers are running:

1. Open Command Palette: `Ctrl+Shift+P` / `Cmd+Shift+P`
2. Type: `MCP: List Servers`
3. You should see these servers:
   - `github` — GitHub API access (requires PAT)
   - `sequential-thinking` — Step-by-step reasoning
   - `memory` — Persistent context across sessions
   - `filesystem` — File system access for Copilot
   - `context7` — Live documentation injection

If a server shows as stopped, right-click → Start, or check the Output panel for errors.

## GitHub PAT Scopes

When prompted for a Personal Access Token for the GitHub MCP server, create one at https://github.com/settings/tokens with these scopes:

- `repo` — Full repository access
- `read:org` — Read organization membership

## Common Onboarding Issues

### MCP servers won't start
- **Cause:** Node.js not installed or wrong version
- **Fix:** Install Node.js 22+ and restart VS Code

### Copilot Chat doesn't show agent mode
- **Cause:** Extension outdated or setting disabled
- **Fix:** Update Copilot Chat extension, ensure `github.copilot.chat.agent.enabled` is `true` in settings

### Extensions not auto-installing
- **Cause:** VS Code didn't detect `.vscode/extensions.json`
- **Fix:** Open Command Palette → `Extensions: Show Recommended Extensions` → Install All

### `npm ci` fails in CI
- **Cause:** No `package-lock.json` in repo
- **Fix:** Run `npm install` locally and commit the generated `package-lock.json`

## Verifying Setup Works

After setup, test by opening Copilot Chat and asking:

```
@architect What is the current architecture of this project?
```

If the agent responds with relevant context about the Finance monorepo, your AI setup is working correctly.
