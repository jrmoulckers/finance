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

### `token-preview-serve.mjs` — Design token preview with hot reload

Generates a self-contained HTML preview of all design tokens (primitive, semantic, component) and serves it on `localhost:3333` with live reload. When any token JSON file changes, the preview regenerates and the browser refreshes automatically via Server-Sent Events.

**Usage:**

```bash
# Start the dev server (port 3333)
npm run tokens:preview

# Or with a custom port
node tools/token-preview-serve.mjs --port 4000

# Generate the HTML without serving (CI, snapshots)
npm run tokens:preview:generate
```

**What the preview shows:**

| Section          | Description                                                     |
| ---------------- | --------------------------------------------------------------- |
| Primitive Colors | Full palette grids with hex values                              |
| Chart Colors     | IBM CVD-safe data visualization palette                         |
| Semantic Colors  | Light / Dark / OLED Dark themes side by side                    |
| WCAG Contrast    | Contrast ratio checks for all text/background pairs per theme   |
| Typography       | Live-rendered type scale samples (Display → Caption)            |
| Spacing          | Horizontal bar visualization of the 4px/8px spacing scale       |
| Border Radius    | Visual samples of each radius token                             |
| Elevation        | Shadow samples from none → xl                                   |
| Motion           | Duration and easing token values with animated indicators       |

Output: `packages/design-tokens/build/preview/index.html` (gitignored build artifact).

### `token-preview-generate.mjs` — Standalone token preview generator

The generation engine used by `token-preview-serve.mjs`. Can be run independently to produce the HTML preview without starting a server.

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
