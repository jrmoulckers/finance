# Finance

A multi-platform, native-first financial tracking application for personal, family, and partnered finances.

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

## AI-First Development

This project is developed with AI agents as first-class contributors. See [`docs/ai/`](docs/ai/) for complete documentation on:

- Custom Copilot agents and their roles
- Agent skills for domain-specific knowledge
- Instruction files for coding standards
- MCP server configuration
- Development workflow with AI tools

## Getting Started

> **Note:** This project is in its initial setup phase. Platform-specific setup instructions will be added as development begins.

### Prerequisites

- [Git](https://git-scm.com/)
- [GitHub Copilot](https://github.com/features/copilot) (Pro+ recommended)
- [VS Code](https://code.visualstudio.com/) with Copilot extensions
- Platform-specific SDKs (to be determined)

### Clone

```bash
git clone https://github.com/jrmoulckers/finance.git
cd finance
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
