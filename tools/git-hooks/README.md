# Git Hooks

This directory contains custom Git hooks for the Finance monorepo.

## Setup

To install the hooks, run this command from the repository root:

```bash
git config core.hooksPath tools/git-hooks
```

This is a **one-time setup** per clone. It tells Git to use hooks from this directory instead of the default `.git/hooks/`.

## Available Hooks

### `pre-push`

**Purpose:** Requires interactive human confirmation before any `git push`.

**How it works:**
1. Detects whether the session is interactive (has a terminal/TTY)
2. If **non-interactive** (e.g., AI agent, CI script): **blocks the push automatically**
3. If **interactive** (human in a terminal): prompts for confirmation by typing `push`

**Why this exists:** AI agents should never push to remote repositories without human approval. This hook enforces that restriction at the Git level, complementing the server-side branch protection rules on GitHub.

**Bypassing:** If you need to bypass this hook (emergency), use `git push --no-verify`. This should be extremely rare and documented.
