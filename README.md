# Finance

A multi-platform, native-first financial tracking application for personal, family, and partnered finances.

## Table of Contents

- [Vision](#vision)
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

## Principles

- **Native-first** — Platform-native experiences on every device
- **Edge-first** — Most operations happen on-device; sync when needed
- **Privacy by design** — Transparent data practices, compliant standards
- **Accessibility** — Beautiful, inclusive interfaces for everyone
- **Open development** — AI-developed with full transparency in documentation
- **Ethical design** — Moral code development at the forefront of every component

## Platforms

| Platform | Target |
|----------|--------|
| iOS | iPhone, iPad, Mac (native) |
| watchOS | Apple Watch (companion) |
| Android | Phones, tablets |
| Wear OS | Android accessories (companion) |
| Web | PWA on modern browsers |
| Windows | Windows 11 native |

## Architecture

This is a **monorepo** with a consolidated backend designed to minimize server costs. The application follows an edge-first architecture where:

- Client devices perform most operations locally
- Data syncs to the backend when connectivity is available
- The backend serves as the coordination and sync layer
- Similar to models used by Signal, Bevel, and other offline-first apps

## Tech Stack

| Layer | Technology |
|-------|------------|
| Shared logic | Kotlin Multiplatform (KMP) |
| iOS UI | SwiftUI |
| Android UI | Jetpack Compose |
| Web UI | React + TypeScript |
| Windows UI | Compose Desktop |
| Backend | Supabase (PostgreSQL + Auth) |
| Offline sync | PowerSync |
| Local storage | SQLite + SQLCipher (encrypted) |
| Design tokens | Style Dictionary (DTCG format) → Swift, CSS, Android XML |
| CI/CD | GitHub Actions + Turborepo |

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
│   └── sync/       # Data synchronization engine
├── services/       # Backend services
│   └── api/        # Consolidated API server
├── docs/           # Project documentation
│   ├── ai/         # AI development workflow docs
│   ├── architecture/
│   └── design/
├── tools/          # Development tools and scripts
├── .github/        # GitHub config, Copilot AI setup
└── .vscode/        # VS Code workspace configuration
```

## Getting Started

### Prerequisites

You need the following installed before building:

| Tool | Version | Notes |
|------|---------|-------|
| [Git](https://git-scm.com/) | 2.40+ | Version control |
| [Node.js](https://nodejs.org/) | 22+ | Build tooling, npm workspaces, MCP servers |
| [JDK 21](https://adoptium.net/) | 21 (LTS) | Kotlin Multiplatform compilation — [Eclipse Temurin](https://adoptium.net/) recommended |

> **JDK auto-detection:** The build script `tools/gradle.js` automatically locates a JDK 21 installation on your system. Install Temurin to a standard location and the build will find it — no need to set `JAVA_HOME` manually.

#### Platform-specific SDKs

These are only needed if you are building or testing for a specific platform:

| SDK | Platform | Purpose |
|-----|----------|---------|
| [Xcode](https://developer.apple.com/xcode/) 16+ | macOS only | iOS, macOS, and watchOS builds |
| [Android Studio](https://developer.android.com/studio) | All | Android and Wear OS builds |
| [Chrome](https://www.google.com/chrome/) | All | Kotlin/JS browser tests |

### Clone and build

```bash
# 1. Clone the repository
git clone https://github.com/jrmoulckers/finance.git
cd finance

# 2. Enable git hooks (enforces commit-lint and blocks unsafe operations)
git config core.hooksPath tools/git-hooks

# 3. Install dependencies
npm install

# 4. Build everything
npm run build

# 5. Run all tests
npm test
```

All `npm run` commands work identically on Windows, macOS, and Linux — the `tools/gradle.js` wrapper selects `gradlew` or `gradlew.bat` automatically.

### Full contributor setup

For VS Code configuration, Copilot agent setup, MCP servers, and commit conventions, see the [Contributing Guide](.github/CONTRIBUTING.md).

## Commands

All commands are run from the repository root.

| Command | Description |
|---------|-------------|
| `npm run build` | Build everything — KMP packages first, then Turborepo tasks (design tokens, apps) |
| `npm test` | Run all tests — KMP JVM unit tests, then Turborepo test tasks |
| `npm run build:kmp` | Build only the Kotlin Multiplatform packages (skips JS browser tests) |
| `npm run test:kmp` | Run KMP JVM tests only |
| `npm run build:tokens` | Build design tokens — generates Swift, CSS, and Android XML outputs |
| `npm run lint` | Run linters across all workspaces via Turborepo |
| `npm run type-check` | Run TypeScript type checking across all workspaces |
| `npm run format` | Run formatters across all workspaces |
| `npm run clean` | Clean all build artifacts (Gradle + Turborepo) |

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

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
