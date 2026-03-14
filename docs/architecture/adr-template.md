# Architecture Decision Record Template

This is the standard template for Architecture Decision Records (ADRs) in the Finance project. ADRs document significant architectural decisions with their context and consequences.

## How to Use

1. Copy this template to a new file: `docs/architecture/NNNN-descriptive-title.md`
2. Number sequentially (0001, 0002, etc.)
3. Fill in all sections — leave none blank
4. Submit as a PR for review (ADRs are not merged without human approval)
5. Update the status as the decision evolves

## Naming Convention

`NNNN-short-descriptive-title.md`

Examples:

- `0001-edge-first-sync-architecture.md`
- `0002-cross-platform-framework-selection.md`
- `0003-financial-data-encryption-strategy.md`

---

# ADR-NNNN: [Title of Decision]

**Status:** [Proposed | Accepted | Deprecated | Superseded by ADR-NNNN]
**Date:** YYYY-MM-DD
**Author:** [Human name and/or AI agent that proposed]
**Reviewers:** [Who reviewed this decision]

## Context

What is the issue that we're seeing that is motivating this decision or change? Describe the forces at play (technical, business, social, project).

## Decision

What is the change that we're proposing and/or doing? State the decision clearly and concisely.

## Alternatives Considered

### Alternative 1: [Name]

- **Pros:** ...
- **Cons:** ...

### Alternative 2: [Name]

- **Pros:** ...
- **Cons:** ...

## Consequences

### Positive

- What becomes easier or possible as a result of this change?

### Negative

- What becomes harder or is lost as a result of this change?

### Risks

- What could go wrong? How do we mitigate?

## Implementation Notes

Brief notes on how this decision will be implemented, if applicable. Reference specific files, packages, or components.

## References

- Links to relevant issues, PRs, external resources, or prior ADRs
