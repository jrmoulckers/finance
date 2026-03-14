# Copilot Instructions — Finance

Instruction files tell GitHub Copilot how to behave when working in specific parts of the codebase. They provide coding standards, architectural constraints, and domain-specific rules.

## Instruction File Types

### 1. Global Instructions

**File:** `.github/copilot-instructions.md`

This file is loaded for ALL Copilot interactions in the repository. It contains:

- Architecture context (monorepo structure, edge-first design)
- Code quality requirements
- Security rules (critical for a financial application)
- Accessibility standards
- Privacy and ethics guidelines
- Commit message conventions
- Dependency management rules

### 2. Path-Specific Instructions

**Directory:** `.github/instructions/`

These files use YAML frontmatter with `applyTo` globs to scope instructions to specific directories or file types. They are loaded only when Copilot is working on matching files.

| File                       | Applies To    | Purpose                                 |
| -------------------------- | ------------- | --------------------------------------- |
| `apps.instructions.md`     | `apps/**`     | Platform-specific app development rules |
| `packages.instructions.md` | `packages/**` | Shared library development rules        |
| `services.instructions.md` | `services/**` | Backend service development rules       |
| `docs.instructions.md`     | `docs/**`     | Documentation standards                 |
| `tools.instructions.md`    | `tools/**`    | Development tools and scripts           |

## How Instructions Are Loaded

```
User opens a file in apps/ios/SomeView.swift
  → Copilot loads: copilot-instructions.md (global)
  → Copilot loads: apps.instructions.md (matches apps/**)
  → Copilot does NOT load: packages.instructions.md (doesn't match)
```

Instructions stack — global instructions always apply, and matching path-specific instructions layer on top.

## Writing Good Instructions

### Do

- Be specific and actionable ("Use integer cents for money" not "Be careful with money")
- Include concrete examples where helpful
- State what TO do and what NOT to do
- Focus on rules that differ from general best practices (Copilot already knows generic best practices)
- Keep instructions concise — agents have context limits

### Don't

- Don't repeat the same rules across multiple instruction files
- Don't include implementation details that change frequently
- Don't write instructions so long they consume excessive agent context
- Don't use instructions for one-off guidance — use PR comments instead

## Adding a New Instruction File

1. Create `.github/instructions/<name>.instructions.md`
2. Add YAML frontmatter with the `applyTo` glob:
   ```yaml
   ---
   applyTo: 'path/to/files/**'
   ---
   ```
3. Write clear, scoped instructions in Markdown
4. Update this document with the new file's details

## Relationship to Other AI Config

```
AGENTS.md              → Guidance for ALL AI tools (Copilot, Codex, Claude, etc.)
copilot-instructions.md → Global rules for GitHub Copilot specifically
instructions/*.md       → Scoped rules for specific paths/file types
agents/*.agent.md       → Specialized agent personas
skills/*/SKILL.md       → Reusable domain knowledge
```

Each layer serves a different purpose. Instructions define **rules**; agents define **roles**; skills define **knowledge**.
