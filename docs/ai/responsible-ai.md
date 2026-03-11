# Responsible AI Framework — Finance

This document describes how the Finance project uses AI responsibly — both in the development process and in the product itself. It is intended for contributors, users, regulators, and anyone evaluating this project's AI practices.

## Table of Contents

- [AI in the Development Process](#ai-in-the-development-process)
- [AI in the Product](#ai-in-the-product)
- [Ethical AI Principles](#ethical-ai-principles)
- [Commitments](#commitments)
- [AI Disclosure for Open Source](#ai-disclosure-for-open-source)

## AI in the Development Process

Finance uses AI tools — primarily GitHub Copilot — to assist with code authoring, review, and documentation. AI accelerates development; it does not replace human judgment.

**Human review is mandatory.** Every line of AI-generated code is reviewed, tested, and approved by a human contributor before it is merged. AI-assisted code goes through the same pull request, CI, and quality assurance processes as human-written code. There are no exceptions.

**Transparency is built into the workflow.** When AI tools contribute meaningfully to a commit, contributors add a `Co-authored-by: Copilot` trailer to the git history. This makes AI involvement traceable and auditable across the entire project history.

**AI agents operate under strict guardrails.** All agents follow documented [restrictions](restrictions.md) that prevent unsupervised remote operations, destructive actions, and credential access.

For the full policy on code ownership, copyright, and contributor responsibilities for AI-assisted code, see the [AI-Generated Code Policy](ai-code-policy.md).

## AI in the Product

### Current State

Finance does not use AI in its product features today. All financial calculations — budgeting, transaction processing, reporting — are deterministic. Users can trust that the numbers they see are the result of defined, repeatable logic, not probabilistic inference.

### Future Considerations

If AI-powered features are introduced (for example, transaction categorization or spending insights), the following requirements apply:

| Requirement                    | Description                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Algorithmic transparency**   | Users must understand how AI-driven categorizations or recommendations are made. No black-box decisions on financial data.                         |
| **No discriminatory outcomes** | Financial recommendations and categorizations must not produce biased or discriminatory results based on user demographics.                        |
| **User control**               | Users can review, override, and correct any AI-generated suggestion. AI features augment human decisions; they do not replace them.                |
| **Data privacy**               | AI features must not transmit financial data to third-party AI services. All inference must run locally or on infrastructure the project controls. |
| **Explainability**             | Any AI decision that affects financial data must include a human-readable explanation of why that decision was made.                               |

## Ethical AI Principles

Finance adopts the following principles, informed by the [Microsoft Responsible AI Standard](https://www.microsoft.com/en-us/ai/responsible-ai) and the [EU AI Act](https://artificialintelligenceact.eu/):

### Fairness

AI-assisted features must not introduce bias into financial recommendations, categorizations, or insights. Testing must include diverse financial scenarios to verify equitable outcomes across user populations.

### Reliability & Safety

Financial calculations are deterministic and must remain so. Where AI is used, outputs must be validated against known-correct results. AI must never silently alter financial data.

### Privacy & Security

User financial data is never used for AI model training — not by this project, and not by any third-party tool integrated into the product. Development-time AI tools (such as Copilot) operate on source code, not on user data.

### Inclusiveness

AI features must meet the same [accessibility standards](../../AGENTS.md) as the rest of the application: WCAG 2.2 AA minimum, screen reader support, and respect for user preferences (reduced motion, high contrast).

### Transparency

Users are informed when AI is involved in a decision or suggestion within the product. AI-generated outputs are visually distinguished from deterministic results so users can calibrate their trust accordingly.

### Accountability

Human maintainers are accountable for all code in this repository, regardless of whether it was written by a human or assisted by AI. The [AI-Generated Code Policy](ai-code-policy.md) formalizes this: the contributor who commits the code owns it.

## Commitments

1. **Financial data is never sent to external AI services.** User transaction data, account balances, and personal financial information must not leave user-controlled infrastructure for AI processing.
2. **AI-generated code is always reviewed by humans.** No AI-authored code is merged without human approval through the standard pull request process.
3. **The project follows emerging AI regulations.** As frameworks like the EU AI Act and U.S. state-level AI laws mature, this project will adapt its practices to remain compliant.
4. **Users are informed when AI features are active.** Any AI-powered functionality in the product is clearly labeled and explained.
5. **AI features can always be disabled.** Users retain full control and can opt out of any AI-driven behavior without losing access to core functionality.

## AI Disclosure for Open Source

This project is transparent about its use of AI in development:

- **Commit-level traceability.** The `Co-authored-by: Copilot` trailer in git history identifies AI-assisted commits. This is documented in the [AI-Generated Code Policy](ai-code-policy.md).
- **Uniform quality standards.** All code — whether human-written, AI-assisted, or AI-generated — passes the same linters, tests, CI checks, and human review. There is no separate quality bar.
- **License coverage.** All contributions are submitted under the project's [Business Source License 1.1 (BUSL-1.1)](../../LICENSE). The license applies equally to all code regardless of authorship method.
- **Full documentation.** AI agent roles, capabilities, restrictions, and workflows are documented in [`docs/ai/`](.).

---

_This document is reviewed and updated as the project's AI practices evolve. Last updated: 2025._
