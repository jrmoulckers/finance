---
name: accessibility-testing
description: >
  Accessibility testing methodology for the Finance app. Use for topics related
  to WCAG 2.2 AA, a11y testing, screen readers, keyboard navigation, focus
  management, contrast, reduced motion, TalkBack, VoiceOver, Narrator, or
  inclusive QA.
---

# Accessibility Testing Skill

## Purpose

This skill covers **accessibility validation and assistive-technology testing** across Web, iOS, Android, and Windows. It turns WCAG 2.2 AA requirements into concrete Finance app checks for financial workflows, charts, forms, and offline/sync states.

## Out of Scope

- General manual QA session orchestration and bug discovery → use `ux-testing`.
- Design-token authoring and color-system changes → use `design-tokens`.
- Issue filing quality, duplicate decisions, and platform labels → use `issue-management`.
- Security/privacy vulnerability review → use `security-review-methodology` or `privacy-compliance`.

## Related Skills

| Skill               | Use For                                                       |
| ------------------- | ------------------------------------------------------------- |
| `ux-testing`        | Broader manual QA sessions and bug investigation              |
| `design-tokens`     | Contrast-safe color tokens, motion tokens, and chart palettes |
| `i18n-localization` | Localized labels, date/currency formats, and text expansion   |
| `issue-management`  | Filing accessible, scoped, cross-platform issues              |

## Repo-Specific Surfaces

| Surface         | Paths / Tools                                                                |
| --------------- | ---------------------------------------------------------------------------- |
| Web helpers     | `apps/web/src/lib/a11y.ts`, `apps/web/src/lib/ux/a11y-preferences.ts`        |
| Web styles      | `apps/web/src/styles/accessibility.css`, `apps/web/src/theme/tokens.css`     |
| Chart a11y      | `apps/web/src/components/charts/chart-accessibility.tsx`                     |
| Lighthouse gate | `apps/web/lighthouserc.json` (`categories:accessibility` minimum score 0.95) |
| Android         | `apps/android/**` Jetpack Compose semantics + TalkBack                       |
| iOS             | `apps/ios/Finance/**` SwiftUI accessibility labels + VoiceOver               |
| Windows         | `apps/windows/**` Compose Desktop semantics + Narrator                       |

## Test Methodology

1. **Keyboard first**: complete core flows without pointer/touch: sign-in, create/edit transaction, search/filter, budget/goal CRUD, settings, export/delete account.
2. **Screen reader pass**: verify useful names, roles, values, state changes, validation errors, and sync/offline banners.
3. **Focus management**: route changes move focus to the page heading; dialogs trap focus and restore it to the opener.
4. **Financial chart alternatives**: charts must expose data tables or textual summaries; never encode gains/losses by color alone.
5. **Visual accessibility**: verify contrast for normal/large text, focus rings, disabled controls, high contrast, dark mode, and reduced motion.
6. **Scaling and localization**: test large text/dynamic type and long translated labels; financial amounts must remain readable and not truncate critical digits.
7. **Error announcement**: validation and async failures use live regions / platform-native announcements and include actionable recovery.

## Platform Checklist

| Platform | Required Checks                                                                                          |
| -------- | -------------------------------------------------------------------------------------------------------- |
| Web      | Semantic HTML, ARIA only when needed, tab order, `prefers-reduced-motion`, Lighthouse accessibility gate |
| iOS      | VoiceOver rotor order, Dynamic Type, large content viewer where applicable, SwiftUI labels/hints         |
| Android  | TalkBack order, Compose `semantics`, minimum 48dp touch targets, font scaling, high contrast             |
| Windows  | Narrator names/roles, keyboard shortcuts, visible focus, high contrast, window resizing                  |

## Acceptance Criteria for A11y Issues

- Reproduction includes the assistive technology or preference used.
- Expected result names the WCAG criterion or platform guideline.
- Files cite the platform implementation path and any shared helper path.
- Cross-platform section says whether the same pattern exists on Web, iOS, Android, and Windows.
- Severity reflects user impact, especially blocked financial workflows or hidden financial values.
