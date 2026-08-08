# Design: Local Windows ML / ONNX Narration Pipeline & Accessibility Test Harness

> **Status:** PROPOSED — Pending human review
> **Issue:** [#2708](https://github.com/jrmoulckers/finance/issues/2708)
> **Parent:** [#2394](https://github.com/jrmoulckers/finance/issues/2394) — on-device financial narration track
> **Date:** 2026-06-22
> **Author:** System Architect (AI agent)
> **Related:** [ADR-0014: AI/ML Pipeline Architecture](../architecture/0014-ai-ml-pipeline-architecture.md), [ADR-0010: V2 Architecture Vision](../architecture/0010-v2-architecture-vision.md), [Content Language Guidelines](../design/content-language-guidelines.md), [Accessibility Patterns](../design/accessibility-patterns.md), [Cognitive Accessibility](../design/cognitive-accessibility.md), [Privacy Audit v1](../architecture/privacy-audit-v1.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Design Principles](#3-design-principles)
4. [System Shape](#4-system-shape)
5. [Narration Contract](#5-narration-contract)
6. [Windows ML / ONNX Packaging Strategy](#6-windows-ml--onnx-packaging-strategy)
7. [Model-Selection Criteria & Rubric](#7-model-selection-criteria--rubric)
8. [Deterministic Test Harness](#8-deterministic-test-harness)
9. [Worked Example: Fixture → Golden](#9-worked-example-fixture--golden)
10. [Privacy Validation](#10-privacy-validation)
11. [Toolchain-Blocked & Human-Action Items](#11-toolchain-blocked--human-action-items)
12. [Open Questions](#12-open-questions)
13. [References](#13-references)

---

## 1. Overview

This document designs the **local, on-device narration pipeline** for the Windows
build of Finance: the system that turns a user's already-computed financial state
into plain-language, screen-reader-friendly summaries ("narration"), and the
**accessibility test harness** that makes those summaries verifiable without a
model present at runtime.

Narration is the natural-language layer that sits on top of the five existing
on-device engines (`SmartCategorizationEngine`, `BalancePredictionEngine`,
`SubscriptionDetector`, `SavingsEngine`, `BudgetRecommendationEngine`; see the
[financial-modeling skill](../../.github/skills/financial-modeling/SKILL.md)). The
engines answer _"what is true about my money?"_; narration answers _"say it to me
in a calm, accurate sentence — and let Narrator read it well."_

The native ML/ONNX work this enables is currently **blocked on toolchain and model
provisioning** (ONNX Runtime + DirectML native libraries, a license-cleared model,
and Windows CI runner configuration). This document therefore separates the
pipeline into a layer that ships today (deterministic templates) and a layer that
ships when the toolchain is unblocked (ML enhancement), and it marks every blocked
step explicitly in [§11](#11-toolchain-blocked--human-action-items).

## 2. Goals & Non-Goals

### Goals

- Define a **stable narration contract**: input financial-state schema → narration
  output (text + accessibility metadata), with **concise** and **detailed** modes.
- Specify a **Windows ML/ONNX packaging strategy** for optional local
  summarization/classification, with explicit **model-selection criteria**.
- Specify a **deterministic test harness** with fixtures and **golden narration
  outputs** so narration is fully testable with **no model loaded at runtime**.
- Provide a **privacy-validation checklist** proving source data _and_ generated
  summaries never leave the device.
- Guarantee **non-alarmist tone** and **explicit uncertainty/confidence** in every
  narration, per parent issue [#2394](https://github.com/jrmoulckers/finance/issues/2394).

### Non-Goals

- Implementing `packages/core` narration logic (owned by `@native-app-engineer`).
- Implementing the Windows UI / Narrator wiring (owned by the Windows platform agent).
- Provisioning ONNX Runtime native libraries or CI runners (owned by `@devops-engineer`).
- Selecting or licensing a specific production model (requires human legal sign-off).
- Designing cloud or federated narration — explicitly out of scope; narration is
  edge-only by construction (see ADR-0014).

## 3. Design Principles

Every decision below passes the four-filter framework, in order:

| Filter            | Application to narration                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Edge first**    | All narration runs on the client. The server never sees financial state or generated text. No exceptions.                      |
| **Privacy first** | Source data and generated summaries stay on-device. The pipeline has **no network dependency** on the inference path.          |
| **Native first**  | Output carries Narrator/UI Automation metadata (names, roles, live-region politeness) so it reads correctly.                   |
| **Simplicity**    | A deterministic template narrator ships first and is always the fallback. ML is an _optional enhancement_, never a dependency. |

Two domain constraints from parent [#2394](https://github.com/jrmoulckers/finance/issues/2394) are non-negotiable:

1. **Non-alarmist language.** Narration must obey the
   [Content Language Guidelines](../design/content-language-guidelines.md): no
   shame, panic, or judgment words ("overspent", "danger", "in the red", "behind",
   "deficit", "failed", …). The harness enforces this with a banned-term lint
   ([§8](#8-deterministic-test-harness)).
2. **Uncertainty is always surfaced.** Every narration segment carries a
   `confidence` value with a stated **basis** (sample size, model score, recency).
   Low-confidence claims are hedged in prose ("based on a short history…") and
   never asserted as fact.

## 4. System Shape

```text
                       ┌──────────────────────────────────────────────┐
   on-device data      │            NARRATION PIPELINE (local)         │
   (SQLDelight,        │                                              │
    encrypted)         │   ┌────────────────────────────────────┐    │
        │              │   │ 1. StateProjector                  │    │
        ▼              │   │    engines → FinancialStateSnapshot│    │
  ┌───────────┐        │   └───────────────┬────────────────────┘    │
  │ 5 on-device│──────▶│                   ▼                          │
  │  engines   │        │   ┌────────────────────────────────────┐    │
  └───────────┘        │   │ 2. TemplateNarrator  (pure, det.)  │◀── golden-tested
                       │   │    snapshot → Narration            │    │
                       │   └───────────────┬────────────────────┘    │
                       │                   │  (optional enhance)      │
                       │                   ▼                          │
                       │   ┌────────────────────────────────────┐    │
                       │   │ 3. MlEnhancer (ONNX, optional)     │    │
                       │   │    classify salience / smooth prose│    │
                       │   │    → GroundingValidator → Narration│    │
                       │   └───────────────┬────────────────────┘    │
                       │                   ▼                          │
                       │   ┌────────────────────────────────────┐    │
                       │   │ 4. A11yProjector                   │    │
                       │   │    Narration → Narrator/UIA metadata│   │
                       │   └────────────────────────────────────┘    │
                       └──────────────────────────────────────────────┘
                                            │
                                            ▼   (no network on this path)
                                  Windows UI + Narrator
```

Key property: **stages 1, 2, and 4 are pure and deterministic** and are the source
of golden outputs. Stage 3 is optional; if the model is absent, fails to load, or
produces output that fails grounding validation, the pipeline returns the stage-2
template result unchanged. This is the architectural guarantee that narration is
testable — and shippable — without a model.

## 5. Narration Contract

The contract lives (when implemented) in shared `commonMain` so all four platforms
emit identical narration; Windows adds only the ONNX adapter and the Narrator
projection. This section is the **interface spec only**.

### 5.1 Input — `FinancialStateSnapshot`

A snapshot is a _derived, already-computed_ view. The narrator performs **no
financial math** — it consumes engine outputs. Money is always integer cents plus
an ISO 4217 code (never floating point; see the financial-modeling skill).

```text
FinancialStateSnapshot {
  schemaVersion: Int                 // contract version, for forward-compat
  asOf:          String              // ISO-8601 instant
  locale:        String              // BCP-47, e.g. "en-US"
  currency:      String              // ISO 4217, e.g. "USD"

  netWorth:      Money               // { cents: Long, currency: String }
  cashOnHand:    Money
  safeToSpend:   Money?              // null when not computable

  netWorthTrend: Trend               // see below
  budgets:       List<BudgetState>
  upcomingBills: List<BillState>
  goals:         List<GoalState>
  insights:      List<InsightInput>  // pre-ranked SpendingInsight-derived items
  signals:       List<Signal>        // notable deltas; pre-classified, NOT raw txns
}

Trend {
  direction:   "up" | "down" | "flat"
  changeCents: Long                  // signed
  changePct:   Double                // signed, e.g. -0.034 = -3.4%
  periodDays:  Int
  confidence:  Confidence
}

BudgetState  { categoryName: String, plannedCents: Long, spentCents: Long,
               period: "monthly"|"weekly"|"biweekly"|"yearly", isRollover: Bool,
               percentUsed: Double, confidence: Confidence }
BillState    { name: String, amountCents: Long, dueDateIso: String,
               status: "scheduled"|"due"|"past_due" }
GoalState    { name: String, targetCents: Long, currentCents: Long,
               percentComplete: Double, monthsToTarget: Int?, confidence: Confidence }
InsightInput { id: String, kind: String, salience: Double, payload: Map }
Signal       { id: String, kind: "spend_delta"|"new_recurring"|"income_change",
               observedCents: Long, expectedLowCents: Long, expectedHighCents: Long,
               confidence: Confidence }

Confidence {
  level: "high" | "medium" | "low"
  score: Double                      // 0.0..1.0
  basis: "sample_size" | "model_score" | "recency" | "rule" | "blended"
}
```

> **Privacy note on the input:** the snapshot is intentionally a _projection_. It
> contains aggregates, category names, and pre-classified signals — not raw
> transaction descriptions or payee strings. This minimizes what the narration
> layer (and any optional model) ever sees, satisfying data-minimization by design.

### 5.2 Output — `Narration`

```text
Narration {
  mode:       "concise" | "detailed"
  schemaVersion: Int
  locale:     String
  headline:   NarrationSegment            // exactly one
  segments:   List<NarrationSegment>      // ordered, salience-descending
  provenance: Provenance
}

NarrationSegment {
  id:          String                     // stable, e.g. "trend", "budget.dining"
  kind:        "summary"|"trend"|"budget"|"bill"|"goal"|"insight"|"uncertainty"
  text:        String                     // visible prose; non-alarmist; hedged
  confidence:  Confidence
  a11y:        A11yMetadata
  sourceRefs:  List<String>               // entity ids → "show me the data" links
}

A11yMetadata {
  screenReaderText: String                // Narrator text; currency/percent spelled out
  ariaLive:         "off" | "polite" | "assertive"   // default polite; see rules
  role:             "status" | "heading" | "note"
  headingLevel:     Int?                  // for heading segments
}

Provenance {
  generator:    "template" | "ml_assisted"
  deterministic: Bool                     // true for template; true for greedy ML
  modelId:      String?                   // e.g. "narration-summarizer"
  modelVersion: String?                   // e.g. "0.3.0"
  runtime:      String?                   // e.g. "onnxruntime-1.18/cpu"
}
```

**Live-region politeness rules (native-first):**

- Routine summaries are `polite` (or `off` when rendered as static body text).
- `assertive` is reserved for time-critical, user-initiated results only and is
  **never** used for passive financial state. This prevents Narrator from
  interrupting the user with anxiety-inducing announcements.
- Every monetary value in `text` has a spelled-out form in `screenReaderText`
  ("$1,240.50" → "one thousand two hundred forty dollars and fifty cents") and
  percentages are spoken ("3.4 percent"), so screen-reader users are not read raw
  glyphs. Financial meaning is never carried by color or icon alone.

### 5.3 Concise vs. Detailed Modes

| Aspect         | Concise                                           | Detailed                                                                                            |
| -------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Audience       | Dashboard glance, widget, Narrator "summary" verb | "Tell me more", reports surface, full Narrator read-through                                         |
| Segment budget | `headline` + top 1–2 segments                     | `headline` + all material segments + an explicit `uncertainty` segment when any confidence is `low` |
| Length target  | ≤ 2 sentences per segment                         | ≤ 4 sentences per segment, may include per-category breakdown                                       |
| Numbers        | Rounded, headline figures only                    | Exact cents available in `sourceRefs` data table                                                    |
| Hedging        | Compressed ("roughly", "so far")                  | Full ("based on the last 21 days, which is a short window…")                                        |

Both modes derive from the **same snapshot** and the **same TemplateNarrator**;
mode only changes selection and verbosity, so a single golden fixture can assert
both outputs.

### 5.4 Tone & Uncertainty Encoding

- Tone is enforced mechanically: a banned-term list (derived from the
  [Content Language Guidelines](../design/content-language-guidelines.md)) fails
  the build if any user-facing `text` or `screenReaderText` contains a prohibited
  word. Example mappings the narrator must apply: "over plan" not "overspent",
  "needs attention" not "warning/danger", "in progress" not "behind",
  "past its due date" not "overdue/delinquent".
- Uncertainty maps from `Confidence.level` to fixed prose stems so wording stays
  deterministic and testable:

  | level    | concise stem    | detailed stem                                                                              |
  | -------- | --------------- | ------------------------------------------------------------------------------------------ |
  | `high`   | (no hedge)      | (no hedge; may state basis)                                                                |
  | `medium` | "looks like"    | "Based on recent activity, it looks like…"                                                 |
  | `low`    | "early signal:" | "This is an early signal based on limited history, so it may change as more data arrives." |

## 6. Windows ML / ONNX Packaging Strategy

### 6.1 Two-layer strategy

Per ADR-0014, Windows uses **ONNX Runtime** with the **DirectML** execution
provider. Narration applies it in two _optional_ roles, both grounded by the
deterministic template layer:

1. **Salience classification (low-risk, ship first when unblocked).** A small text
   classifier ranks which insights/signals matter most and selects the narration
   "frame". Output is an `argmax` label + score — fully deterministic. It changes
   _ordering and selection_, never the numbers. Worst case if wrong: a less
   relevant (but still accurate, template-rendered) sentence is shown.

2. **Abstractive smoothing (higher-risk, gated).** A small sequence-to-sequence
   model rewrites template prose into more natural language. Because generative
   models can hallucinate, this path is **constrained and validated**:
   - Greedy/beam decoding only — **no sampling, temperature 0** — for determinism.
   - Input is the structured snapshot + template draft (grounded generation).
   - Output passes a **GroundingValidator**: every monetary figure, percent, date,
     and category name in the generated text must appear verbatim in the snapshot;
     no new numbers may be introduced; banned-term lint must pass. **Any failure →
     discard ML output, return the template result.** This makes the ML path
     "best-effort polish over a correct floor."

### 6.2 Runtime & artifact packaging

| Concern               | Decision                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Runtime libraries     | Bundle ONNX Runtime + DirectML native libs **inside the MSI** (jpackage app-image). Models are **not** bundled.             |
| Model delivery        | On-demand download from the versioned **Model Registry** (ADR-0014 manifest), `tier: premium`, `fallback: template`.        |
| Integrity             | SHA-256 verify every artifact against the signed manifest before load; reject on mismatch.                                  |
| Disk quota            | Reuse ADR-0014 80 MB on-device model quota; narration models share it. Skip download on `< 2 GB RAM` devices.               |
| Execution provider    | **Runtime:** DirectML (GPU/NPU) → CPU fallback. **Golden tests:** CPU EP only (see [§8.4](#84-determinism-of-the-ml-path)). |
| Versioning            | Pin `{modelId, modelVersion, runtimeVersion, executionProvider}`; recorded in `Provenance` and asserted in goldens.         |
| Update/rollback       | Staged CDN rollout (5% → 25% → 100%) with automatic rollback on metric regression, per ADR-0014 lifecycle.                  |
| Absent-model behavior | Pipeline returns deterministic template narration. No user-visible error; `Provenance.generator = "template"`.              |

> **Toolchain-blocked:** the ONNX Runtime + DirectML native dependency, MSI
> packaging of those libraries, and the Windows CI runner that exercises them are
> not yet provisioned. See [§11](#11-toolchain-blocked--human-action-items).

## 7. Model-Selection Criteria & Rubric

Any candidate must score **≥ 3 on security** (financial-dependency floor) and pass
the domain gates before it is even scored. Models are evaluated only for the two
roles above; cloud APIs are disqualified by the edge-first filter.

### 7.1 Hard gates (pass/fail)

- **License** permits commercial use _and redistribution_ of weights (verify case
  by case — see toolchain note; Apache-2.0 / MIT preferred).
- **On-device size** within the per-model budget after INT8/INT4 quantization
  (classifier `< 15 MB`; summarizer target `< 60 MB`, hard cap inside the shared
  80 MB quota).
- **Determinism**: produces identical text under greedy/beam decoding on the CPU EP
  for a pinned version (required for golden tests).
- **Controllability**: supports grounded generation / constrained output so the
  GroundingValidator can reject fabrications.
- **ONNX exportable** and runnable under ONNX Runtime + DirectML.

### 7.2 Scoring rubric (1–5 each; financial-dependency floor: security ≥ 3)

| Criterion                    | Weight | What "5" looks like                                                  |
| ---------------------------- | ------ | -------------------------------------------------------------------- |
| Multiplatform support        | ×1     | Single ONNX export runs on Windows/Web; CoreML/TFLite siblings exist |
| Community health             | ×1     | Active maintenance, broad adoption, security advisories handled      |
| Security posture             | ×2     | No telemetry, no remote code, provenance-verifiable weights          |
| Performance (latency × size) | ×2     | Classifier `< 30 ms`, summarizer `< 500 ms`; small footprint         |
| Maintenance burden           | ×1     | Stable export path; few runtime-version foot-guns                    |
| License compatibility        | ×2     | Permissive (Apache-2.0/MIT), redistribution-safe                     |
| **Groundedness (domain)**    | ×3     | Strong factual consistency; rarely invents numbers when grounded     |

### 7.3 Indicative candidates (for human evaluation — not a selection)

| Role           | Candidate family                    | Notes                                                                |
| -------------- | ----------------------------------- | -------------------------------------------------------------------- |
| Classification | TF-IDF + logistic regression → ONNX | Tiny, fully deterministic, trivially groundable; strong default      |
| Classification | Distilled MiniLM / small encoder    | Better generalization; larger; still `argmax`-deterministic          |
| Summarization  | Flan-T5-small (quantized)           | Permissive license; controllable; needs grounding validation         |
| Summarization  | DistilBART-style small seq2seq      | Compact; evaluate license + hallucination rate                       |
| Summarization  | Phi-mini class (INT4)               | Strong quality; size/latency risk on low-end; license check required |

> **Recommendation (architecture):** ship **role 1 with the TF-IDF/logistic
> classifier first** (smallest, most auditable, deterministic by construction), and
> treat role 2 (abstractive smoothing) as a later, separately-audited increment.
> Final model selection and license clearance are **human-gated** ([§11](#11-toolchain-blocked--human-action-items)).

## 8. Deterministic Test Harness

The harness proves narration correctness **without loading any model**, by golden-
testing the deterministic layers and replaying recorded transcripts for the ML
layer.

### 8.1 Layout

```text
narration-fixtures/
  snapshots/                      # inputs
    01-steady-month.json
    02-bill-due-soon.json
    03-low-history-new-user.json
    ...
  golden/                         # expected outputs (committed)
    01-steady-month.concise.json
    01-steady-month.detailed.json
    ...
  ml-transcripts/                 # recorded model I/O for the optional ML path
    02-bill-due-soon.summarizer.json
```

- **Snapshots** are hand-authored `FinancialStateSnapshot` JSON — deterministic,
  no timestamps-of-record (only the explicit `asOf` field), no PII.
- **Goldens** are the full `Narration` JSON for both modes. They are generated by
  running the `TemplateNarrator` over a snapshot and committed; updates require an
  explicit `--update-goldens` run plus human review of the diff.

### 8.2 Assertions per golden

1. **Structural**: output matches the committed golden byte-for-byte after stable
   JSON serialization (sorted keys, fixed number formatting).
2. **Tone lint**: no `text`/`screenReaderText` contains a banned term from the
   [Content Language Guidelines](../design/content-language-guidelines.md) list.
3. **Grounding**: every number, percent, date, and category name in the prose
   exists in the source snapshot (no invented figures).
4. **Uncertainty present**: any `Confidence.level == "low"` produces a hedge stem
   and, in detailed mode, an explicit `uncertainty` segment.
5. **Accessibility**:
   - every segment has non-empty `screenReaderText`; currency/percent are spelled out;
   - no segment uses `ariaLive == "assertive"` for `kind !=` a user-initiated result;
   - exactly one `headline`; heading levels are monotonic; every segment has `sourceRefs`.
6. **Provenance**: `generator == "template"`, `deterministic == true` for the
   model-free path.

### 8.3 Running with no model present

The default harness target loads **zero** ONNX artifacts. It instantiates the
`TemplateNarrator` directly and runs all assertions above. This is the CI default
and is what makes narration shippable and verifiable while the ML toolchain is
blocked.

### 8.4 Determinism of the ML path

When a model _is_ available, the ML path is made testable two ways:

- **Replay tests (no model load):** a stub `MlEnhancer` reads a recorded
  `ml-transcripts/*.json` (input draft → model output text) and runs it through the
  real `GroundingValidator` + tone lint + projection. This asserts post-processing
  and fallback logic deterministically, again with no runtime model.
- **Integration tests (human/CI-gated, CPU EP):** load the real ONNX model on the
  **CPU execution provider** with greedy/beam decoding and assert (a) identical
  output across runs for a pinned version, and (b) grounding/tone pass on every
  fixture. DirectML output is **not** asserted in goldens — GPU kernels and driver
  versions are not bit-reproducible, so DirectML is a runtime accelerator only.

> **Toolchain-blocked:** the integration tests require ONNX Runtime + a chosen
> model on a configured Windows runner ([§11](#11-toolchain-blocked--human-action-items)).
> The replay and template tests have **no such dependency** and run today.

## 9. Worked Example: Fixture → Golden

A concrete mapping so the contract is unambiguous. The snapshot represents a calm,
ordinary month with one bill due soon and one low-confidence trend (short history).

### 9.1 Fixture — `snapshots/02-bill-due-soon.json`

```json
{
  "schemaVersion": 1,
  "asOf": "2026-06-22T00:00:00Z",
  "locale": "en-US",
  "currency": "USD",
  "netWorth": { "cents": 4185000, "currency": "USD" },
  "cashOnHand": { "cents": 124050, "currency": "USD" },
  "safeToSpend": { "cents": 38000, "currency": "USD" },
  "netWorthTrend": {
    "direction": "up",
    "changeCents": 52000,
    "changePct": 0.0126,
    "periodDays": 21,
    "confidence": { "level": "low", "score": 0.42, "basis": "sample_size" }
  },
  "budgets": [
    {
      "categoryName": "Dining",
      "plannedCents": 30000,
      "spentCents": 31500,
      "period": "monthly",
      "isRollover": false,
      "percentUsed": 1.05,
      "confidence": { "level": "high", "score": 0.95, "basis": "rule" }
    }
  ],
  "upcomingBills": [
    { "name": "Electric", "amountCents": 8800, "dueDateIso": "2026-06-25", "status": "due" }
  ],
  "goals": [
    {
      "name": "Emergency Fund",
      "targetCents": 1000000,
      "currentCents": 460000,
      "percentComplete": 0.46,
      "monthsToTarget": 14,
      "confidence": { "level": "medium", "score": 0.7, "basis": "blended" }
    }
  ],
  "insights": [],
  "signals": []
}
```

### 9.2 Golden (concise) — `golden/02-bill-due-soon.concise.json`

Note: net-worth trend is `low` confidence, so it is hedged ("early signal") and
**not** the headline; the time-relevant bill leads. No banned terms; the Dining
budget is "fully used", never "overspent".

```json
{
  "mode": "concise",
  "schemaVersion": 1,
  "locale": "en-US",
  "headline": {
    "id": "summary",
    "kind": "summary",
    "text": "Your Electric bill of $88.00 is due June 25, and you have $1,240.50 on hand.",
    "confidence": { "level": "high", "score": 0.95, "basis": "rule" },
    "a11y": {
      "screenReaderText": "Your Electric bill of eighty-eight dollars is due June twenty-fifth, and you have one thousand two hundred forty dollars and fifty cents on hand.",
      "ariaLive": "polite",
      "role": "status",
      "headingLevel": 2
    },
    "sourceRefs": ["bill.electric", "cashOnHand"]
  },
  "segments": [
    {
      "id": "budget.dining",
      "kind": "budget",
      "text": "Your Dining plan is fully used — $315.00 of the $300.00 you planned. Want to adjust the plan or move funds?",
      "confidence": { "level": "high", "score": 0.95, "basis": "rule" },
      "a11y": {
        "screenReaderText": "Your Dining plan is fully used. Three hundred fifteen dollars of the three hundred dollars you planned. Want to adjust the plan or move funds?",
        "ariaLive": "polite",
        "role": "note",
        "headingLevel": null
      },
      "sourceRefs": ["budget.dining"]
    },
    {
      "id": "trend",
      "kind": "trend",
      "text": "Early signal: your net worth looks slightly higher over the last 21 days. This may change as more history builds.",
      "confidence": { "level": "low", "score": 0.42, "basis": "sample_size" },
      "a11y": {
        "screenReaderText": "Early signal. Your net worth looks slightly higher over the last twenty-one days. This may change as more history builds.",
        "ariaLive": "polite",
        "role": "note",
        "headingLevel": null
      },
      "sourceRefs": ["netWorthTrend"]
    }
  ],
  "provenance": {
    "generator": "template",
    "deterministic": true,
    "modelId": null,
    "modelVersion": null,
    "runtime": null
  }
}
```

### 9.3 Golden (detailed) — adds breakdown + explicit uncertainty

The detailed golden (`golden/02-bill-due-soon.detailed.json`, abbreviated here)
keeps the same headline and segments, adds a `goal` segment ("You've saved $4,600
toward your Emergency Fund — 46% there, on track for about 14 months at your recent
pace"), and **appends an explicit `uncertainty` segment** because the trend is
`low` confidence:

```json
{
  "id": "uncertainty",
  "kind": "uncertainty",
  "text": "One note on confidence: the net-worth trend is based on a short, 21-day window, so treat it as a rough early signal rather than a firm direction.",
  "confidence": { "level": "low", "score": 0.42, "basis": "sample_size" },
  "a11y": {
    "screenReaderText": "One note on confidence. The net-worth trend is based on a short, twenty-one day window, so treat it as a rough early signal rather than a firm direction.",
    "ariaLive": "polite",
    "role": "note",
    "headingLevel": null
  },
  "sourceRefs": ["netWorthTrend"]
}
```

This single fixture exercises: bill prioritization, non-alarmist budget phrasing,
low-confidence hedging, mode differences, and full accessibility metadata — all
asserted with **no model loaded**.

## 10. Privacy Validation

Source financial data **and** generated summaries must stay on-device. This is
enforced architecturally, not by policy, and validated by the checklist below.

### 10.1 Architectural enforcement

- The narration inference path has **no network dependency**. `StateProjector`,
  `TemplateNarrator`, `MlEnhancer` (local ONNX), `GroundingValidator`, and
  `A11yProjector` take no HTTP/socket collaborator. A **forbidden-import / boundary
  test** fails the build if any narration module references a network client.
- The **only** network touch in the broader feature is model-artifact download,
  which is **content-addressed** (URL + SHA-256 from the signed manifest) and
  carries **no user data, no snapshot, no query** — it is identical for every user.
- Generated narration, if cached, is stored only in the local **encrypted** store
  and treated as a **sensitive field** (it embeds financial facts): field-level
  encryption via `FieldEncryptor`, erasable by crypto-shredding the household DEK
  (see [privacy-compliance skill](../../.github/skills/privacy-compliance/SKILL.md)).
- Narration cache is **excluded from sync** (never added to PowerSync sync rules)
  and **excluded from export** sync-internal fields, consistent with the export
  rules (never emit `syncVersion`/`isSynced`).

### 10.2 Privacy-validation checklist

- [ ] Narration modules declare **no** network/HTTP/socket dependency (boundary test green).
- [ ] Inference (template **and** ONNX) runs fully on-device; verified by an
      **egress test**: inject a transport that throws on any outbound call and assert
      narration still succeeds for every fixture.
- [ ] Model download requests contain **no** user data — request body/query is a
      function of `{modelId, version}` only; asserted by a request-shape test.
- [ ] Downloaded artifacts are SHA-256-verified against the signed manifest before load.
- [ ] Cached narration is field-level encrypted and tagged sensitive; readable only
      with the household DEK.
- [ ] Narration cache is **not** present in PowerSync sync rules
      (`services/api/powersync/sync-rules.yaml`) — verified by a rules audit test.
- [ ] Narration text is **never** included in data export, telemetry, or logs.
- [ ] Telemetry (if any) is counts/latency only — `narrationCount`, `latencyMs`,
      `mlFallbackRate` — and contains **no** input snapshot or output text (ADR-0014
      privacy-safe telemetry).
- [ ] GDPR erasure (Art. 17) destroys cached narration via crypto-shredding; GDPR
      export (Art. 20) omits narration cache and all sync-internal fields.
- [ ] A **privacy review** is triggered before enabling the optional ML path (new
      processing of personal data); an **external privacy audit** is required before
      any abstractive-summarization model ships, mirroring the ADR-0014 federated-
      learning gate.

### 10.3 Why this is structurally private

The snapshot fed to narration is already a minimized projection (aggregates +
category names, not raw descriptions). The deterministic narrator is pure code with
no I/O. The optional model is a local file performing local matrix math. There is
no code path from financial state or generated text to the network — so there is
nothing to leak, by construction, matching Finance's edge-first privacy advantage.

## 11. Toolchain-Blocked & Human-Action Items

These steps require native toolchain provisioning, cross-agent implementation, or
human legal/security sign-off. They are **out of scope for this design PR** and are
flagged for follow-up issues.

| #   | Item                                                                                            | Owner / Gate                           | Blocking?             |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------- |
| 1   | Provision ONNX Runtime + DirectML native libraries and package them in the MSI                  | `@devops-engineer` + Windows agent     | **Toolchain-blocked** |
| 2   | Configure a Windows CI runner that can load ONNX models on CPU/DirectML EP                      | `@devops-engineer`                     | **Toolchain-blocked** |
| 3   | Select and **license-clear** the production model(s) (weights redistribution)                   | **Human — legal sign-off**             | **Human-gated**       |
| 4   | External **privacy audit** before any abstractive-summarization model ships                     | **Human — privacy audit**              | **Human-gated**       |
| 5   | Implement `FinancialStateSnapshot`, `TemplateNarrator`, `GroundingValidator` in `packages/core` | `@native-app-engineer`                 | Cross-agent           |
| 6   | Implement Windows ONNX adapter + Narrator/UIA projection in `apps/windows`                      | Windows platform agent                 | Cross-agent           |
| 7   | Add Model Registry manifest entries (`narration-*`, `tier: premium`, `fallback: template`)      | `@backend-engineer` / `@devops`        | Cross-agent           |
| 8   | Author the committed fixture/golden corpus and wire the golden + egress test targets            | `@native-app-engineer` (+ this design) | Follow-up             |
| 9   | Record `ml-transcripts/*` once a model exists (for replay tests)                                | `@native-app-engineer` after #3        | Depends on #3         |

Items 5–9 can proceed for the **deterministic template layer and its golden harness
today**; only the ML-specific portions (1–4, and the ML parts of 6–9) are blocked.

## 12. Open Questions

1. **Model footprint vs. quota.** A summarizer competing with the categorizer for
   the shared 80 MB budget may force a download-on-demand-per-feature policy. Decide
   whether narration summarization is bundled in the premium model set or strictly
   opt-in.
2. **Locale coverage.** The template narrator and banned-term lint are English-first.
   Non-`en` locales need localized templates and per-locale banlists before ML
   smoothing is enabled (coordinate with `i18n-localization`).
3. **Caching policy.** Should narration be cached at all, or recomputed each view?
   Recompute-always removes a sensitive cache surface entirely (simplest/most
   private) at a small CPU cost — leaning recompute-always for v1.
4. **DirectML determinism floor.** Confirm whether any DirectML-accelerated path
   can be made reproducible enough to assert in CI, or whether CPU-EP-only goldens
   remain permanent policy.

## 13. References

- [ADR-0014: AI/ML Pipeline Architecture](../architecture/0014-ai-ml-pipeline-architecture.md) — on-device serving, ONNX/DirectML on Windows, model registry, privacy-safe telemetry.
- [ADR-0010: V2 Architecture Vision](../architecture/0010-v2-architecture-vision.md)
- [Content Language Guidelines](../design/content-language-guidelines.md) — non-alarmist copy, banned-term list.
- [Accessibility Patterns](../design/accessibility-patterns.md) and [Cognitive Accessibility](../design/cognitive-accessibility.md)
- [Accessibility Testing skill](../../.github/skills/accessibility-testing/SKILL.md) — Windows Narrator checks.
- [Privacy Compliance skill](../../.github/skills/privacy-compliance/SKILL.md) — on-device AI advantage, crypto-shredding, telemetry rules.
- [Financial Modeling skill](../../.github/skills/financial-modeling/SKILL.md) — `Cents`, the five on-device engines, report primitives.
- [Windows app README](../../apps/windows/README.md) — MSI/jpackage packaging context.
- [ONNX Runtime](https://onnxruntime.ai/) · [DirectML](https://learn.microsoft.com/windows/ai/directml/dml)
