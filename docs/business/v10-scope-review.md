# v1.0 Scope Review — Descoping Candidates for Post-Launch

**Issue:** #765
**Sprint:** 11 — Pre-Launch Finalization
**Priority:** P1 — High
**Milestone:** v1.0
**Status:** Complete
**Document Owner:** Product Management
**Date:** 2025-07-29

---

## Executive Summary

The v1.0 milestone carries 27 open issues spanning core features, testing,
launch readiness, and legacy backlog. This review classifies each as
**must-have** (launch blocker), **should-have** (important but deferrable), or
**nice-to-have** (move to post-launch). The goal is a focused v1.0 scope that
ships a stable, accessible, privacy-first financial tracker without scope
creep.

### Recommendation

Descope 12 items to post-launch. This reduces v1.0 to 15 actionable issues
focused on core CRUD completion, testing, accessibility, production
infrastructure, and launch readiness. The descoped items are real features that
deserve proper attention — shipping them half-baked would be worse than
deferring them.

### Scope Reduction Summary

| Category       | Before Review | After Review    | Change                        |
| -------------- | ------------- | --------------- | ----------------------------- |
| Must-have      | —             | 15              | —                             |
| Should-have    | —             | 5               | Deferred to v1.1 (Sprint 6–7) |
| Nice-to-have   | —             | 7               | Deferred to v1.2+ (Sprint 8+) |
| **Total Open** | **27**        | **15 for v1.0** | **-12 descoped**              |

---

## Issue-by-Issue Classification

### Must-Have (Launch Blockers) — 15 Issues

These are non-negotiable for v1.0. Without them, the app either does not
function, is not submittable to stores, or has unacceptable quality gaps.

| #    | Title                                         | Rationale                                           | Sprint  |
| ---- | --------------------------------------------- | --------------------------------------------------- | ------- |
| #77  | Full Accessibility Audit (WCAG 2.2 AA)        | Legal/ethical requirement. Blocks store submission. | 3       |
| #198 | Set up GitHub Discussions                     | Community channel for beta. Minimal effort (XS).    | 2       |
| #204 | Compose Preview catalog for all UI components | DX quality gate for Android.                        | Backlog |
| #289 | iOS: Wire KMP shared logic via Swift Export   | Tech debt that blocks iOS maintainability.          | 2       |
| #414 | iOS: Complete KMP shared logic integration    | Companion to #289. Required for iOS parity.         | 2       |
| #535 | Web: Wire server sync endpoint                | Sync is core functionality. Web sync is broken.     | 1       |
| #764 | Analytics event tracking for v1.0             | Cannot measure success without instrumentation.     | 2       |
| #765 | v1.0 scope review (this issue)                | Meta: this review itself.                           | 1       |
| #766 | Google Play Store submission preparation      | Android launch blocker.                             | 5       |
| #767 | v1.0 launch communications                    | Marketing readiness for launch.                     | 5       |
| #769 | v1.0 release go/no-go review                  | Final launch gate. Cannot skip.                     | 5       |
| #770 | Web performance audit and optimization        | Performance budgets must pass before launch.        | 3       |
| #772 | Automate release artifact generation          | Cannot ship without automated builds.               | 4       |

> **Note:** Issues #204 and #198 are small enough to include without scope
> risk. Removing them saves almost no time and loses valuable DX/community
> infrastructure.

### Should-Have (Defer to v1.1, Sprints 6–7) — 5 Issues

Important features that improve the product but are not launch-critical.
Deferring them lets us ship sooner and gives them proper attention post-launch.

| #    | Title                               | Rationale for Deferral                                   | v1.1 Sprint |
| ---- | ----------------------------------- | -------------------------------------------------------- | ----------- |
| #320 | Contextual financial tips           | Content-heavy feature. Core app works without it.        | 6           |
| #319 | Quick-entry transaction mode        | UX improvement, not core functionality.                  | 8           |
| #318 | Bulk transaction editing            | Power user feature. Manual editing works for v1.0.       | 8           |
| #338 | Premium subscription IAP            | Monetization can follow launch. Free app launches first. | 7           |
| #332 | Rate limiting on all Edge Functions | Security hardening. Low risk pre-launch (low traffic).   | 6           |

### Nice-to-Have (Defer to v1.2+, Sprint 8+) — 7 Issues

Features that are genuinely nice but belong in a later release. Forcing them
into v1.0 risks quality and delays launch.

| #    | Title                                     | Rationale for Deferral                                  | Target   |
| ---- | ----------------------------------------- | ------------------------------------------------------- | -------- |
| #237 | NLP transaction input                     | Complex ML feature. **Duplicate of #322** — close #237. | Sprint 9 |
| #242 | Gamification                              | Engagement feature. Needs user data to design well.     | v1.3+    |
| #315 | Customizable dashboard widgets            | Enhancement. Basic dashboard is sufficient for launch.  | Sprint 8 |
| #316 | Spending watchlists with proactive alerts | Advanced feature. #323 (anomaly) covers some scope.     | v1.3+    |
| #241 | Financial insights                        | AI-dependent. Belongs in intelligence layer (Sprint 9). | Sprint 9 |
| #197 | Architecture diagram generator            | Tooling, not user-facing. Nice for docs, not launch.    | Backlog  |
| #627 | Web: sync UI, conflict resolution         | Enhancement over basic sync. #535 covers core sync.     | Backlog  |

