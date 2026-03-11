# Tools

Development tooling and scripts for the Finance monorepo.

## Overview

This directory contains cross-platform scripts and Git hooks that support the development workflow. Scripts prefer Node.js for portability across Windows, macOS, and Linux.

## Contents

### `gradle.js` — Cross-platform Gradle wrapper

A Node.js script that invokes `gradlew` (Unix) or `gradlew.bat` (Windows) automatically based on the current OS. It also auto-detects JDK 21 if `JAVA_HOME` is not already set.

**Usage:**

```bash
# Instead of ./gradlew or gradlew.bat:
node tools/gradle.js <gradle-args>

# Examples
node tools/gradle.js :packages:core:build
node tools/gradle.js allTests
node tools/gradle.js clean
```

### `git-hooks/` — Custom Git hooks

Contains hooks that enforce repository safety rules. See [`git-hooks/README.md`](git-hooks/README.md) for full details.

**Setup (one-time per clone):**

```bash
git config core.hooksPath tools/git-hooks
```

**Available hooks:**

| Hook       | Purpose                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pre-push` | Requires interactive human confirmation before `git push`. Blocks non-interactive sessions (AI agents, CI) automatically. |

## Adding New Tools

- Write scripts in Node.js for cross-platform compatibility
- Include a usage comment at the top of each script
- Support a `--help` flag or equivalent
- Validate inputs and fail with clear error messages
