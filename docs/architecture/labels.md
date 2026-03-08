# Label Taxonomy — Finance

## Overview

Labels are the primary mechanism for categorizing, filtering, and routing work in this project. They integrate with GitHub Projects views and help AI agents understand issue context.

## Label Categories

### Type Labels (mutually exclusive — every issue gets exactly one)

| Label | Color | Description |
|-------|-------|-------------|
| `feature` | `#a2eeef` | New user-facing capability |
| `bug` | `#d73a4a` | Something broken that needs fixing |
| `task` | `#cfd3d7` | Internal work (refactor, infra, tooling, docs) |
| `spike` | `#d4c5f9` | Time-boxed research or exploration |

### Platform Labels (one or more — which platforms are affected)

| Label | Color | Description |
|-------|-------|-------------|
| `platform:ios` | `#1f883d` | iOS / iPadOS / macOS / watchOS |
| `platform:android` | `#1f883d` | Android / Wear OS |
| `platform:web` | `#1f883d` | Progressive Web App |
| `platform:windows` | `#1f883d` | Windows 11 |
| `platform:shared` | `#1f883d` | Cross-platform shared code (packages/) |
| `platform:backend` | `#1f883d` | Backend API (services/) |

### Component Labels (which part of the codebase)

| Label | Color | Description |
|-------|-------|-------------|
| `comp:core` | `#0075ca` | packages/core — business logic |
| `comp:models` | `#0075ca` | packages/models — data models |
| `comp:sync` | `#0075ca` | packages/sync — sync engine |
| `comp:api` | `#0075ca` | services/api — backend API |
| `comp:docs` | `#0075ca` | Documentation |
| `comp:tools` | `#0075ca` | Development tooling |
| `comp:ci-cd` | `#0075ca` | CI/CD and GitHub Actions |

### Priority Labels (mutually exclusive)

| Label | Color | Description |
|-------|-------|-------------|
| `priority:critical` | `#b60205` | Drop everything — security, data loss, outage |
| `priority:high` | `#ff6600` | Important — do this cycle |
| `priority:medium` | `#fbca04` | Normal priority — do when ready |
| `priority:low` | `#0e8a16` | Nice to have — do when capacity allows |

### Effort Labels (mutually exclusive — t-shirt sizing)

| Label | Color | Description |
|-------|-------|-------------|
| `effort:xs` | `#e0e0e0` | < 1 day — quick fix or small change |
| `effort:s` | `#c5def5` | 1-2 days — well-defined small task |
| `effort:m` | `#bfd4f2` | 3-5 days — moderate feature or fix |
| `effort:l` | `#93c6f5` | 1-2 weeks — significant feature |
| `effort:xl` | `#0075ca` | 2+ weeks — major feature or epic |

### Status Labels (used sparingly — GitHub Projects handles most status tracking)

| Label | Color | Description |
|-------|-------|-------------|
| `triage` | `#fbca04` | Needs triage — newly created, unsorted |
| `blocked` | `#b60205` | Cannot proceed — dependency or decision needed |
| `needs-shaping` | `#d876e3` | Needs scope/criteria before work can begin |
| `good-first-issue` | `#7057ff` | Good for new contributors or AI agents learning the codebase |
| `help wanted` | `#008672` | Extra attention needed — open to community contributions |

### Special Labels

| Label | Color | Description |
|-------|-------|-------------|
| `security` | `#b60205` | Security-related — requires @security-reviewer |
| `accessibility` | `#0e8a16` | Accessibility-related — requires @accessibility-reviewer |
| `breaking-change` | `#b60205` | Introduces a breaking change |
| `ai-generated` | `#e4e669` | Created or primarily implemented by AI agent |

## Labeling Rules

1. Every issue MUST have exactly ONE type label
2. Every issue MUST have at least ONE platform label
3. Every issue SHOULD have a priority label after triage
4. Every issue SHOULD have an effort label after shaping
5. Component labels are optional but recommended for routing
6. `triage` label is auto-applied by issue templates; removed after triage

## Label Combinations for Common Scenarios

| Scenario | Labels |
|----------|--------|
| iOS-only bug, high priority | `bug`, `platform:ios`, `priority:high` |
| Cross-platform feature | `feature`, `platform:shared`, `comp:core` |
| Backend security fix | `bug`, `platform:backend`, `security`, `priority:critical` |
| Quick docs update | `task`, `comp:docs`, `effort:xs` |
| Research new sync approach | `spike`, `platform:shared`, `comp:sync` |