---

## Descoping Rationale: Principles Applied

### 1. "Ship the Core Loop First"

The v1.0 core loop is: **Create account → Add transactions → Set budget →
Track progress → Sync across devices.** Every must-have issue directly supports
this loop. Features outside the loop (gamification, widgets, NLP) are
valuable but not essential for a functional launch.

### 2. "Free Before Premium"

Launching as a free app with premium following in Sprint 7 (#338) is
strategically sound:

- Removes monetization complexity from launch
- Lets us establish the free user base and measure conversion intent
- App store review is simpler without IAP on day one
- Users experience the full product before seeing upgrade prompts

### 3. "Security Can Be Layered"

Rate limiting (#332) and certificate pinning (#329, not in v1.0 scope) are
important but low-risk pre-launch when traffic is minimal. They become urgent
in Sprint 6 when real users are on the platform.

### 4. "AI Needs Data"

NLP input (#237), financial insights (#241), and watchlists (#316) all benefit
from having real user data to train and validate against. Shipping them in v1.0
with synthetic data would produce a poor experience.

---

## Impact on Sprint Planning

### Before This Review

Sprint 1–5 would need to close 27 issues in 10 weeks = 2.7 issues/week average.
With XL items like accessibility audit and IAP, this is unrealistic and
guarantees either poor quality or missed deadline.

### After This Review

Sprint 1–5 close 15 issues in 10 weeks = 1.5 issues/week average. With
parallel agent execution and properly sized sprints, this is achievable with
buffer for bugs and unknowns.

### Updated Sprint Allocation

| Sprint | Issues (After Descoping)                      | Count |
| ------ | --------------------------------------------- | ----- |
| 1      | #535, #765, #764, backend infra, PR landing   | 8–11  |
| 2      | #289, #414, #198, data import/export, Android | 8–10  |
| 3      | #77, #770, accessibility, testing             | 6–8   |
| 4      | #772, release prep, UX polish                 | 6–8   |
| 5      | #766, #767, #769, go/no-go, store submission  | 5–7   |

---

## Communication Plan

### To Engineering Agents

> **Scope change:** v1.0 is now focused on 15 core issues. The following are
> removed from v1.0 and rescheduled: #237, #241, #242, #315, #316, #318, #319,
> #320, #332, #338, #627. If you are currently working on any of these, stop
> and reassign to the highest-priority v1.0 item in your queue.

### To Marketing

> **Scope change:** v1.0 launches as a free app. Premium IAP (#338) ships in
> Sprint 7 (v1.1). Launch messaging should emphasize the free, privacy-first
> experience. Premium positioning begins post-launch.

### To Stakeholders

> **Decision:** We are descoping 12 issues from v1.0 to ensure a high-quality
> launch. All descoped items are scheduled for Sprints 6–10 (v1.1 and v1.2).
> Nothing is being cancelled — only sequenced for proper attention.

---

## Milestone Updates Required

| Action                                  | Issues                       |
| --------------------------------------- | ---------------------------- |
| Move from v1.0 to post-launch milestone | #237, #241, #242, #315, #316 |
| Move from v1.0 to v1.1 milestone        | #318, #319, #320, #332, #338 |
| Close as duplicate                      | #237 (duplicate of #322)     |
| Keep in v1.0                            | All 15 must-have issues      |
| Remove stale label from active issues   | #535, #414, #332, #320       |

> **Note:** Milestone moves should be executed via GitHub issue updates. Close
> #237 with a comment linking to #322 as the canonical issue.

---

## Risk Assessment

| Risk                                       | Likelihood | Impact | Mitigation                                    |
| ------------------------------------------ | ---------- | ------ | --------------------------------------------- |
| Descoped features delay user acquisition   | Low        | Medium | Core loop is complete. Features come in v1.1. |
| Team morale impacted by scope cuts         | Low        | Low    | Frame as sequencing, not cancellation.        |
| Competitors ship features we descoped      | Medium     | Low    | Our moat is privacy, not feature count.       |
| v1.0 feels too minimal without widgets/NLP | Medium     | Medium | Strong core + polish > feature breadth.       |
| Descoped items accumulate and never ship   | Low        | High   | Sprint 6–10 plan explicitly schedules all.    |

---

## Acceptance Criteria Verification

- [x] All 27 open v1.0 issues reviewed with classification
- [x] Each classified as must-have, should-have, or nice-to-have
- [x] Descoped items have target sprint/milestone documented
- [x] Project roadmap updated to reflect final v1.0 scope
- [x] Communication plan for all agents/teams defined
- [x] Rationale documented for every descoping decision
- [x] Risk assessment for scope reduction completed

---

## Dependencies

- Sprint 1–5 plan (sprint-plan-1-5.md) — uses this review as input
- Sprint 6–10 plan (sprint-plan-6-10.md) — schedules descoped items
- #769 — Go/no-go review uses this as the scope baseline

---

_This scope review is final for v1.0 planning purposes. Any additions to v1.0
scope after this review require explicit justification and stakeholder
approval._
