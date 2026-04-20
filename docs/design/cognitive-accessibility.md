# Cognitive Accessibility Mode — Finance

> **Status:** PROPOSED — Pending human review
> **Issue:** #317
> **Priority:** P2
> **Last Updated:** 2025-07-15
> **WCAG Target:** 2.2 Level AA (AAA for target sizing)
> **Platforms:** Web (React/PWA) · iOS (SwiftUI) · Android (Compose) · Windows (WinUI/XAML)
> **Token files:** `tokens/primitive/cognitive.json` · `tokens/semantic/cognitive.json` · `tokens/component/cognitive.json`

---

## Table of Contents

1. [Overview](#overview)
2. [Target Users](#target-users)
3. [Activation](#activation)
4. [Design Token Architecture](#design-token-architecture)
5. [Typography Changes](#typography-changes)
6. [Spacing & Layout Changes](#spacing--layout-changes)
7. [Touch Target Requirements](#touch-target-requirements)
8. [Animation & Motion](#animation--motion)
9. [Visual Simplification](#visual-simplification)
10. [Focus Indicators](#focus-indicators)
11. [Content Guidelines](#content-guidelines)
12. [High-Contrast Compound State](#high-contrast-compound-state)
13. [Platform Implementation Notes](#platform-implementation-notes)
14. [Web CSS Reference](#web-css-reference)
15. [Testing Checklist](#testing-checklist)
16. [References & Standards](#references--standards)

---

## Overview

Cognitive accessibility mode is an opt-in UI mode that simplifies the Finance app experience for users with cognitive disabilities. It reduces visual complexity, increases touch targets, uses larger text, disables animations, and presents fewer options at once.

This mode is designed to work **alongside** the existing experience level system (Getting Started, Comfortable, Advanced) — it is an independent accessibility toggle that can be combined with any experience level.

### Core Principles

1. **Reduce cognitive load** — fewer choices, simpler layouts, less visual noise
2. **Increase readability** — larger text, relaxed line heights, better spacing
3. **Enlarge touch targets** — minimum 48×48px on all interactive elements
4. **Disable all motion** — no animations, no transitions, no auto-scrolling
5. **Enhance boundaries** — thicker borders, clearer element definitions
6. **Maintain functionality** — every feature remains accessible, just simplified

---

## Target Users

Cognitive accessibility mode serves users with:

- **ADHD** — reduced visual noise, fewer simultaneous options, consistent layouts
- **Autism spectrum** — predictable patterns, reduced sensory stimulation, clear boundaries
- **Traumatic brain injury (TBI)** — larger text, simpler layouts, no time pressure
- **Learning disabilities (dyslexia, dyscalculia)** — readable fonts, generous spacing, clear number formatting
- **Age-related cognitive decline** — larger targets, simpler navigation, clearer focus indicators
- **Temporary cognitive impairment** — fatigue, medication effects, stress

This mode corresponds to **Persona 4: Casey** (see [personas.md](personas.md)), the ADHD graduate student who needs "a financial app that works with my brain, not against it."

---

## Activation

### User-Facing Setting

Cognitive mode is a toggle in **Settings → Accessibility → Cognitive Mode**.

When enabled:

- The app sets `data-a11y-cognitive="true"` on the root element
- The preference is persisted to local storage / user settings
- The setting syncs across devices via the user's profile

### Platform Implementation

| Platform | Root Attribute / Mechanism                   | Persistence                        |
| -------- | -------------------------------------------- | ---------------------------------- |
| Web      | `<html data-a11y-cognitive="true">`          | `localStorage` + user profile sync |
| iOS      | `UserDefaults.cognitiveAccessibilityEnabled` | App-level setting                  |
| Android  | `SharedPreferences.cognitiveAccessibility`   | App-level setting                  |
| Windows  | `ApplicationData.cognitiveAccessibility`     | App-level setting                  |

### Relationship to Other Modes

Cognitive mode is **orthogonal** to:

- **Theme** (light / dark / dark-oled) — cognitive mode works with any theme
- **Experience level** (Getting Started / Comfortable / Advanced) — cognitive mode stacks on top
- **System preferences** (`prefers-reduced-motion`, `prefers-contrast`) — cognitive mode is a superset

```
┌────────────────────────────────────────────────────────────┐
│                       Theme Layer                          │
│  (light / dark / dark-oled)                                │
├────────────────────────────────────────────────────────────┤
│                   Experience Level                          │
│  (Getting Started / Comfortable / Advanced)                │
├────────────────────────────────────────────────────────────┤
│              Cognitive Accessibility Mode                   │
│  (Overrides typography, spacing, motion, targets)          │
├────────────────────────────────────────────────────────────┤
│              System Preferences                             │
│  (prefers-reduced-motion, prefers-contrast, forced-colors) │
└────────────────────────────────────────────────────────────┘
```

---

## Design Token Architecture

Cognitive accessibility tokens follow the standard three-tier structure:

### Primitive Layer

**File:** `packages/design-tokens/tokens/primitive/cognitive.json`

| Token                          | Value  | Description                                               |
| ------------------------------ | ------ | --------------------------------------------------------- |
| `cognitive.touchTargetMin`     | `48px` | Minimum interactive target size (WCAG 2.2 SC 2.5.5)       |
| `cognitive.focusRingWidth`     | `3px`  | Enhanced focus ring width                                 |
| `cognitive.focusRingOffset`    | `3px`  | Enhanced focus ring offset                                |
| `cognitive.borderWidth`        | `2px`  | Enhanced border width for element definition              |
| `cognitive.maxChoicesPerGroup` | `5`    | Max options in a single group (Miller's Law conservative) |

### Semantic Layer

**File:** `packages/design-tokens/tokens/semantic/cognitive.json`

#### Type Scale (cognitiveTypeScale)

| Role     | Default     | Cognitive   | Change                                    |
| -------- | ----------- | ----------- | ----------------------------------------- |
| display  | 48px / 1.25 | 36px / 1.5  | Size ↓, line-height ↑ (less overwhelming) |
| headline | 30px / 1.25 | 24px / 1.5  | Size ↓, line-height ↑                     |
| title    | 20px / 1.5  | 20px / 1.75 | Line-height ↑                             |
| body     | 16px / 1.5  | 18px / 1.75 | Size ↑, line-height ↑                     |
| label    | 14px / 1.5  | 16px / 1.75 | Size ↑, line-height ↑                     |
| caption  | 12px / 1.5  | 14px / 1.75 | Size ↑, line-height ↑                     |

**Design rationale:** Display and headline sizes are _reduced_ because in cognitive mode, the goal is to minimize visual hierarchy extremes — very large display text can feel overwhelming. Body, label, and caption text are _increased_ because readability of content text matters more than dramatic headlines.

#### Spacing (cognitiveSpacing)

| Token           | Value | Purpose                               |
| --------------- | ----- | ------------------------------------- |
| `sectionGap`    | 32px  | Gap between major page sections       |
| `cardGap`       | 24px  | Gap between cards in a list/grid      |
| `elementGap`    | 16px  | Gap between elements within a section |
| `inlinePadding` | 24px  | Horizontal padding inside containers  |
| `blockPadding`  | 20px  | Vertical padding inside containers    |

#### Elevation (cognitiveElevation)

| Level  | Default   | Cognitive | Change    |
| ------ | --------- | --------- | --------- |
| none   | none      | none      | —         |
| low    | shadow-sm | shadow-sm | Same      |
| medium | shadow-md | shadow-sm | Flattened |
| high   | shadow-lg | shadow-md | Flattened |

### Component Layer

**File:** `packages/design-tokens/tokens/component/cognitive.json`

#### Button (cognitiveButton)

| Property              | Default | Cognitive | Change           |
| --------------------- | ------- | --------- | ---------------- |
| paddingX              | 16px    | 24px      | +50%             |
| paddingY              | 8px     | 12px      | +50%             |
| borderRadius          | 8px     | 12px      | Softer           |
| minHeight             | —       | 48px      | New (enforced)   |
| secondary borderWidth | 1px     | 2px       | Clearer boundary |

#### Card (cognitiveCard)

| Property      | Default | Cognitive | Change              |
| ------------- | ------- | --------- | ------------------- |
| padding       | 16px    | 24px      | +50%                |
| borderRadius  | 12px    | 16px      | Softer              |
| borderWidth   | 1px     | 2px       | Clearer boundary    |
| gap (content) | ~8px    | 16px      | More breathing room |

#### Input (cognitiveInput)

| Property     | Default | Cognitive | Change           |
| ------------ | ------- | --------- | ---------------- |
| paddingX     | 12px    | 16px      | +33%             |
| paddingY     | 8px     | 12px      | +50%             |
| borderRadius | 8px     | 12px      | Softer           |
| borderWidth  | 1px     | 2px       | Clearer boundary |
| minHeight    | —       | 48px      | New (enforced)   |

#### Navigation (cognitiveNavigation)

| Property      | Value | Purpose                  |
| ------------- | ----- | ------------------------ |
| itemMinHeight | 48px  | Touch target enforcement |
| itemPaddingX  | 20px  | Adequate tap area        |
| itemPaddingY  | 12px  | Adequate tap area        |
| itemGap       | 8px   | Prevents mis-taps        |

---

## Touch Target Requirements

All interactive elements MUST meet the 48×48px minimum target size in cognitive mode:

| Element Type             | Minimum Size                     | Notes                                       |
| ------------------------ | -------------------------------- | ------------------------------------------- |
| Buttons                  | 48×48px                          | Padding ensures this even with short labels |
| Links                    | 48px height                      | Width determined by content                 |
| Text inputs              | 48px height                      | Width is typically full-width               |
| Checkboxes               | 24×24px visual, 48×48px tap area | Padding/margin extends hit area             |
| Radio buttons            | 24×24px visual, 48×48px tap area | Same as checkboxes                          |
| Navigation items         | 48px height, 48px min-width      | Both dimensions enforced                    |
| List items (interactive) | 48px height                      | Applies to clickable/tappable lists         |
| Tab items                | 48×48px                          | Both dimensions enforced                    |

### DO ✅

- Use `min-height` and `min-width` to enforce targets
- Add padding to extend small visual elements
- Add spacing between adjacent interactive elements to prevent mis-taps

### DON'T ❌

- Don't reduce touch targets below 48px for any reason
- Don't place interactive elements immediately adjacent without spacing
- Don't rely on overlapping tap areas

---

## Animation & Motion

### Cognitive Mode (Explicit Opt-in)

When cognitive mode is active, **ALL** animations and transitions are disabled:

```css
[data-a11y-cognitive='true'] *,
[data-a11y-cognitive='true'] *::before,
[data-a11y-cognitive='true'] *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}
```

This is a **superset** of `prefers-reduced-motion: reduce`. The cognitive mode toggle takes priority over system preferences because it represents an explicit user decision.

### System prefers-reduced-motion (Implicit)

When the system preference is set but cognitive mode is not:

- Transform-based animations replaced with simple opacity fades
- Continuous animations (spin, pulse, shimmer) stopped
- Celebration animations show final state instantly
- Transition utilities reduce to near-instant

Both sets of rules are defined in `apps/web/src/styles/cognitive.css` and `apps/web/src/styles/animations.css`.

---

## Visual Simplification

| Aspect              | Default                 | Cognitive Mode                   |
| ------------------- | ----------------------- | -------------------------------- |
| Card hover lift     | `translateY(-2px)`      | Disabled                         |
| Button active scale | `scale(0.97)`           | Disabled                         |
| Focus glow (inputs) | `box-shadow: 0 0 0 3px` | Removed — outline only           |
| Elevation levels    | 4 tiers                 | 3 tiers (medium → sm, high → md) |
| Border width        | 1px                     | 2px on interactive elements      |
| Decorative shadows  | Present                 | Simplified                       |

---

## Focus Indicators

| Property       | Default                   | Cognitive Mode                        |
| -------------- | ------------------------- | ------------------------------------- |
| Outline width  | 2px                       | 3px                                   |
| Outline offset | 2px                       | 3px                                   |
| Outline style  | solid                     | solid                                 |
| Outline color  | `--semantic-border-focus` | `--semantic-border-focus` (unchanged) |

In high-contrast compound state (`prefers-contrast: more` + cognitive mode), the outline becomes even more prominent through the forced border color adjustments.

In Windows forced-colors mode (`forced-colors: active`), the outline uses system `LinkText` color to ensure visibility.

---

## Content Guidelines

When cognitive mode is active, platform engineers SHOULD follow these content rules:

### Language

| Instead of                | Use                           |
| ------------------------- | ----------------------------- |
| "Reconcile your accounts" | "Check your account balances" |
| "Amortization schedule"   | "Payment plan over time"      |
| "Discretionary spending"  | "Spending you choose"         |
| "Year-over-year variance" | "Change from last year"       |
| "Allocate funds"          | "Move money"                  |
| "Insufficient funds"      | "Not enough money"            |

### Information Density

- Present a maximum of **5 options** per group or menu (`cognitive.maxChoicesPerGroup`)
- Use progressive disclosure: show summary first, details on tap/click
- Group related items with clear section headings
- One primary action per screen or card
- Avoid nested navigation deeper than 2 levels

### Number Formatting

- Use full currency symbols, not abbreviations ($, €, £ — not USD, EUR, GBP)
- Separate thousands with locale-appropriate separators
- Round to whole numbers by default, show decimals only for amounts under $10
- Prefix positive/negative indicators with text ("Income" / "Expense"), not just +/- signs

---

## Error Prevention & Recovery

Cognitive accessibility mode emphasizes **preventing** errors before they occur and making **recovery** simple and non-stressful when errors do happen. These patterns follow WCAG 2.2 SC 3.3 (Input Assistance) and the COGA guidance on error prevention.

### Error Prevention Patterns

#### 1. Confirmation Before Destructive Actions

All destructive actions require explicit confirmation with clear language:

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  Delete this account?                            │
│                                                  │
│  This will permanently remove "Chase Checking"   │
│  and all 47 transactions inside it.              │
│                                                  │
│  This cannot be undone.                          │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │       [ Cancel — Keep Account ]          │    │
│  └──────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────┐    │
│  │       [ Delete Account ]                 │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Rules:**

- Safe action (Cancel) appears first and uses `button.primary`
- Destructive action appears second and uses `button.destructive`
- Both buttons are full-width in cognitive mode (no side-by-side confusion)
- Description includes **specific** impact ("47 transactions") — not vague warnings
- In cognitive mode, add 2-second delay before destructive button becomes active

#### 2. Input Validation: Inline, Real-Time, Non-Blocking

- Validate input as the user types (after a 500ms debounce)
- Show validation messages inline below the field — never in modal dialogs
- Use `semantic.status.negative` for errors + ⚠ icon + text label
- Always explain **how to fix** the error, not just what's wrong

| Instead of            | Use                                         |
| --------------------- | ------------------------------------------- |
| "Invalid amount"      | "Enter a number, like 25.00"                |
| "Field required"      | "Please enter an account name"              |
| "Invalid date"        | "Enter a date like 01/15/2025"              |
| "Amount out of range" | "Amount must be between $0.01 and $999,999" |

#### 3. Smart Defaults

Pre-fill fields with sensible defaults to reduce decision fatigue:

- **Date:** Default to today
- **Currency:** Default to user's locale currency
- **Category:** Suggest based on last used category for similar amounts
- **Account:** Default to most recently used account

#### 4. Undo Support

All non-destructive actions support undo:

```
┌──────────────────────────────────────────────────┐
│  ✓  Transaction deleted                          │
│                                                  │
│  [ Undo ]                    Disappears in 8s    │
└──────────────────────────────────────────────────┘
```

- Toast notification with undo action persists for **8 seconds** in cognitive mode (vs 5s default)
- Undo uses `button.secondary` styling
- Toast uses `role="status"` + `aria-live="polite"`

### Error Recovery Patterns

#### 1. Clear Error Messages

Every error message follows this structure:

```
[Icon] What happened + How to fix it
```

| Error Type    | Message Pattern                                                | Icon |
| ------------- | -------------------------------------------------------------- | ---- |
| Network       | "We couldn't save. Check your connection and tap Retry."       | ⚠    |
| Validation    | "Enter a number, like 25.00"                                   | ⓘ    |
| Sync conflict | "This was changed on another device. Keep this version?"       | ⟳    |
| Permission    | "Finance needs camera access to scan receipts. Open Settings?" | 📷   |
| Server        | "Something went wrong on our end. Try again in a moment."      | ⚠    |

#### 2. Recovery Actions

- Always provide a **clear next step** (Retry, Go Back, Open Settings)
- Never show technical error details to users
- Persist the user's input — never clear form fields on error
- In cognitive mode, limit recovery options to **2 maximum** (primary + dismiss)

#### 3. Graceful Offline Behavior

- Queue operations when offline — sync when connection returns
- Show `role="status"` banner: "You're offline. Changes will save when you reconnect."
- Never show error dialogs for expected offline scenarios

---

## Plain Language Guidelines

All UI text in Finance follows plain language principles. In cognitive mode, these guidelines are **strictly enforced** — no financial jargon without explanation.

### Readability Targets

| Context        | Standard Mode         | Cognitive Mode        |
| -------------- | --------------------- | --------------------- |
| Feature names  | Grade 8 reading level | Grade 6 reading level |
| Descriptions   | Grade 8 reading level | Grade 5 reading level |
| Error messages | Grade 6 reading level | Grade 4 reading level |
| Button labels  | 1-3 words             | 1-3 words             |
| Tooltip text   | 1-2 sentences         | 1 sentence max        |

### Financial Terminology Dictionary

When cognitive mode is active, all financial terms are replaced with plain language equivalents. If a financial term must appear (e.g., on bank statements), it is accompanied by a parenthetical explanation.

| Financial Term             | Cognitive Mode Equivalent                      | Context Tip           |
| -------------------------- | ---------------------------------------------- | --------------------- |
| Net worth                  | Total money (what you have minus what you owe) | Shown on dashboard    |
| Budget allocation          | How you plan to spend                          | Budget setup          |
| Transaction                | Purchase or payment                            | Transaction list      |
| Reconciliation             | Checking that your numbers match               | Account management    |
| Amortization               | Payment plan over time                         | Loan accounts         |
| Discretionary spending     | Spending you choose                            | Budget categories     |
| Fixed expenses             | Bills you pay every month                      | Budget categories     |
| Variable expenses          | Spending that changes                          | Budget categories     |
| Liability                  | Money you owe                                  | Account types         |
| Asset                      | Money you have                                 | Account types         |
| Interest rate              | How much extra you pay (or earn) on money      | Loan/savings accounts |
| Principal                  | The original amount borrowed                   | Loan accounts         |
| Compound interest          | Interest on interest (it adds up!)             | Savings/education     |
| ROI (Return on Investment) | How much money you made back                   | Investment accounts   |
| Depreciation               | How much value something loses over time       | Assets                |
| Cashflow                   | Money coming in and going out                  | Reports               |

### Contextual Education

In cognitive mode, every financial term that appears in the UI includes a tap-to-learn interaction:

```
┌──────────────────────────────────────────────────┐
│  Your net worth ⓘ                                │
│  $12,450                                         │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Net worth = what you have − what you owe  │  │
│  │  Right now, that's $12,450.                │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

- ⓘ icon is always a minimum 48×48px tap target in cognitive mode
- Education tooltip uses `typeScale.body` (not caption)
- Dismiss on tap outside or pressing Escape
- `aria-label="Learn about net worth"` on the info icon

### Sentence Structure Rules

1. **Active voice**: "You spent $450 on food" — not "Food expenses totalled $450"
2. **Short sentences**: Maximum 15 words per sentence in cognitive mode
3. **One idea per sentence**: Break complex concepts into multiple sentences
4. **Positive framing**: "You have $200 left" — not "You've spent $800 of $1,000"
5. **Concrete language**: Use specific amounts and dates — not "recently" or "approximately"

---

## Consistent Navigation Patterns

Cognitive mode enforces predictable, consistent navigation patterns across all screens.

### Navigation Structure

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  [Content Area]                          │    │
│  │                                          │    │
│  │  • Page content is always in the same    │    │
│  │    position relative to navigation       │    │
│  │  • Back button always top-left           │    │
│  │  • Primary action always bottom or       │    │
│  │    top-right                             │    │
│  │                                          │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐         │
│  │ Home │  │ Txns │  │Budget│  │ More │         │
│  └──────┘  └──────┘  └──────┘  └──────┘         │
│  (Bottom tab bar — always visible)               │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Navigation Rules

| Rule                       | Standard Mode | Cognitive Mode           |
| -------------------------- | ------------- | ------------------------ |
| Maximum navigation depth   | 4 levels      | 2 levels                 |
| Bottom tab bar visible     | Always        | Always (never hides)     |
| Back button position       | Top-left      | Top-left (always)        |
| Page transitions           | Animated      | Instant (no animation)   |
| Tab bar items              | 5 max         | 4 max                    |
| "More" overflow menu       | Optional      | Required (keep tabs ≤ 4) |
| Breadcrumb trail           | Optional      | Required on level 2+     |
| Current location indicator | Subtle        | Bold + high contrast     |

### Consistent Action Placement

Every screen follows the same action placement pattern:

| Action Type         | Position           | Cognitive Mode             |
| ------------------- | ------------------ | -------------------------- |
| Back / Cancel       | Top-left           | Top-left, always visible   |
| Primary action      | Bottom / top-right | Full-width bottom button   |
| Secondary actions   | Below primary      | Clearly separated, labeled |
| Destructive actions | Bottom of screen   | Separated by divider line  |

### Page Layout Consistency

Every screen follows this content order in cognitive mode:

1. **Title** — what page am I on?
2. **Summary** — key information at a glance
3. **Content** — details, lists, or forms
4. **Actions** — what can I do here?

No screen deviates from this order. Users can predict where to look for information on every screen.

### Wayfinding

- Current tab is highlighted with `semantic.interactive.default` color + text label (not just an icon)
- Breadcrumb shows path: `Home > Budget > Food Budget`
- Screen titles use `typeScale.headline` in cognitive mode (larger, more prominent)
- "Where am I?" is answerable within 1 second on any screen

---

## Information Hierarchy

Cognitive mode enforces a clear, predictable information hierarchy on every screen.

### Hierarchy Rules

1. **One hero number per screen** — the most important metric is displayed prominently
2. **Group related items** — max 5 items per visible group
3. **Progressive disclosure** — summary → details → advanced (3 levels max)
4. **Visual weight** — hierarchy communicated through size and weight, not color alone

### Dashboard Example (Cognitive Mode)

```
┌──────────────────────────────────────────────────┐
│  Good morning, Alex                              │  ← typeScale.title
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │                                          │    │  ← Hero card
│  │     You have $2,450 to spend             │    │  ← typeScale.headline
│  │     this month                           │    │
│  │                                          │    │
│  │     ████████████████░░░░░  75%            │    │  ← Progress bar
│  │     $1,850 spent of $2,450               │    │  ← typeScale.body
│  │                                          │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  Recent purchases                                │  ← typeScale.title
│  ─────────────────                               │
│  ┌──────────────────────────────────────────┐    │
│  │  Coffee Shop      −$4.50      Today      │    │
│  │  Grocery Store     −$67.23     Today      │    │
│  │  Electric Bill     −$125.00    Yesterday  │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  [ See all purchases → ]                         │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Visual Weight Scale (Cognitive Mode)

| Level   | Type Scale | Weight   | Usage                         |
| ------- | ---------- | -------- | ----------------------------- |
| Hero    | headline   | bold     | Primary metric (1 per screen) |
| Section | title      | semibold | Section headings              |
| Content | body       | regular  | Body text, descriptions       |
| Detail  | label      | medium   | Labels, metadata              |
| Fine    | caption    | regular  | Timestamps, secondary info    |

---

## High-Contrast Compound State

When both cognitive mode and system high contrast are active:

### Light Theme + High Contrast + Cognitive

- Borders: `neutral-900` (black)
- Input borders: 2px solid
- Focus: 3px solid outline
- Font weight regular bumped to 500

### Dark Theme + High Contrast + Cognitive

- Borders: `neutral-200` (light)
- All border enhancements from cognitive mode apply
- Focus ring uses `blue-200` for visibility against dark backgrounds

### Forced Colors (Windows High Contrast)

- Focus outline: 3px solid `LinkText` (system color)
- Borders: 2px solid `ButtonText` (system color)
- Layout and spacing tokens still apply (they are not color properties)

---

## Platform Implementation Notes

### Web (React / PWA)

**Implementation file:** `apps/web/src/styles/cognitive.css`

- Toggle sets `data-a11y-cognitive="true"` on `<html>`
- CSS custom property overrides cascade from the attribute selector
- Imported in `apps/web/src/theme/tokens.css` after theme CSS files
- Works with all themes (light, dark, dark-oled)
- Works with `prefers-reduced-motion` and `prefers-contrast` media queries

### iOS (SwiftUI)

- Read `UserDefaults.cognitiveAccessibilityEnabled`
- Apply cognitive type scale via `dynamicTypeSize` environment modifier
- Set minimum frame sizes: `.frame(minWidth: 48, minHeight: 48)`
- Disable `withAnimation {}` blocks when cognitive mode is active
- Use `.accessibilityElement(children: .combine)` for grouped content
- Map `cognitiveButton` / `cognitiveCard` / `cognitiveInput` tokens to SwiftUI view modifiers

### Android (Compose / Material 3)

- Read `SharedPreferences.cognitiveAccessibility`
- Apply cognitive type scale via custom `Typography` object
- Set `Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)`
- Disable `AnimatedVisibility` / `animateContentSize` when cognitive mode is active
- Map `cognitiveButton` / `cognitiveCard` / `cognitiveInput` tokens to Material 3 theme overrides

### Windows (WinUI / XAML)

- Read `ApplicationData.cognitiveAccessibility`
- Apply cognitive tokens via XAML resource dictionary overrides
- Set `MinHeight="48"` / `MinWidth="48"` on interactive controls
- Disable `Storyboard` animations when cognitive mode is active
- Respect `forced-colors` / Windows High Contrast themes
- Map tokens to Fluent Design system overrides

---

## Web CSS Reference

### CSS Custom Properties Overridden

```
--type-scale-display-font-size    36px (was 48px)
--type-scale-display-line-height  1.5  (was 1.25)
--type-scale-headline-font-size   24px (was 30px)
--type-scale-headline-line-height 1.5  (was 1.25)
--type-scale-title-line-height    1.75 (was 1.5)
--type-scale-body-font-size       18px (was 16px)
--type-scale-body-line-height     1.75 (was 1.5)
--type-scale-label-font-size      16px (was 14px)
--type-scale-label-line-height    1.75 (was 1.5)
--type-scale-caption-font-size    14px (was 12px)
--type-scale-caption-line-height  1.75 (was 1.5)
--card-padding                    24px (was 16px)
--card-border-radius              16px (was 12px)
--button-*-padding-x              24px (was 16px)
--button-*-padding-y              12px (was 8px)
--button-*-border-radius          12px (was 8px)
--input-padding-x                 16px (was 12px)
--input-padding-y                 12px (was 8px)
--input-border-radius             12px (was 8px)
--elevation-medium                shadow-sm (was shadow-md)
--elevation-high                  shadow-md (was shadow-lg)
```

### Files Created / Modified

| File                                                     | Status   | Description                                 |
| -------------------------------------------------------- | -------- | ------------------------------------------- |
| `packages/design-tokens/tokens/primitive/cognitive.json` | New      | Primitive cognitive token values            |
| `packages/design-tokens/tokens/semantic/cognitive.json`  | New      | Semantic cognitive token mappings           |
| `packages/design-tokens/tokens/component/cognitive.json` | New      | Component-level cognitive overrides         |
| `apps/web/src/styles/cognitive.css`                      | New      | Web CSS custom properties & rules           |
| `apps/web/src/theme/tokens.css`                          | Modified | Import cognitive CSS, enhance high-contrast |
| `docs/design/cognitive-accessibility.md`                 | New      | This specification document                 |

---

## Testing Checklist

### Functional Tests

- [ ] Toggle cognitive mode on/off in Settings → Accessibility
- [ ] Verify `data-a11y-cognitive="true"` is set/removed on `<html>`
- [ ] Verify preference persists across page reloads
- [ ] Verify preference syncs across devices (when sync is enabled)

### Typography Tests

- [ ] Body text renders at 18px with 1.75 line-height
- [ ] Caption text renders at 14px (never smaller)
- [ ] All text remains readable when zoomed to 200%
- [ ] Type scale changes apply in both light and dark themes

### Touch Target Tests

- [ ] All buttons meet 48×48px minimum
- [ ] All inputs meet 48px minimum height
- [ ] All navigation items meet 48×48px minimum
- [ ] All list items meet 48px minimum height
- [ ] Checkboxes and radios have adequate tap area (48×48px total)

### Animation Tests

- [ ] No animations play when cognitive mode is active
- [ ] No transitions occur when cognitive mode is active
- [ ] Scroll behavior is instant (no smooth scrolling)
- [ ] Hover lift effects on cards are disabled
- [ ] Button press scale effects are disabled

### Spacing Tests

- [ ] Card padding increased to 24px
- [ ] Button padding increased (24px horizontal, 12px vertical)
- [ ] Input padding increased (16px horizontal, 12px vertical)
- [ ] Adequate spacing between adjacent interactive elements

### Focus Tests

- [ ] Focus ring is 3px wide with 3px offset
- [ ] Focus ring is visible on all interactive elements
- [ ] Tab order is logical and predictable
- [ ] Focus ring visible in high-contrast mode
- [ ] Focus ring visible in forced-colors mode (Windows)

### Compound State Tests

- [ ] Cognitive + light theme
- [ ] Cognitive + dark theme
- [ ] Cognitive + dark-oled theme
- [ ] Cognitive + prefers-reduced-motion
- [ ] Cognitive + prefers-contrast: more
- [ ] Cognitive + forced-colors: active (Windows)
- [ ] Cognitive + Getting Started experience level
- [ ] Cognitive + Advanced experience level

### Cross-Browser Tests

- [ ] Chrome / Edge (Chromium)
- [ ] Firefox
- [ ] Safari
- [ ] Mobile Safari (iOS)
- [ ] Chrome (Android)

---

## References & Standards

- [WCAG 2.2 SC 1.4.12 Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)
- [WCAG 2.2 SC 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
- [WCAG 2.2 SC 2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)
- [WCAG 2.2 SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [Cognitive Accessibility Guidance (COGA)](https://www.w3.org/TR/coga-usable/)
- [Making Content Usable for People with Cognitive and Learning Disabilities](https://www.w3.org/TR/coga-usable/)
- [Material 3 Accessibility — Touch Targets](https://m3.material.io/foundations/accessible-design/accessibility-basics)
- [Apple HIG — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Finance UX Principles — Principle 4: Accessibility as Foundation](ux-principles.md)
- [Finance Personas — Casey (Persona 4)](personas.md)
- [Finance Accessibility Patterns Library](accessibility-patterns.md)
