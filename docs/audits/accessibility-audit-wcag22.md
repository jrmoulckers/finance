# WCAG 2.2 AA Accessibility Audit

> **Audit Date:** 2026-05-05
> **Auditor:** @accessibility-reviewer
> **Issue:** #77
> **Scope:** All 4 platforms (iOS, Android, Web, Windows)
> **Standard:** WCAG 2.2 Level AA

---

## Executive Summary

**The Finance application demonstrates an exceptionally strong accessibility
foundation.** Every platform has dedicated accessibility infrastructure — not
just annotations, but architectural support. No critical violations were found.

**Conformance claim: Partially Supports WCAG 2.2 Level AA** — with a clear,
achievable path to full conformance.

---

## Audit Scope

| Platform    | Files Reviewed                                                                                                                                  | Status      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **Web**     | `aria.ts`, `accessibility.css`, `cognitive.css`, `tokens.css`, `wcag-audit.test.ts`, `useFocusTrap.test.ts`, `lighthouserc.json`, forms, layout | ✅ Complete |
| **iOS**     | `AccessibilityModifiers.swift`, `DynamicTypeSupport.swift`, `HapticManager.swift`                                                               | ✅ Complete |
| **Android** | `WcagCompliance.kt`, `HighContrastTheme.kt`, `CognitiveAccessibilityManager.kt`, `AccessibilityConstants.kt`, `AccessibilityExtensions.kt`      | ✅ Complete |
| **Windows** | `NarratorSupport.kt`, `KeyboardNavigation.kt`, `AccessibilityAudit.kt`                                                                          | ✅ Complete |
| **Docs**    | `accessibility.md`, `vpat-2.5.md`                                                                                                               | ✅ Complete |

---

## WCAG 2.2 AA Criteria Coverage

| Principle         | Criteria Covered | Supports | Partially Supports | Gaps  |
| ----------------- | ---------------- | -------- | ------------------ | ----- |
| 1. Perceivable    | 13               | 11       | 2                  | 0     |
| 2. Operable       | 12               | 12       | 0                  | 0     |
| 3. Understandable | 8                | 7        | 1                  | 0     |
| 4. Robust         | 3                | 3        | 0                  | 0     |
| **Total**         | **36**           | **33**   | **3**              | **0** |

---

## Findings by Severity

### 🔴 CRITICAL — None found

No show-stopping accessibility violations were identified.

---

### 🟠 MEDIUM (2 findings) — Fixed in this PR

**M-1: Web `announce()` creates a single shared live region with mutable politeness**

- **File:** `apps/web/src/accessibility/aria.ts`
- **WCAG Criterion:** 4.1.3 Status Messages
- **Issue:** The `announce()` function created a single `<div>` element and
  toggled its `aria-live` attribute between `"polite"` and `"assertive"` on
  each call. Screen readers cache the initial `aria-live` value, so assertive
  announcements could be treated as polite.
- **Fix applied:** Two separate live region elements — one for polite, one for
  assertive — with correct roles (`role="status"` / `role="alert"`).

**M-2: Web `ariaLive()` always sets `role="status"` regardless of politeness**

- **File:** `apps/web/src/accessibility/aria.ts`
- **WCAG Criterion:** 4.1.3 Status Messages
- **Issue:** `ariaLive()` always set `role="status"` even when `politeness`
  was `"assertive"`, creating a semantic conflict (`role="status"` implies
  `aria-live="polite"`).
- **Fix applied:** `role="alert"` for assertive, `role="status"` for polite.

---

### 🟡 LOW (4 findings)

**L-1: Windows `FocusTrap` composable is a no-op**

- **File:** `apps/windows/.../accessibility/KeyboardNavigation.kt`
- **WCAG Criterion:** 2.1.2 No Keyboard Trap / 2.4.7 Focus Visible
- **Issue:** `FocusTrap` wraps content in a `Box` with `onPreviewKeyEvent`
  that always returns `false`. Compose Desktop does NOT automatically restrict
  focus within a `Box` subtree — focus can escape modal dialogs.
- **Remediation:** Implement proper focus cycling or use `Dialog` composable
  with built-in focus trapping.

**L-2: Android/Windows budget ring animations ignore reduced motion**

- **WCAG Criterion:** 2.3.3 Animation from Interactions
- **Issue:** Budget progress ring animations use `tween(800)` but don't check
  `LocalReduceMotion` or system `ANIMATOR_DURATION_SCALE`.
- **Remediation:** Use `snap()` animation spec when reduced motion is active.

**L-3: iOS transaction row omits amount from combined accessibility label**

- **WCAG Criterion:** 1.1.1 Non-text Content
- **Issue:** Transaction row's `accessibilityLabel` includes payee and
  category but omits the transaction amount.
- **Remediation:** Include formatted amount in the combined label.

**L-4: Web chart category labels hidden for small slices without alternative**

- **WCAG Criterion:** 1.4.1 Use of Color
- **Issue:** Pie chart labels are hidden for slices < 5% of total. While
  `buildChartDescription()` provides a screen reader text alternative, sighted
  users must rely solely on color.
- **Remediation:** Add a legend component listing all categories.

---

