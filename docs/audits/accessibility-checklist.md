# Accessibility Audit Checklist — WCAG 2.2 AA

**Last updated:** 2025-07-22
**Standard:** [WCAG 2.2](https://www.w3.org/TR/WCAG22/) Level AA
**References:** [OWASP MASVS](https://mas.owasp.org/), [ADR-0005 Design System](../architecture/0005-design-system-approach.md)

> This checklist covers all four Finance platforms (Android, iOS, Web, Windows).
> Each item must pass on **every** platform before a release is considered accessible.

---

## 1. Per-Platform Testing Matrix

Every accessibility audit must include testing on all target platforms with their
native assistive technologies.

### 1.1 Screen Reader Verification

| Platform | Assistive Technology | Min OS Version | Test Method |
|----------|---------------------|----------------|-------------|
| Android  | TalkBack            | Android 9+     | Enable in Settings > Accessibility > TalkBack |
| iOS      | VoiceOver           | iOS 16+        | Enable in Settings > Accessibility > VoiceOver |
| Web      | NVDA / JAWS / VoiceOver (macOS) | Latest stable | Browser + screen reader combination |
| Windows  | Narrator            | Windows 10+    | Win + Ctrl + Enter to toggle Narrator |

### 1.2 Screen Reader Test Cases

- [ ] **All interactive elements are announced** — buttons, links, inputs, toggleable controls
- [ ] **Correct roles announced** — "button", "link", "heading level 2", "checkbox checked", etc.
- [ ] **Labels are descriptive** — "Add transaction" not "Button", "Account balance $1,234.56" not "Text"
- [ ] **State changes announced** — loading states, error messages, success confirmations
- [ ] **Navigation order is logical** — follows visual layout, no focus traps
- [ ] **Financial amounts read correctly** — "$1,234.56" reads as "one thousand two hundred thirty-four dollars and fifty-six cents" or equivalent
- [ ] **Custom components expose correct semantics** — charts, graphs, data tables have text alternatives
- [ ] **No content hidden from assistive tech without reason** — decorative images use `aria-hidden`/`importantForAccessibility=no`

### 1.3 Platform-Specific ARIA / Semantics

| Platform | Semantic Layer | Key APIs |
|----------|---------------|----------|
| Android  | `contentDescription`, `stateDescription`, `AccessibilityNodeInfo` | `ViewCompat.setAccessibilityDelegate()` |
| iOS      | `accessibilityLabel`, `accessibilityTraits`, `accessibilityValue` | `UIAccessibility` protocol |
| Web      | ARIA roles, `aria-label`, `aria-live`, `aria-describedby` | WAI-ARIA 1.2 specification |
| Windows  | `AutomationProperties.Name`, `AutomationProperties.AutomationId` | UI Automation / Microsoft Accessibility Insights |

---

## 2. Color Contrast Requirements

All text and meaningful UI elements must meet WCAG 2.2 AA contrast ratios.

### 2.1 Contrast Ratios

| Element Type | Minimum Ratio | Example |
|-------------|---------------|---------|
| Body text (< 18pt / < 14pt bold) | **4.5:1** | Transaction descriptions, account names |
| Large text (>= 18pt / >= 14pt bold) | **3:1** | Section headings, dashboard totals |
| UI components and graphical objects | **3:1** | Buttons, input borders, chart segments, icons |
| Focus indicators | **3:1** against adjacent colors | Keyboard focus rings |

### 2.2 Contrast Verification Steps

- [ ] **Run automated contrast scanner** — axe-core (web), Accessibility Scanner (Android), Accessibility Inspector (iOS/macOS)
- [ ] **Test in light mode AND dark mode** — both themes must independently meet ratios
- [ ] **Test high-contrast mode** — Windows High Contrast, iOS Increase Contrast
- [ ] **Verify color is not the sole indicator** — use icons, patterns, or text alongside color (e.g., red + icon for negative balances)
- [ ] **Chart accessibility** — pie/bar chart segments distinguishable by pattern/texture, not just color
- [ ] **Budget status indicators** — "over budget" communicated via text/icon, not only red color

### 2.3 Tools

| Tool | Platform | Usage |
|------|----------|-------|
| [axe DevTools](https://www.deque.com/axe/) | Web | Browser extension for automated checks |
| [Accessibility Scanner](https://play.google.com/store/apps/details?id=com.google.android.apps.accessibility.auditor) | Android | On-device automated audit |
| Accessibility Inspector | iOS / macOS | Xcode > Open Developer Tool > Accessibility Inspector |
| [Accessibility Insights](https://accessibilityinsights.io/) | Windows / Web | Microsoft free auditing tool |
| [Colour Contrast Analyser](https://www.tpgi.com/color-contrast-checker/) | All | Manual point-and-click contrast checker |

---

## 3. Touch Target Sizes

All interactive elements must meet minimum touch target sizes for reliable
activation, especially critical for financial operations where mis-taps
can trigger unintended actions.

### 3.1 Minimum Sizes

| Platform | Minimum Target | Standard | Notes |
|----------|---------------|----------|-------|
| Android  | **48 x 48 dp** | Material Design 3 | `android:minHeight="48dp"` / `Modifier.minimumInteractiveComponentSize()` |
| iOS      | **44 x 44 pt** | Apple HIG | `frame(minWidth: 44, minHeight: 44)` in SwiftUI |
| Web      | **44 x 44 CSS px** | WCAG 2.2 Target Size (Level AA) | `min-width: 44px; min-height: 44px;` |
| Windows  | **44 x 44 epx** | WinUI 3 / Fluent Design | Effective pixels, same as iOS/Web |

### 3.2 Touch Target Verification

- [ ] **All buttons meet minimum size** — including icon-only buttons (edit, delete, expand)
- [ ] **Adequate spacing between targets** — minimum 8dp/8pt gap to prevent accidental activation
- [ ] **Destructive actions have larger targets or confirmation** — delete transaction, remove account
- [ ] **Form inputs are full-width or adequately sized** — amount fields, date pickers, category selectors
- [ ] **Navigation elements are reachable** — bottom nav items, tab bar items, back buttons
- [ ] **Floating action buttons meet minimum** — "Add transaction" FAB is at least 56dp (Android) / 44pt (iOS)

---

## 4. Focus Management Verification

Focus management is critical for keyboard users, screen reader users, and switch access users.

### 4.1 Focus Order and Visibility

- [ ] **Focus order matches visual order** — tab through the page/screen logically
- [ ] **Focus indicator is visible** — 2px+ outline with 3:1 contrast ratio
- [ ] **No focus traps** — user can always tab out of any component (except intentional modals)
- [ ] **Focus moves to new content** — when navigating to a new screen, focus moves to the heading or first element
- [ ] **Modal focus containment** — focus is trapped inside open modals, returns to trigger on close
- [ ] **Focus restored after actions** — after deleting a transaction, focus moves to the next item, not lost

### 4.2 Platform-Specific Focus

| Platform | Focus API | Verification |
|----------|----------|-------------|
| Android  | `android:focusable`, `android:nextFocusDown/Up/Left/Right` | Tab through with external keyboard |
| iOS      | `accessibilityViewIsModal`, `UIFocusEnvironment` | Connect hardware keyboard, use Tab / Shift+Tab |
| Web      | `tabindex`, `:focus-visible`, `focus()` | Tab through entire page, verify visible focus ring |
| Windows  | `TabIndex`, `FocusManager`, `XYFocus` | Tab and arrow key navigation |

### 4.3 Critical Focus Scenarios (Finance-Specific)

- [ ] **Transaction form** — focus starts on amount field, moves logically to category, date, notes, save
- [ ] **Account list** — focus moves through accounts in order, activating an account moves focus to detail view
- [ ] **Error state** — when validation fails, focus moves to the first error message
- [ ] **Confirmation dialogs** — "Delete account?" dialog traps focus, Cancel is focused by default (prevent accidental destructive action)
- [ ] **Search results** — focus moves to results region when results appear, announces count

---

## 5. Dynamic Type / Font Scaling

Users with low vision rely on system font scaling. The app must adapt without loss of content or functionality.

### 5.1 Scaling Requirements

| Platform | Setting | Range | API |
|----------|---------|-------|-----|
| Android  | Font Size (Settings > Display) | 0.85x – 2.0x (200%) | `sp` units for text, never `dp` for font sizes |
| iOS      | Dynamic Type (Settings > Display & Brightness > Text Size) | xSmall – AX5 (~3.1x) | `UIFont.preferredFont(forTextStyle:)` / `.dynamicTypeSize` |
| Web      | Browser zoom / `font-size` in `<html>` | 100% – 200% (WCAG req) | `rem`/`em` units, never `px` for text |
| Windows  | Text scaling (Settings > Accessibility > Text size) | 100% – 225% | `FontSize` bound to system scaling |

### 5.2 Font Scaling Verification

- [ ] **Set system to maximum font scale** — verify no text is truncated or hidden
- [ ] **Content reflows** — long text wraps, does not overflow containers
- [ ] **No horizontal scrolling at 200% zoom** (web) — content adapts within viewport
- [ ] **Financial amounts remain fully visible** — "$1,234,567.89" does not get cut off
- [ ] **Charts/graphs scale or provide text alternatives** — data is not lost at large text
- [ ] **Minimum text size is 12sp/12pt** — even at smallest system setting
- [ ] **No fixed-height containers that clip text** — use min-height, not fixed height

---

## 6. Reduced Motion Preference

Users with vestibular disorders, motion sickness, or cognitive disabilities may enable reduced motion settings.

### 6.1 Motion Reduction Requirements

| Platform | Setting | API |
|----------|---------|-----|
| Android  | Remove animations (Settings > Accessibility > Remove animations) | `Settings.Global.ANIMATOR_DURATION_SCALE` |
| iOS      | Reduce Motion (Settings > Accessibility > Motion > Reduce Motion) | `UIAccessibility.isReduceMotionEnabled` / `@Environment(\.accessibilityReduceMotion)` |
| Web      | `prefers-reduced-motion` media query | `@media (prefers-reduced-motion: reduce)` |
| Windows  | Show animations (Settings > Accessibility > Visual effects) | `UISettings.AnimationsEnabled` |

### 6.2 Motion Verification

- [ ] **All animations respect reduced motion** — cross-fades replace slide/bounce/zoom transitions
- [ ] **No auto-playing animations** — or they must have pause/stop controls
- [ ] **Chart animations can be disabled** — pie chart "spin-in" replaced by static render
- [ ] **Page transitions simplified** — instant cut or simple fade, no parallax or sliding
- [ ] **Loading indicators are static or subtle** — spinner replaced by pulsing dot or static "Loading..."
- [ ] **No flashing content** — nothing flashes more than 3 times per second (WCAG 2.3.1)

---

## 7. Keyboard Navigation (Web)

The web app must be fully operable with keyboard alone.

### 7.1 Keyboard Support Matrix

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Move focus forward / backward |
| `Enter` / `Space` | Activate focused element |
| `Escape` | Close modal / dropdown / popover |
| `Arrow keys` | Navigate within components (tabs, menus, radio groups, date pickers) |
| `Home` / `End` | Jump to first / last item in list |

### 7.2 Keyboard Verification Steps

- [ ] **All functionality accessible via keyboard** — no mouse-only interactions
- [ ] **Skip-to-content link present** — first Tab on page focuses a "Skip to main content" link
- [ ] **Tab order matches visual order** — no confusing jumps
- [ ] **Custom widgets follow ARIA authoring practices** — combobox, tabs, dialog, menu patterns
- [ ] **Dropdown menus navigable with arrows** — Enter to select, Escape to close
- [ ] **Date picker keyboard-accessible** — arrow keys move between days, Enter selects
- [ ] **Data tables navigable** — arrow keys move between cells, screen reader announces row/column headers
- [ ] **No keyboard shortcuts conflict with assistive tech** — avoid single-key shortcuts unless dismissable (WCAG 2.1.4)

### 7.3 Financial-Specific Keyboard Scenarios

- [ ] **Transaction list** — arrow keys to navigate rows, Enter to view detail, Delete key with confirmation for removal
- [ ] **Amount input** — supports number entry, decimal point, negative sign, currency symbol auto-format
- [ ] **Category picker** — type-ahead search, arrow keys to highlight, Enter to select
- [ ] **Dashboard widgets** — Tab to each widget, Enter to drill down, Escape to return

---

## 8. Automated Testing Integration

### 8.1 CI Pipeline Checks

| Tool | Platform | Integration |
|------|----------|-------------|
| [axe-core](https://github.com/dequelabs/axe-core) | Web | `.github/workflows/a11y-audit.yml` — runs on every push to `main` |
| [Espresso Accessibility Checks](https://developer.android.com/training/testing/espresso/accessibility-checking) | Android | `AccessibilityChecks.enable()` in Espresso test setup |
| [XCTest Accessibility Audit](https://developer.apple.com/documentation/xctest/xcuiapplication/4191487-performaccessibilityaudit) | iOS | `app.performAccessibilityAudit()` in XCUITest |
| [Accessibility Insights for Windows](https://accessibilityinsights.io/docs/windows/overview/) | Windows | Manual audit with automated element checks |

### 8.2 Manual Testing Cadence

| Frequency | Activity |
|-----------|----------|
| Every PR (UI changes) | Automated axe-core scan (web), basic screen reader check |
| Weekly | Full TalkBack + VoiceOver walkthrough of critical flows |
| Per release | Complete checklist audit across all platforms |
| Quarterly | External accessibility audit by specialist |

---

## 9. Audit Sign-Off

| Date | Auditor | Platforms Tested | Result | Issues Filed |
|------|---------|------------------|--------|-------------|
| _YYYY-MM-DD_ | _Name_ | _Android, iOS, Web, Windows_ | _Pass / Fail_ | _#N, #M_ |

**Sign-off criteria:** All items in this checklist must be verified. Any failing
item must have a tracking issue filed with the `accessibility` label before
the release proceeds.
