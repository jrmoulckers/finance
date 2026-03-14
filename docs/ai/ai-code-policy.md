# AI-Generated Code Policy

## Purpose

This policy clarifies ownership, copyright, and contributor responsibilities for AI-assisted code in the Finance project. It exists because this project uses AI-first development practices, and contributors deserve clarity on how AI-generated code is handled under the project's [Business Source License 1.1 (BUSL-1.1)](../../LICENSE).

## Policy Statement

This project uses AI tools — primarily GitHub Copilot — as development assistants. All AI-generated code is reviewed, modified, and approved by human contributors before being committed. AI tools accelerate development; they do not replace human judgment or responsibility.

## Copyright Ownership

All contributions, whether AI-assisted or not, are submitted under the project's Business Source License 1.1 (BUSL-1.1). Human contributors retain responsibility for all code they commit, including AI-assisted portions.

> **Note:** U.S. Copyright Office guidance indicates that purely AI-generated works — with no meaningful human creative input — may not be copyrightable. This project mitigates that risk by requiring human review, modification, and approval of all AI-generated suggestions before they are committed.

## Contributor Responsibilities

1. **Review all AI output.** Never commit AI-generated code without reading, understanding, and verifying it.
2. **You own what you commit.** By committing code, you accept responsibility for its correctness, security, and license compliance — regardless of whether an AI tool produced the initial draft.
3. **Use the Co-authored-by trailer for transparency.** When AI tools contribute meaningfully to a commit, include:
   ```
   Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
   ```
   This trailer is for transparency and traceability, not to assign authorship or copyright to the AI tool.
4. **Do not bypass review.** AI-generated code follows the same review process as human-written code — pull requests, CI checks, and human approval.

## Transparency

This project documents AI tool usage openly:

- AI agent roles and capabilities are documented in [`docs/ai/`](.).
- The `Co-authored-by: Copilot` trailer in git history identifies AI-assisted commits.
- The [`ai-generated`](../architecture/labels.md) issue label marks work primarily implemented by AI agents.

AI-generated code is not treated differently from human-written code once it has been reviewed and committed. The same quality, security, and accessibility standards apply.

## License Compatibility

All AI-assisted contributions are licensed under the [Business Source License 1.1 (BUSL-1.1)](../../LICENSE), the same license that covers the entire project. By contributing AI-assisted code, you confirm that:

- The contribution does not knowingly include code generated from proprietary or copyleft-licensed training data.
- You have reviewed the output and take responsibility for its license compliance.
- The contribution is compatible with the project's BUSL-1.1 license.

## Summary

| Aspect             | Policy                                   |
| ------------------ | ---------------------------------------- |
| AI tool role       | Assistant, not author                    |
| Code ownership     | Human contributor who commits            |
| License            | BUSL-1.1 — same as all project code      |
| Review requirement | Mandatory before commit                  |
| Transparency       | `Co-authored-by` trailer + documentation |
