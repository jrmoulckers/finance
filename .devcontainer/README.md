# Dev Container — Finance Monorepo

This directory contains the [Dev Container](https://containers.dev/) configuration
for the Finance monorepo. It gives every contributor a consistent, pre-configured
development environment with **JDK 21**, **Node 22**, and all recommended VS Code
extensions — no manual setup required.

## Quick Start

### GitHub Codespaces (recommended for quick contributions)

1. Navigate to the [Finance repository](https://github.com/jrmoulckers/finance).
2. Click **Code → Codespaces → Create codespace on main**.
3. Wait for the container to build (~3–5 min on first launch).
4. Start coding — dependencies are installed and the project is built automatically.

### VS Code Dev Containers (local)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and
   the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).
2. Clone the repo and open it in VS Code.
3. When prompted, click **Reopen in Container** — or run the command
   **Dev Containers: Reopen in Container** from the Command Palette (`Ctrl+Shift+P`).
4. Wait for the container to build and the `postCreateCommand` to finish.

## What's Included

| Tool / Feature         | Details                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| **Base image**         | `mcr.microsoft.com/devcontainers/base:ubuntu-22.04`                        |
| **JDK**                | 21 (via `ghcr.io/devcontainers/features/java`)                             |
| **Node.js**            | 22 (via `ghcr.io/devcontainers/features/node`)                             |
| **GitHub CLI**         | Latest (via `ghcr.io/devcontainers/features/github-cli`)                   |
| **VS Code extensions** | Copilot, Kotlin, Gradle, ESLint, Prettier, EditorConfig, GitLens, and more |

### Post-Create Setup

The `postCreateCommand` automatically runs:

```bash
npm install && git config core.hooksPath tools/git-hooks && npm run build
```

This ensures:

- All npm dependencies are installed across the monorepo workspaces.
- Git hooks (commit-lint, pre-push checks) are configured.
- The full project is built (KMP + Turbo) so you can start working immediately.

## Customizing

To add tools or extensions, edit `devcontainer.json` in this directory. See the
[Dev Containers specification](https://containers.dev/implementors/json_reference/)
for the full schema reference.

## Troubleshooting

| Problem                | Solution                                                     |
| ---------------------- | ------------------------------------------------------------ |
| Container build fails  | Check Docker has ≥8 GB RAM allocated                         |
| Gradle build OOM       | Increase `org.gradle.jvmargs` in `gradle.properties`         |
| Extensions not loading | Rebuild the container: **Dev Containers: Rebuild Container** |
| Codespace is slow      | Upgrade to a 4-core machine type in Codespace settings       |
