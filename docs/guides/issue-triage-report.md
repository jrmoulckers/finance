## Issue Backlog Triage Report

**Date:** 2025-07-22
**Scope:** All open issues in jrmoulckers/finance
**Methodology:** Cross-referenced open issues against open PRs, merged PRs, milestone assignments, labels, and issue descriptions.

### Summary

| Metric                                  | Count |
| --------------------------------------- | ----- |
| Total open issues                       | 100   |
| Issues with open PRs (ready for review) | 10    |
| Potential duplicate pairs               | 5     |
| Missing type labels                     | 8     |
| Potentially resolved by merged work     | 6     |
| Milestone mismatches                    | 3     |
| Issues with no milestone                | 20    |
| Issues marked stale                     | 15    |

### Milestone Breakdown

| Milestone    | Count |
| ------------ | ----- |
| v0.1-alpha   | 1     |
| v0.1-beta    | 8     |
| v1.0         | 23    |
| post-launch  | 48    |
| No milestone | 20    |

---

### Issues with Open PRs (Ready for Review)

These issues have open PRs that implement them. They need code review and merge to close.

| Issue | PR      | Title                                       |
| ----- | ------- | ------------------------------------------- |
| #268  | PR #679 | Self-hosted deployment option               |
| #310  | PR #678 | Build accessibility patterns library        |
| #380  | PR #668 | iOS widgets — Lock Screen, Home Screen      |
| #618  | PR #629 | Android ViewModel unit test coverage        |
| #637  | PR #670 | Fix/upgrade iOS CI workflow                 |
| #645  | PR #666 | Transaction pagination with infinite scroll |
| #646  | PR #666 | Transaction list performance optimization   |
| #647  | PR #666 | Transaction detail enhancements             |
| #649  | PR #672 | watchOS companion — wire real KMP data      |
| #651  | PR #667 | XCUITest automation suite                   |

> **Note:** #534 and #640 are also referenced by open PRs (#671 and #669) but are already closed, indicating they were addressed by earlier merged PRs. The open PRs may need rebasing or the references are secondary.

---

### Potential Duplicates

**1. iOS KMP/Swift Export — #289 vs #414**

- #289 "Wire KMP shared logic via Swift Export bridge" (v1.0, tech-debt)
- #414 "Complete KMP shared logic integration via Swift Export bridge" (v1.0, tech-debt)
- **Assessment:** These describe the same work — integrating KMP into iOS via Swift Export. #414 appears to be a broader restatement of #289. Recommend closing #289 as duplicate of #414.

**2. Web Sync Wiring — #535 vs #627**

- #535 "Wire server sync endpoint — replace replayMutations stub" (v1.0)
- #627 "Wire sync endpoint, enhance sync UI, and complete responsive breakpoint system" (no milestone)
- **Assessment:** #627 is a superset that bundles #535's sync work with additional UI/responsive work. Recommend closing #535 as subsumed by #627, or splitting #627 into separate issues.

**3. Rate Limiting — #332 vs #272**

- #332 "Rate limiting on all Edge Functions" (v1.0, Stage 11)
- #272 "API rate limiting and abuse prevention" (post-launch)
- **Assessment:** Merged PR #643 already implemented rate limiting on all 7 Edge Functions. Both issues may be substantially resolved. See "Possibly Resolved" section below.

**4. Animation Libraries — #313 vs #306**

- #313 "Celebratory animations library" (v1.0, Stage 9)
- #306 "Create shared animation library across platforms" (v1.0, design-system)
- **Assessment:** #306 is the broader shared animation infrastructure; #313 is a specific use case (celebratory animations). #313 should depend on #306 rather than being independent.

**5. AI Categorization — #321 vs #263**

- #321 "On-device AI auto-categorization" (post-launch, Stage 10)
- #263 "AI-powered transaction categorization" (post-launch)
- **Assessment:** Significant overlap — both implement AI-based transaction categorization. #321 specifies on-device; #263 is more general. Recommend keeping #321 and closing #263, or merging their acceptance criteria.

---

### Possibly Resolved by Merged Work

These issues appear to have been addressed by already-merged PRs but remain open.

**1. #332 — Rate limiting on all Edge Functions**

- PR #643 (merged) implemented database-backed sliding-window rate limiting on all 7 Edge Functions, closing #614.
- #332 asks for the same thing. It should likely be closed or scoped to any remaining work not covered.

**2. #272 — API rate limiting and abuse prevention**

- Also substantially addressed by PR #643. The "abuse prevention" aspect may still have open work (e.g., IP blocking, account lockout), but the core rate limiting is done.

**3. #444 — Wire page components to data hooks**

- PR #636 (merged, 4-sprint web expansion) wired hooks to pages, replaced mock data, and implemented dashboard, accounts, transactions, budgets, and goals pages with real data.
- This issue's core ask appears fully addressed.

**4. #445 — CRUD forms for transaction entry and account management**

- PR #636 also included form components for accounts, transactions, budgets, goals, and categories.
- This issue's core ask appears fully addressed.

**5. #309 — Create responsive breakpoint system**

- PR #636 included responsive breakpoint work as part of Sprint 4. Additionally, #627 bundles remaining responsive work.
- May be partially resolved — verify against acceptance criteria.

**6. #520 — Consolidate bottom navigation**

- PR #617 (merged) fixed bottom navigation routing and renamed tabs. This issue is in v0.1-alpha and labeled stale.
- The specific routing fix was addressed; the broader UX question of merging tabs may still be open but is stale.

