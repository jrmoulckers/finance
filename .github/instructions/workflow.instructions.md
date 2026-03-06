# Issue-First Development Workflow

Every code change in this repository MUST be linked to a GitHub issue.

## Rules for AI Agents

1. **Before writing any code**, verify that a GitHub issue exists for the work. If no issue exists, create one first using `gh issue create`.
2. **Reference the issue** in every commit message using the format: `type(scope): description (#N)` where N is the issue number.
3. **Never implement features, fixes, or refactors** without a corresponding issue — even for small changes.
4. **When planning work**, decompose into issues BEFORE starting implementation. Use the project board to track status.
5. **PR descriptions** must include `Closes #N` or `Refs #N` for every issue addressed.

## Commit Message Format

```
type(scope): description (#123)
```

Examples:
- `feat(core): implement budget calculator (#134)`
- `fix(models): add JvmInline imports for KMP targets (#130)`
- `docs: update README with getting started guide (#86)`

## Why This Matters

- Enables traceability from code → PR → issue → roadmap
- Keeps the project board accurate and up-to-date
- Ensures no work is lost or duplicated
- Makes it easy to understand what changed and why
