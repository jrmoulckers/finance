# AI-Generated Code Policy

## Purpose

This policy clarifies ownership, copyright, and contributor responsibilities for AI-assisted code in the Finance project. It exists because this project uses AI-first development practices, and contributors deserve clarity on how AI-generated code is handled under the project's [Business Source License 1.1 (BUSL-1.1)](../../LICENSE).

## Policy Statement

This project uses AI tools — primarily GitHub Copilot — as development assistants. All AI-generated code is produced under the direction of, and remains the responsibility of, human contributors, and must pass the project's automated quality gates (CI checks, linting, type-checking, tests) before it lands. AI tools accelerate development; they do not replace human judgment, ownership, or responsibility.

## Copyright Ownership

All contributions, whether AI-assisted or not, are submitted under the project's Business Source License 1.1 (BUSL-1.1). Human contributors retain responsibility for all code they commit, including AI-assisted portions.

> **Note:** U.S. Copyright Office guidance indicates that purely AI-generated works — with no meaningful human creative input — may not be copyrightable. This project mitigates that risk because human contributors direct, configure, curate, and accept all AI-assisted contributions — retaining meaningful human creative input and responsibility for the result — even when an agent authors and merges the pull request.

## Contributor Responsibilities

1. **Review all AI output.** Never commit AI-generated code without reading, understanding, and verifying it.
2. **You own what you commit.** By committing code, you accept responsibility for its correctness, security, and license compliance — regardless of whether an AI tool produced the initial draft.
3. **Use the Co-authored-by trailer for transparency.** When AI tools contribute meaningfully to a commit, include:
   ```
   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
   ```
   This trailer is for transparency and traceability, not to assign authorship or copyright to the AI tool.
4. **Do not bypass the quality gate.** AI-generated code follows the same process as human-written code — pull requests, CI checks, and the automated quality gate (lint, type-check, tests, conflict-free). AI agents may merge the PRs they author once that gate passes; humans retain oversight and revert authority.

## Transparency

This project documents AI tool usage openly:

- AI agent roles and capabilities are documented in [`docs/ai/`](.).
- The `Co-authored-by: Copilot` trailer in git history identifies AI-assisted commits.
- The [`ai-generated`](../architecture/labels.md) issue label marks work primarily implemented by AI agents.

AI-generated code is not treated differently from human-written code once it has landed. The same quality, security, and accessibility standards apply.

## License Compatibility

All AI-assisted contributions are licensed under the [Business Source License 1.1 (BUSL-1.1)](../../LICENSE), the same license that covers the entire project. By contributing AI-assisted code, you confirm that:

- The contribution does not knowingly include code generated from proprietary or copyleft-licensed training data.
- You have reviewed the output and take responsibility for its license compliance.
- The contribution is compatible with the project's BUSL-1.1 license.

## Summary

| Aspect         | Policy                                               |
| -------------- | ---------------------------------------------------- |
| AI tool role   | Assistant, not author                                |
| Code ownership | Human contributor who commits                        |
| License        | BUSL-1.1 — same as all project code                  |
| Quality gate   | Mandatory before merge (CI, lint, type-check, tests) |
| Transparency   | `Co-authored-by` trailer + documentation             |