---

### Missing Labels

**Missing type label** (no feature/bug/chore/task/etc.):

| Issue | Current Labels               | Suggested Type |
| ----- | ---------------------------- | -------------- |
| #651  | platform:ios, testing        | `task`         |
| #641  | platform:ios, testing, ci-cd | `chore`        |
| #627  | comp:sync, phase-5, web      | `feature`      |
| #576  | platform:android             | `feature`      |
| #520  | platform:android, stale      | `feature`      |
| #445  | phase-5, web                 | `feature`      |
| #444  | phase-5, web                 | `feature`      |
| #309  | web, design-system           | `feature`      |

**Missing platform label** (cross-platform features without scope):

| Issue | Current Labels          | Suggested Platform                    |
| ----- | ----------------------- | ------------------------------------- |
| #385  | feature, ui, stale      | `platform:all` (onboarding)           |
| #384  | feature, stale          | `platform:all` (notifications)        |
| #383  | feature, stale          | `platform:all` (streaks)              |
| #382  | feature, premium, stale | `platform:all` (education)            |
| #379  | feature, ui, stale      | `platform:all` (adaptive UI)          |
| #378  | feature, ui             | `platform:all` (education tooltips)   |
| #377  | feature, ui             | `platform:all` (affordability widget) |

---

### Milestone Concerns

**1. #338 — Premium subscription IAP (v1.0, but labeled Stage 12 + stale)**

- All other Stage 12 issues are in `post-launch`. #338 is the only Stage 12 issue in `v1.0`.
- **Recommend:** Move to `post-launch` to match its siblings.

**2. #520 — Consolidate bottom navigation (v0.1-alpha, stale)**

- `v0.1-alpha` is a historical milestone. This issue has been partially addressed by PR #617 and is marked stale.
- **Recommend:** Either close as resolved/obsolete, or move to `v0.1-beta` if remaining UX work is desired.

**3. 20 issues with no milestone assigned**

- All recently created issues (#611–#686) lack milestones. These include active iOS features, backend infrastructure, Android work, and web sync.
- **Recommend:** Triage these into appropriate milestones:
  - iOS features (#645–#654, #680–#682): `v0.1-beta` (active platform work)
  - Backend infrastructure (#683–#686): `v1.0` (infrastructure for launch)
  - Android (#618, #635): `v0.1-beta` (active platform work)
  - Web (#611, #627): `v1.0` (feature completion for launch)
  - iOS CI (#637, #641): `v0.1-beta` (CI for active development)

---

### Stale/Outdated Issues

15 issues carry the `stale` label. All are in `post-launch` except:

- **#520** (v0.1-alpha) — Partially addressed, likely obsolete
- **#338** (v1.0) — Milestone mismatch, should be post-launch

The remaining 13 stale issues (#379–#385, #339–#344) are all post-launch feature/monetization ideas. They are appropriately parked in `post-launch` and can remain as-is. No action needed unless scope changes.

**#380 (iOS widgets)** is labeled `stale` but has an active open PR #668 implementing it. The `stale` label should be removed.

---

### Blocked / Dependency Issues

| Issue                               | Blocked By             | Reason                                           |
| ----------------------------------- | ---------------------- | ------------------------------------------------ |
| #466 (sync engine)                  | Architectural decision | Needs sync protocol design before implementation |
| #535 (web sync endpoint)            | #466                   | Depends on sync engine being implemented         |
| #415 (Windows screens)              | #589                   | Windows agent activation prerequisite            |
| #313 (celebratory animations)       | #306                   | Needs shared animation library first             |
| #293 (widget support all platforms) | #380, #381             | Per-platform widget work prerequisite            |

---

### Recommended Actions

**Immediate (can do now):**

1. **Review and merge 10 open PRs** — #629, #666, #667, #668, #669, #670, #671, #672, #678, #679 — each implements an open issue
2. **Close #289** as duplicate of #414 (both iOS Swift Export bridge)
3. **Close #444 and #445** as resolved by merged PR #636 (web 4-sprint expansion)
4. **Close #332** as resolved by merged PR #643 (rate limiting on all Edge Functions)
5. **Remove `stale` label from #380** — it has an active PR (#668)
6. **Close or archive #520** — partially addressed by PR #617, stale, in obsolete v0.1-alpha milestone

**Milestone fixes:**

7. **Move #338** from `v1.0` to `post-launch` (align with other Stage 12 issues)
8. **Assign milestones to 20 unassigned issues** — see Milestone Concerns section for suggested assignments

**Label fixes:**

9. **Add type labels** to 8 issues (#651, #641, #627, #576, #520, #445, #444, #309)
10. **Add platform labels** to 7 cross-platform feature issues (#377–#385)

**Scope clarification:**

11. **Clarify #272** — determine if remaining abuse-prevention work beyond rate limiting justifies keeping it open
12. **Clarify #309** — verify if responsive breakpoint system was fully delivered by PR #636 or has remaining work
13. **Split or close #535** — its scope is now subsumed by #627 (web sync superset)
14. **Add dependency note** to #313 indicating it depends on #306 (shared animation library)

**No action needed:**

15. The 13 stale post-launch feature issues (#379–#385, #339–#344) are appropriately parked. Review during post-launch planning.
16. The 48 post-launch issues are well-organized by stage and can remain as-is.
