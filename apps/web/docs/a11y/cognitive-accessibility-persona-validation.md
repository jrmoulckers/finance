# Cognitive-accessibility copy and persona validation

Follow-up to #2280 (issue #2505). Validates simple-mode copy against
cognitive-accessibility personas: plain-language replacements, progressive
disclosure, and low-cognitive-load high-stakes flows.

The checks are executable in `src/lib/a11y/simple-mode.ts`
(`validateSimpleModeCopy`, `validatePersonaCoverage`, `COGNITIVE_PERSONAS`) and
run in CI via `src/lib/a11y/__tests__/simple-mode.test.ts`.

## Personas

| Persona                              | Key needs                                                               | High-stakes flows   |
| ------------------------------------ | ----------------------------------------------------------------------- | ------------------- |
| Maria — early-stage memory changes   | One clear next action; plain labels; no time pressure or surprises      | Bills, Transactions |
| Devon — ADHD / executive-function    | Suppress non-essential prompts; progressive disclosure; short sentences | Budgets, Goals      |
| Sam — low numeracy / reading anxiety | Plain summaries before charts; ~grade 8 reading level; consistent CTAs  | Reports, Dashboard  |

## Validation performed

- **Plain-language replacements** — `simplifyFinancialCopy` now covers the
  high-stakes vocabulary (variance, reconciliation, liquidity, amortization,
  allocation, principal, accrued, delinquent, disbursement, installment,
  overdraft, utilization). `validateSimpleModeCopy` flags any remaining jargon.
- **Progressive disclosure** — every simple-mode plan keeps exactly one primary
  action and collapses advanced regions (`collapsedRegions`). Validated per
  persona × high-stakes surface by `validatePersonaCoverage`.
- **Sentence length / cognitive load** — copy validation flags sentences over
  18 words and multi-step instructions that lack numbered steps.

## Results

- All personas map to at least one high-stakes flow; every persona/surface pair
  passes single-primary-action, progressive-disclosure, and plain-language
  heading checks (green in CI).
- Sample high-jargon, run-on copy is correctly flagged and simplified; plain,
  short copy passes with zero issues.

## Intentional gaps / next steps

- The reading-grade estimate is a lightweight proxy, not a formal
  Flesch-Kincaid score; treat borderline values as a prompt for manual review.
- Live moderated testing with the three personas above should be scheduled once
  the simple-mode surfaces ship to beta; record AT/browser, pass/fail, and bugs
  filed here and in the PR notes.
