# Documentation Index

Central table of contents for the Finance monorepo documentation. Use this page to find any document quickly, whether you are onboarding, building a feature, preparing a release, or reviewing compliance.

> **Tip:** New to the project? Start with [Getting Started](#-getting-started), then read the [Architecture Decision Records](#architecture-decision-records-adrs) to understand why things are built the way they are.

---

## Quick Navigation

| I want to…                     | Start here                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Set up my dev environment      | [Getting Started](guides/getting-started.md) · [Workflow Cheat Sheet](guides/workflow-cheatsheet.md)           |
| Set up Android / iOS / Windows | [Android](guides/android-setup.md) · [iOS](guides/ios-setup.md) · [Windows](guides/windows-setup.md)           |
| Understand the architecture    | [Roadmap](architecture/roadmap.md) · [Cross-Platform Framework](architecture/0001-cross-platform-framework.md) |
| Work with AI agents            | [AI Workflow](ai/workflow.md) · [Agent Usage Guide](guides/ai-agents.md) · [Agents](ai/agents.md)              |
| Ship a release                 | [Release Process](guides/release-process.md) · [Launch Checklist](guides/launch-checklist.md)                  |
| Review security posture        | [Security Audit v1](architecture/security-audit-v1.md) · [Security Checklist](audits/security-checklist.md)    |
| Check compliance status        | [Compliance README](compliance/README.md) · [Privacy Audit](architecture/privacy-audit-v1.md)                  |
| Understand the data model      | [Data Model](design/data-model.md) · [Feature Specs](design/features.md)                                       |

---

## Table of Contents

- [🚀 Getting Started](#-getting-started)
- [🏗️ Architecture](#️-architecture)
  - [Architecture Decision Records (ADRs)](#architecture-decision-records-adrs)
  - [Security Audits](#security-audits)
  - [Monitoring & Operations](#monitoring--operations)
  - [Project Management](#project-management)
- [📖 Guides](#-guides)
  - [Development Setup](#development-setup)
  - [Release & Distribution](#release--distribution)
  - [Testing & Quality](#testing--quality)
  - [Product & User Facing](#product--user-facing)
- [🔒 Compliance](#-compliance)
- [🎨 Design](#-design)
- [⚖️ Legal](#️-legal)
- [🤖 AI](#-ai)
- [🧪 Testing](#-testing)
- [🛡️ Audits](#️-audits)

---

## 🚀 Getting Started

These are the first documents every new contributor should read.

| Document                                              | Description                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| [Getting Started](guides/getting-started.md)          | End-user guide — what Finance is, where it runs, and how to use it |
| [Workflow Cheat Sheet](guides/workflow-cheatsheet.md) | Quick-reference commands and common patterns for daily development |
| [Roadmap](architecture/roadmap.md)                    | System architecture roadmap — all phases and current status        |
| [SDLC](architecture/sdlc.md)                          | Software Development Lifecycle — Agentic Kanban methodology        |
| [AI Agent Usage Guide](guides/ai-agents.md)           | How to invoke and chain the 13 custom Copilot agents               |

---

## 🏗️ Architecture

### Architecture Decision Records (ADRs)

ADRs document significant architectural decisions with context, alternatives, and consequences. Read these to understand _why_ the system is built the way it is.

| ADR                                                          | Title                              | Summary                                                                        |
| ------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------ |
| [ADR-0001](architecture/0001-cross-platform-framework.md)    | Cross-Platform Framework Selection | Kotlin Multiplatform (KMP) for shared logic with native UI per platform        |
| [ADR-0002](architecture/0002-backend-sync-architecture.md)   | Backend & Sync Architecture        | Edge-first, offline-first with Supabase + PowerSync delta sync                 |
| [ADR-0003](architecture/0003-local-storage-strategy.md)      | Local Storage Strategy             | SQLCipher-encrypted local databases with sync primitives                       |
| [ADR-0004](architecture/0004-auth-security-architecture.md)  | Authentication & Security          | Financial-grade auth with passkeys, biometrics, and platform security hardware |
| [ADR-0005](architecture/0005-design-system-approach.md)      | Design System Approach             | Shared design tokens with native UI frameworks per platform                    |
| [ADR-0006](architecture/0006-cicd-strategy.md)               | CI/CD Strategy                     | Affected-only builds in a multi-platform monorepo with agentic contributors    |
| [ADR-0007](architecture/0007-hosting-strategy.md)            | Hosting Strategy                   | Affordable Supabase + PowerSync hosting for a bootstrapped project             |
| [ADR-0009](architecture/0009-legal-monetization-analysis.md) | Legal, Licensing & Monetization    | BSL 1.1 licensing analysis and monetization strategy for public release        |
| [Template](architecture/adr-template.md)                     | ADR Template                       | Standard template for writing new ADRs                                         |

### Security Audits

| Document                                                           | Description                                                             |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [OWASP MASVS Security Audit v1](architecture/security-audit-v1.md) | Full codebase audit against OWASP MASVS v2 — initial baseline           |
| [API Security Audit v2](architecture/security-audit-api-v2.md)     | Supabase RLS and Edge Functions security review                         |
| [Privacy Audit v1](architecture/privacy-audit-v1.md)               | GDPR/CCPA readiness assessment with gap analysis                        |
| [MASVS-STORAGE Audit](architecture/masvs-storage-audit.md)         | Client-side data storage security across all platforms                  |
| [MASVS-NETWORK Audit](architecture/masvs-network-audit.md)         | Network communication security — TLS, certificate pinning, API calls    |
| [MASVS-PLATFORM Audit](architecture/masvs-platform-audit.md)       | Platform-specific security — IPC, WebViews, permissions, deep links     |
| [MASVS-CODE Audit](architecture/masvs-code-audit.md)               | Code quality security — injection, input validation, error handling     |
| [MASVS-RESILIENCE Audit](architecture/masvs-resilience-audit.md)   | Anti-tampering, root/jailbreak detection, obfuscation, integrity        |
| [Dependency Audit](architecture/dependency-audit.md)               | npm + Maven/Gradle vulnerability scan — 29 advisories across ecosystems |

### Monitoring & Operations

| Document                                                               | Description                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Monitoring Architecture](architecture/monitoring.md)                  | Observability strategy — error tracking, metrics, dashboards       |
| [Alerting Rules](architecture/alerting-rules.md)                       | Alerting thresholds, priority levels, escalation paths             |
| [Performance Baselines](architecture/performance-baselines.md)         | Target metrics for cold start, scroll FPS, memory, and query times |
| [Incident Response Runbook](architecture/incident-response-runbook.md) | Severity levels, escalation matrix, rollback procedures            |

### Project Management

| Document                                                     | Description                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| [Roadmap](architecture/roadmap.md)                           | System architecture roadmap — Phases 0–8 complete, 9–12 in planning |
| [SDLC](architecture/sdlc.md)                                 | Agentic Kanban methodology — how work flows through the project     |
| [Android Architecture](architecture/android-architecture.md) | Android app architecture — screens, navigation, state management    |
| [Branch Protection](architecture/branch-protection.md)       | `main` branch rules — required checks, review policy                |
| [Labels](architecture/labels.md)                             | GitHub label taxonomy — type, platform, priority, and status labels |
| [Project Board](architecture/project-board.md)               | GitHub Projects V2 board structure, custom fields, and views        |

---

## 📖 Guides

### Development Setup

| Document                                              | Description                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| [Getting Started](guides/getting-started.md)          | What Finance is, platform support, and first-run walkthrough          |
| [Workflow Cheat Sheet](guides/workflow-cheatsheet.md) | Daily commands, common patterns, and quick-reference for the monorepo |
| [Android Setup](guides/android-setup.md)              | Android Studio, SDK, and emulator configuration for Finance           |
| [iOS Setup](guides/ios-setup.md)                      | Xcode project setup, building, simulator, and adding new screens      |
| [Windows Setup](guides/windows-setup.md)              | Compose Desktop (JVM) development setup on Windows                    |
| [Local Supabase](guides/local-supabase.md)            | Running Supabase locally with Docker — no cloud account needed        |
| [KMP Debugging](guides/kmp-debugging.md)              | Debugging Kotlin Multiplatform shared code across targets             |
| [Dependency Review](guides/dependency-review.md)      | Policy and process for adding, reviewing, and auditing dependencies   |

### Release & Distribution

| Document                                                 | Description                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Release Process](guides/release-process.md)             | Changesets workflow, per-platform pipelines, hotfix and rollback                |
| [Versioning Strategy](guides/versioning-strategy.md)     | Semantic versioning, platform build numbers, Git tag conventions                |
| [Launch Checklist](guides/launch-checklist.md)           | Pre-launch sign-off checklist — every item required before first public release |
| [Rollback Procedures](guides/rollback-procedures.md)     | Per-platform rollback instructions for Vercel, app stores, and database         |
| [App Store Preparation](guides/app-store-preparation.md) | Requirements and checklists for publishing to all app stores and PWA            |
| [App Store Submission](guides/app-store-submission.md)   | Step-by-step metadata, screenshots, and submission instructions                 |
| [Store Metadata](guides/store-metadata.md)               | Copy-paste-ready app store metadata for all distribution channels               |
| [Windows Store](guides/windows-store.md)                 | Microsoft Store MSIX packaging and submission guide                             |
| [Beta Testing](guides/beta-testing.md)                   | Beta program planning — recruitment, distribution, feedback, exit criteria      |
| [Beta Test Plan](guides/beta-test-plan.md)               | 10 critical user journey test scenarios for beta testers                        |

### Testing & Quality

| Document                                             | Description                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| [Performance Guide](guides/performance.md)           | Performance targets, profiling techniques, and optimization practices     |
| [Monitoring Strategy](guides/monitoring.md)          | Privacy-respecting observability — crash reporting, sync health, alerting |
| [Visual Parity Audit](guides/visual-parity-audit.md) | Cross-platform visual consistency verification guide                      |
| [Accessibility Guide](guides/accessibility.md)       | WCAG 2.2 AA accessibility features and usage across all platforms         |

### Product & User-Facing

| Document                                               | Description                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| [Feature Guide](guides/features.md)                    | Complete guide to Finance features — accounts, budgets, goals, and more      |
| [FAQ & Troubleshooting](guides/faq.md)                 | Common questions and answers for users                                       |
| [Platforms](guides/platforms.md)                       | Platform-specific features and differences across iOS, Android, Web, Windows |
| [Privacy & Security Guide](guides/privacy-security.md) | User-facing guide to data protection, biometrics, and privacy rights         |
| [Onboarding Strategy](guides/onboarding-strategy.md)   | Per-platform onboarding design — shared logic, native patterns, skip/resume  |
| [In-App Help Plan](guides/in-app-help-plan.md)         | Contextual help, tooltips, FAQ integration plan                              |
| [AI Agent Usage Guide](guides/ai-agents.md)            | How to use the 13 custom Copilot agents and chain them for complex tasks     |

---

## 🔒 Compliance

Regulatory compliance documentation — GDPR, CCPA/CPRA, and data privacy audits. See the [Compliance README](compliance/README.md) for an overview.

| Document                                                            | Description                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Compliance README](compliance/README.md)                           | Overview of all compliance documents and their status                                |
| [Data Inventory](compliance/data-inventory.md)                      | GDPR data inventory — personal data catalog, processing map, DPIA screening          |
| [Right to Access Audit](compliance/gdpr-right-to-access-audit.md)   | GDPR Article 15 — right of access and data portability audit                         |
| [Right to Erasure Audit](compliance/gdpr-right-to-erasure-audit.md) | GDPR Article 17 — right to erasure ("right to be forgotten") audit                   |
| [Consent Management Audit](compliance/consent-management-audit.md)  | GDPR Article 7 — consent posture review and recommended architecture                 |
| [Data Minimization Audit](compliance/data-minimization-audit.md)    | Field-level schema review, retention guidance, and minimization recommendations      |
| [CCPA Verification](compliance/ccpa-verification.md)                | CCPA/CPRA consumer rights verification against actual implementation                 |
| [Web Storage Audit](compliance/web-storage-audit.md)                | Browser storage audit — cookies, localStorage, IndexedDB, OPFS, service worker cache |

---

## 🎨 Design

Product design documentation — personas, UX principles, data models, and feature specifications.

| Document                                                       | Description                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [UX Principles](design/ux-principles.md)                       | Core design philosophy — "Financial clarity without cognitive burden"                |
| [Personas](design/personas.md)                                 | User personas, MVP scope, and user journey definitions                               |
| [Product Identity](design/product-identity.md)                 | Core promise, brand voice, positioning, and differentiation                          |
| [Information Architecture](design/information-architecture.md) | Navigation model — bottom tab bar, screen hierarchy, and routing                     |
| [Data Model](design/data-model.md)                             | Canonical database schema — design rules, entity definitions, sync columns           |
| [Feature Specifications](design/features.md)                   | Source-of-truth feature specs with unique IDs, user stories, and acceptance criteria |

---

## ⚖️ Legal

Legal documents — terms of service, privacy policy, and app store data declarations. All documents are drafts pending legal counsel review.

| Document                                               | Description                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| [Privacy Policy](legal/privacy-policy.md)              | Draft privacy policy — data practices described in plain language   |
| [Terms of Service](legal/terms-of-service.md)          | Draft terms of service for the Finance application                  |
| [CCPA Notice](legal/ccpa-notice.md)                    | California-specific privacy notice supplementing the privacy policy |
| [Apple Privacy Labels](legal/privacy-labels-apple.md)  | App Store Connect privacy nutrition label answers                   |
| [Google Data Safety](legal/data-safety-google-play.md) | Google Play data safety section answers                             |

---

## 🤖 AI

AI-first development workflow documentation. See the [AI README](ai/README.md) for an overview of the AI development philosophy.

| Document                               | Description                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| [AI README](ai/README.md)              | Overview — why AI-first development, documentation index                     |
| [Workflow](ai/workflow.md)             | Day-to-day AI development workflow — Copilot, Chat, Agent Mode               |
| [Agents](ai/agents.md)                 | Custom Copilot agent definitions — roles, tools, and boundaries              |
| [Skills](ai/skills.md)                 | Reusable domain knowledge bundles for AI agents                              |
| [Instructions](ai/instructions.md)     | Copilot instruction files — coding standards and architectural constraints   |
| [MCP Configuration](ai/mcp.md)         | Model Context Protocol (MCP) server setup — external tool integration        |
| [Responsible AI](ai/responsible-ai.md) | Responsible AI framework — ethics, transparency, and commitments             |
| [Restrictions](ai/restrictions.md)     | Human-gated operations — what AI agents must not do without approval         |
| [AI Code Policy](ai/ai-code-policy.md) | Ownership, copyright, and contributor responsibilities for AI-generated code |

---

## 🧪 Testing

| Document                           | Description                                                        |
| ---------------------------------- | ------------------------------------------------------------------ |
| [Testing Guide](testing/README.md) | Test commands, structure, and conventions for the Finance monorepo |

---

## 🛡️ Audits

| Document                                           | Description                                                 |
| -------------------------------------------------- | ----------------------------------------------------------- |
| [Security Checklist](audits/security-checklist.md) | OWASP MASVS L1 security checklist across all four platforms |

---

## Document Count by Category

| Category     |  Files |
| ------------ | -----: |
| Architecture |     28 |
| Guides       |     29 |
| Compliance   |      8 |
| Design       |      6 |
| Legal        |      5 |
| AI           |      9 |
| Testing      |      1 |
| Audits       |      1 |
| **Total**    | **87** |

---

_This index is maintained manually. When adding a new document, add an entry here in the appropriate section._
