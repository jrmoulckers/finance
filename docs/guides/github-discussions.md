# GitHub Discussions — Async Team Communication

> Issue: #198 — Set up GitHub Discussions for async team communication

## Overview

GitHub Discussions has been configured for the Finance repository to provide structured async communication channels for the development team. This document describes the setup, category structure, and usage guidelines.

## Category Structure

### 📣 Announcements (announcement type)

- **Purpose**: Project-wide announcements from maintainers
- **Who posts**: Project maintainers and team leads only
- **Examples**: Release notes, breaking changes, policy updates, sprint summaries
- **Permissions**: Only maintainers can create; anyone can comment

### 💡 Ideas & Feature Requests (open-ended)

- **Purpose**: Propose new features, enhancements, or architectural changes
- **Who posts**: All team members and contributors
- **Examples**: New platform support, API additions, UX improvements
- **Template**: Use the provided discussion template with sections for problem, proposal, and alternatives

### 🏗️ Architecture & Design (open-ended)

- **Purpose**: Technical design discussions, ADRs (Architecture Decision Records), and system design
- **Who posts**: Engineers and architects
- **Examples**: Schema changes, sync strategy discussions, security model reviews
- **Labels**: `backend`, `frontend`, `kmp`, `infrastructure`

### 🔧 Backend & API (open-ended)

- **Purpose**: Backend-specific discussions — Supabase, PostgreSQL, Edge Functions, PowerSync
- **Who posts**: Backend engineers
- **Examples**: Migration strategies, RLS policy reviews, Edge Function patterns, sync rule changes

### 📱 Platform-Specific (open-ended)

- **Purpose**: Platform-specific discussions — iOS, Android, Web, Windows
- **Who posts**: Platform engineers
- **Sub-topics**: SwiftUI patterns, Compose best practices, web performance, Windows integration

### ❓ Q&A (question/answer)

- **Purpose**: Technical questions with definitive answers
- **Who posts**: Anyone
- **Examples**: "How do I add a new Edge Function?", "What's the RLS policy for budgets?"
- **Feature**: Answers can be marked as accepted

### 🤝 RFC (Request for Comments) (open-ended)

- **Purpose**: Formal proposals requiring team feedback before implementation
- **Who posts**: Any engineer proposing a significant change
- **Process**:
  1. Create discussion with `[RFC]` prefix
  2. Allow 3 business days for feedback
  3. Summarize decisions and link to implementation PR
  4. Close discussion with decision outcome

### 🐛 Troubleshooting (question/answer)

- **Purpose**: Development environment issues, CI/CD problems, build failures
- **Who posts**: Anyone encountering issues
- **Note**: NOT for production bugs (use Issues for those)

## Usage Guidelines

### When to Use Discussions vs Issues

| Use **Discussions** when...     | Use **Issues** when...                  |
| ------------------------------- | --------------------------------------- |
| Exploring an idea or proposal   | There's a specific, actionable task     |
| Seeking feedback on a design    | Reporting a bug with reproduction steps |
| Asking a technical question     | Tracking work in a sprint               |
| Announcing a change or decision | Requesting a feature with clear scope   |
| Running an RFC process          | Creating a PR-linked work item          |

### Best Practices

1. **Use descriptive titles** — Make it easy to find discussions later
2. **Tag relevant people** — Use `@mentions` for domain experts
3. **Cross-reference issues** — Link to related issues with `#123`
4. **Keep it focused** — One topic per discussion; spin off new ones for tangents
5. **Close resolved discussions** — Mark Q&A as answered; close RFCs with outcomes
6. **Don't duplicate** — Search existing discussions before creating new ones

### Notification Settings

Configure your notification preferences at: **Repository → Watch → Custom → Discussions**

Recommended settings:

- **All team members**: Watch Announcements and RFC categories
- **Backend engineers**: Also watch Backend & API
- **Platform engineers**: Also watch Platform-Specific
- **Everyone**: Watch Q&A and Troubleshooting for knowledge sharing

## Discussion Templates

### Feature Proposal Template

```markdown
## Problem Statement

<!-- What problem does this solve? Who is affected? -->

## Proposed Solution

<!-- Describe your proposed approach -->

## Alternatives Considered

<!-- What other approaches did you consider? -->

## Impact Assessment

<!-- What areas of the codebase are affected? -->

- [ ] Backend (Supabase/Edge Functions)
- [ ] KMP shared code
- [ ] iOS
- [ ] Android
- [ ] Web
- [ ] Windows
- [ ] CI/CD

## Open Questions

<!-- List any unresolved questions -->
```

### RFC Template

```markdown
## RFC: [Title]

**Status**: Draft | Under Review | Accepted | Rejected
**Author**: @username
**Date**: YYYY-MM-DD
**Feedback Deadline**: YYYY-MM-DD (3 business days from creation)

## Summary

<!-- One paragraph summary -->

## Motivation

<!-- Why is this change needed? -->

## Detailed Design

<!-- Technical details of the proposal -->

## Drawbacks

<!-- What are the downsides? -->

## Alternatives

<!-- What other designs were considered? -->

## Implementation Plan

<!-- How will this be rolled out? -->

## Decision

<!-- Filled in after feedback period -->
```

## Administration

### Moderators

Discussion moderators have the ability to:

- Pin important discussions
- Lock discussions that have been resolved
- Transfer discussions to issues (and vice versa)
- Edit category assignments

### Metrics

Track discussion health through:

- Response time to Q&A questions
- RFC completion rate
- Active participants per week
- Unanswered questions backlog

## Related Documentation

- [CONTRIBUTING.md](../../CONTRIBUTING.md) — Contribution guidelines
- [CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md) — Community standards
- [docs/guides/](../guides/) — Development guides
