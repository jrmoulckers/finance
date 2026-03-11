# Finance

![CI — Shared Packages](https://github.com/jrmoulckers/finance/actions/workflows/ci.yml/badge.svg)
![Lint & Format](https://github.com/jrmoulckers/finance/actions/workflows/lint-format.yml/badge.svg)
![Web CI](https://github.com/jrmoulckers/finance/actions/workflows/web-ci.yml/badge.svg)
![PR Title](https://github.com/jrmoulckers/finance/actions/workflows/pr-title.yml/badge.svg)
![License](https://img.shields.io/badge/license-BSL--1.1-blue)

A multi-platform, native-first financial tracking application for personal, family, and partnered finances.

## Table of Contents

- [Vision](#vision)
- [Project Status](#project-status)
- [Monorepo Health](#monorepo-health)
- [Principles](#principles)
- [Platforms](#platforms)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
- [Commands](#commands)
- [AI-First Development](#ai-first-development)
- [License](#license)

## Vision

Finance aspires to re-think and re-vitalize the desire to track every financial aspect of one's life — from daily habits to long-term impacts of financial goals.

## Project Status

All 8 development phases are **complete**. The project is in pre-launch (v0.1.0).

| Phase | Name              | Status      |
| ----- | ----------------- | ----------- |
| 0     | Foundation        | ✅ Complete |
| 1     | Core Engine       | ✅ Complete |
| 2     | Sync & Backend    | ✅ Complete |
| 3     | Android App       | ✅ Complete |
| 4     | iOS App           | ✅ Complete |
| 5     | Web PWA           | ✅ Complete |
| 6     | Windows App       | ✅ Complete |
| 7     | Advanced Features | ✅ Complete |
| 8     | Polish & Launch   | ✅ Complete |

**What's implemented:** KMP shared business logic, Supabase backend with RLS + E2E encryption, PowerSync offline-first sync, platform-native apps on all 4 targets, design token pipeline, CI/CD workflows, accessibility (WCAG 2.2 AA), biometric auth, multi-currency support, recurring transactions, and financial analytics.

**Current focus:** Tech debt cleanup, CI hardening, and launch preparation. See the [detailed roadmap](docs/architecture/roadmap.md) and [open issues](https://github.com/jrmoulckers/finance/issues) for what's next.

## Monorepo Health

### Packages

| Package           | Purpose                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| `packages/core`   | Core business logic — budgeting, categorization, goal tracking, analytics    |
| `packages/models` | Shared data models and schemas — accounts, transactions, budgets, goals      |
| `packages/sync`   | Data synchronization engine — conflict resolution, offline queue, delta sync |

### Platform Coverage

4 native platforms built from shared KMP logic:

| Platform              | App            | UI Framework       |
| --------------------- | -------------- | ------------------ |
| iOS / macOS / watchOS | `apps/ios`     | SwiftUI            |
| Android / Wear OS     | `apps/android` | Jetpack Compose    |
| Web (PWA)             | `apps/web`     | React + TypeScript |
| Windows 11            | `apps/windows` | Compose Desktop    |

### Test Coverage

- **KMP JVM tests** — Unit tests for all shared packages run via `npm run test:kmp`
- **Web tests** — Web app tests run via the `web-ci` workflow
- **Lint & format** — All workspaces checked via `npm run lint` and `npm run format`

### CI Workflows

All workflows run on GitHub Actions — see badges at the top of this README.

| Workflow                                                                                  | What it checks                                 |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [CI — Shared Packages](https://github.com/jrmoulckers/finance/actions/workflows/ci.yml)   | KMP build + JVM unit tests for `packages/*`    |
| [Web CI](https://github.com/jrmoulckers/finance/actions/workflows/web-ci.yml)             | Web app build + tests                          |
| [Lint & Format](https://github.com/jrmoulckers/finance/actions/workflows/lint-format.yml) | ESLint, Prettier, Ktlint across all workspaces |
| [PR Title](https://github.com/jrmoulckers/finance/actions/workflows/pr-title.yml)         | Conventional commit format for PR titles       |

## Principles

- **Native-first** — Platform-native experiences on every device
- **Edge-first** — Most operations happen on-device; sync when needed
- **Privacy by design** — Transparent data practices, compliant standards
- **Accessibility** — Beautiful, inclusive interfaces for everyone
- **Open development** — AI-developed with full transparency in documentation
- **Ethical design** — Moral code development at the forefront of every component

## Platforms

| Platform | Target                          |
| -------- | ------------------------------- |
| iOS      | iPhone, iPad, Mac (native)      |
| watchOS  | Apple Watch (companion)         |
| Android  | Phones, tablets                 |
| Wear OS  | Android accessories (companion) |
| Web      | PWA on modern browsers          |
| Windows  | Windows 11 native               |

## Architecture

This is a **monorepo** with a consolidated backend designed to minimize server costs. The application follows an edge-first architecture where:

- Client devices perform most operations locally
- Data syncs to the backend when connectivity is available
- The backend serves as the coordination and sync layer
- Similar to models used by Signal, Bevel, and other offline-first apps

## Tech Stack

| Layer         | Technology                                               |
| ------------- | -------------------------------------------------------- |
| Shared logic  | Kotlin Multiplatform (KMP)                               |
| iOS UI        | SwiftUI                                                  |
| Android UI    | Jetpack Compose                                          |
| Web UI        | React + TypeScript                                       |
| Windows UI    | Compose Desktop                                          |
| Backend       | Supabase (PostgreSQL + Auth)                             |
| Offline sync  | PowerSync                                                |
| Local storage | SQLite + SQLCipher (encrypted)                           |
| Design tokens | Style Dictionary (DTCG format) → Swift, CSS, Android XML |
| CI/CD         | GitHub Actions + Turborepo                               |

## Repository Structure

```
finance/
├── apps/           # Platform-specific applications
│   ├── ios/        # iOS / macOS / watchOS app
│   ├── android/    # Android / Wear OS app
│   ├── web/        # Progressive Web App
│   └── windows/    # Windows 11 app
├── packages/       # Shared packages and libraries
│   ├── core/       # Core business logic
│   ├── models/     # Shared data models
│   ├── sync/       # Data synchronization engine
│   └── design-tokens/ # Design token definitions (DTCG JSON)
├── services/       # Backend services
│   └── api/        # Consolidated API server
├── docs/           # Project documentation
│   ├── ai/         # AI development workflow docs
│   ├── architecture/ # ADRs, roadmap, SDLC
│   ├── design/     # UX principles, personas, features
│   ├── guides/     # Setup, deployment, and platform guides
│   └── testing/    # Testing strategy
├── tools/          # Development tools and scripts
├── .github/        # GitHub config, Copilot AI setup
└── .vscode/        # VS Code workspace configuration
```

## Getting Started

### Prerequisites

You need the following installed before building:

| Tool                            | Version  | Notes                                                                                   |
| ------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| [Git](https://git-scm.com/)     | 2.40+    | Version control                                                                         |
| [Node.js](https://nodejs.org/)  | 22+      | Build tooling, npm workspaces, MCP servers                                              |
| [JDK 21](https://adoptium.net/) | 21 (LTS) | Kotlin Multiplatform compilation — [Eclipse Temurin](https://adoptium.net/) recommended |

> **JDK auto-detection:** The build script `tools/gradle.js` automatically locates a JDK 21 installation on your system. Install Temurin to a standard location and the build will find it — no need to set `JAVA_HOME` manually.

#### Platform-specific SDKs

These are only needed if you are building or testing for a specific platform:

| SDK                                                    | Platform   | Purpose                        |
| ------------------------------------------------------ | ---------- | ------------------------------ |
| [Xcode](https://developer.apple.com/xcode/) 16+        | macOS only | iOS, macOS, and watchOS builds |
| [Android Studio](https://developer.android.com/studio) | All        | Android and Wear OS builds     |
| [Chrome](https://www.google.com/chrome/)               | All        | Kotlin/JS browser tests        |

### Clone and build

```bash
# 1. Clone the repository
git clone https://github.com/jrmoulckers/finance.git
cd finance

# 2. One-command setup (validates prerequisites, installs deps, configures hooks, builds)
npm run setup
```

Or, if you prefer doing it step by step:

```bash
# Enable git hooks (enforces commit-lint and blocks unsafe operations)
git config core.hooksPath tools/git-hooks

# Install dependencies
npm install

# Build everything
npm run build

# Run all tests
npm test
```

All `npm run` commands work identically on Windows, macOS, and Linux — the `tools/gradle.js` wrapper selects `gradlew` or `gradlew.bat` automatically.

### Full contributor setup

For VS Code configuration, Copilot agent setup, MCP servers, and commit conventions, see the [Contributing Guide](.github/CONTRIBUTING.md).

## Commands

All commands are run from the repository root.

| Command                | Description                                                                       |
| ---------------------- | --------------------------------------------------------------------------------- |
| `npm run build`        | Build everything — KMP packages first, then Turborepo tasks (design tokens, apps) |
| `npm test`             | Run all tests — KMP JVM unit tests, then Turborepo test tasks                     |
| `npm run build:kmp`    | Build only the Kotlin Multiplatform packages (skips JS browser tests)             |
| `npm run test:kmp`     | Run KMP JVM tests only                                                            |
| `npm run build:tokens` | Build design tokens — generates Swift, CSS, and Android XML outputs               |
| `npm run lint`         | Run linters across all workspaces via Turborepo                                   |
| `npm run type-check`   | Run TypeScript type checking across all workspaces                                |
| `npm run format`       | Run formatters across all workspaces                                              |
| `npm run clean`        | Clean all build artifacts (Gradle + Turborepo)                                    |

### Running Gradle directly

For any Gradle task not covered by an npm script, use the cross-platform wrapper:

```bash
node tools/gradle.js <args>
```

Examples:

```bash
# List all available Gradle tasks
node tools/gradle.js tasks

# Run a specific module's tests
node tools/gradle.js :packages:models:jvmTest

# Build with full stack traces for debugging
node tools/gradle.js build --stacktrace
```

## AI-First Development

This project is developed with AI agents as first-class contributors. See [`docs/ai/`](docs/ai/) for complete documentation on:

- Custom Copilot agents and their roles
- Agent skills for domain-specific knowledge
- Instruction files for coding standards
- MCP server configuration
- Development workflow with AI tools

## License

This project is source-available under the [Business Source License 1.1](LICENSE).

**What this means:**

- ✅ You can view, fork, modify, and learn from the source code
- ✅ Personal, non-commercial, and educational use is always permitted
- ✅ Non-production use (development, testing, evaluation) is permitted
- ❌ You may not offer this as a competing hosted/managed service
- ❌ You may not embed this in a commercial product with substantially similar functionality
- 🔄 On 2030-03-08, the code converts to [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) (fully open source)

See [LICENSE](LICENSE) for full terms.