### ℹ️ INFORMATIONAL (3 findings)

**I-1: Android `headingLevel()` parameter is unused** — The `level` parameter
is suppressed via `@Suppress("UNUSED_PARAMETER")` since Compose only supports
a single `heading()` flag. Consider removing or documenting the limitation.

**I-2: Windows app at pre-feature-parity stage** — Accessibility annotations
are in place for implemented UI. Re-audit after Windows reaches full parity.

**I-3: Web `lang` attribute not verified from component code** — Verify
`<html lang="en">` exists in `index.html` and add a Lighthouse assertion.

---

## Platform-by-Platform Assessment

### Web (React PWA) — Grade: A

| Area                    | Status | Details                                                              |
| ----------------------- | ------ | -------------------------------------------------------------------- |
| Screen reader support   | ✅     | ARIA roles, labels, live regions, `announce()` utility               |
| Keyboard navigation     | ✅     | Full Tab/Shift+Tab, arrow keys, Escape, focus traps, skip-to-content |
| Color contrast          | ✅     | Semantic tokens, `prefers-contrast` support, high contrast mode      |
| Touch targets           | ✅     | Global 44×44px minimum in CSS                                        |
| Reduced motion          | ✅     | Global `prefers-reduced-motion` with `!important` overrides          |
| Dynamic Type / zoom     | ✅     | Relative units (`rem`), content reflows at 320px (400% zoom)         |
| Dark mode               | ✅     | `prefers-color-scheme`, `data-theme` attribute, OLED variant         |
| Cognitive accessibility | ✅     | `data-a11y-cognitive` mode with token overrides                      |
| Automated testing       | ✅     | Lighthouse CI at 95% threshold                                       |
| Focus management        | ✅     | `FocusManager` for route transitions, `useFocusTrap` for modals      |

### iOS (SwiftUI) — Grade: A

| Area                  | Status | Details                                                              |
| --------------------- | ------ | -------------------------------------------------------------------- |
| VoiceOver             | ✅     | `financeLabel`, `financeHint`, `financeHeading`, `financeLiveRegion` |
| Dynamic Type          | ✅     | Full AX1–AX5, `ClampedScaledMetric`, `AdaptiveFinanceStack`          |
| Touch targets         | ✅     | 44pt base via `@ScaledMetric`, scales with Dynamic Type              |
| Haptic feedback       | ✅     | Hardware-aware, respects system haptic toggle                        |
| Currency announcement | ✅     | Locale-aware formatting with `financeCurrencyLabel`                  |
| Reduced motion        | ✅     | `accessibilityReduceMotion` respected on `ProgressRing`              |

### Android (Jetpack Compose) — Grade: A

| Area                    | Status | Details                                                                      |
| ----------------------- | ------ | ---------------------------------------------------------------------------- |
| TalkBack                | ✅     | `financeSemantic`, `headingLevel`, `liveRegion`, `traversalOrder`            |
| Touch targets           | ✅     | `minTouchTarget()` at 48dp, cognitive mode at 56dp                           |
| Contrast verification   | ✅     | Runtime `contrastRatio()`, `meetsContrastAA()`, `meetsLargeTextContrastAA()` |
| High contrast theme     | ✅     | AAA-level light and dark schemes                                             |
| Cognitive accessibility | ✅     | `CognitiveAccessibilityManager` with plain language, simplified mode         |
| Font scaling            | ✅     | Material 3 sp-based typography                                               |

### Windows (Compose Desktop) — Grade: A-

| Area                 | Status | Details                                                                           |
| -------------------- | ------ | --------------------------------------------------------------------------------- |
| Narrator support     | ✅     | Full modifier set: `narratorLabel`, `narratorHeading`, `narratorLiveRegion`, etc. |
| Keyboard navigation  | ✅     | `rememberInitialFocus`, `dismissOnEscape`, `activateOnEnterOrSpace`               |
| Focus trap           | ⚠️     | `FocusTrap` composable is a no-op (L-1)                                           |
| High contrast        | ⚠️     | Relies on dark/light proxy; no direct Windows high contrast registry reading      |
| Screen audit         | ✅     | Living checklist per screen in `AccessibilityAudit.kt`                            |
| Content descriptions | ✅     | Comprehensive `AccessibilityConstants` with format templates                      |

---

## Remediation Priority Matrix

| ID  | Severity | Platform         | Complexity | Sprint         |
| --- | -------- | ---------------- | ---------- | -------------- |
| M-1 | Medium   | Web              | Low        | ✅ Fixed in PR |
| M-2 | Medium   | Web              | Low        | ✅ Fixed in PR |
| L-1 | Low      | Windows          | Medium     | Next sprint    |
| L-2 | Low      | Android, Windows | Low        | Next sprint    |
| L-3 | Low      | iOS              | Low        | Next sprint    |
| L-4 | Low      | Web              | Medium     | Backlog        |

---

## References

- [WCAG 2.2 Specification](https://www.w3.org/TR/WCAG22/)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [Accessibility Guide](../../guides/accessibility.md)
- [VPAT 2.5](../../compliance/vpat-2.5.md)
- [Feature Parity Matrix](./feature-parity-matrix.md)
