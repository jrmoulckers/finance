---
name: accessibility-testing
description: >
  Accessibility testing methodology. Use for topics related to WCAG 2.2 AA, a11y
  testing, screen readers, keyboard navigation, focus management, contrast,
  reduced motion, VoiceOver, TalkBack, Narrator, or inclusive QA.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Accessibility Testing Skill

**Trigger:** a11y validation, WCAG 2.2 AA checks, screen-reader/keyboard passes, focus or
contrast/motion review.
**Inputs:** target surfaces/routes, platforms in scope, assistive tech available.
**Related:** `ux-testing` (broader manual QA), `design-tokens` (contrast/motion tokens),
`i18n-localization` (localized labels, text expansion), `issue-management` (filing scoped issues).

## Out of scope

- General manual QA orchestration and bug discovery → use `ux-testing`.
- Design-token authoring and color-system changes → use `design-tokens`.
- Security/privacy vulnerability review → use `security-review-methodology`.

## Method

1. **Keyboard first** — complete core flows without pointer/touch (sign-in, primary CRUD,
   search/filter, settings).
2. **Screen-reader pass** — verify useful names, roles, values, state changes, validation
   errors, and status/offline banners.
3. **Focus management** — route changes move focus to the page heading; dialogs trap focus
   and restore it to the opener.
4. **No color-only signaling** — never encode meaning by color alone; provide text or data-table
   alternatives to charts and visualizations.
5. **Visual accessibility** — verify contrast for normal/large text, focus rings, disabled
   controls, high contrast, dark mode, and reduced motion.
6. **Scaling & localization** — test large text / dynamic type and long translated labels;
   critical values must remain readable and not truncate.
7. **Error announcement** — validation and async failures use live regions / platform-native
   announcements and include actionable recovery.

## Platform checklist

| Platform | Required checks |
| --- | --- |
| Web | Semantic HTML, ARIA only when needed, tab order, `prefers-reduced-motion`, Lighthouse accessibility gate |
| iOS | VoiceOver rotor order, Dynamic Type, SwiftUI labels/hints |
| Android | TalkBack order, Compose `semantics`, ≥48dp touch targets, font scaling, high contrast |
| Desktop | Screen-reader names/roles, keyboard shortcuts, visible focus, high contrast, window resizing |

> Test only the platforms your product ships. Drop rows that don't apply.

## Acceptance criteria for a11y issues

- Reproduction names the assistive technology or preference used.
- Expected result names the WCAG criterion or platform guideline.
- Files cite the implementation path (and any shared helper path).
- Cross-platform note: does the same pattern exist on the product's other platforms?
- Severity reflects user impact — especially blocked workflows or hidden critical values.

## Safety

Report-only. File issues and route shared-token fixes to `design-tokens` rather than editing
them here.

## Output

A scoped accessibility report plus filed issues that cite WCAG criteria and implementation paths.
