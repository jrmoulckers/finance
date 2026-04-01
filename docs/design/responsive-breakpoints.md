# Responsive Breakpoint System

> **Status:** Active  
> **Token package:** `@finance/design-tokens`  
> **Issue:** [#309](../../issues/309)

## Overview

The Finance responsive breakpoint system defines four layout tiers that adapt the UI to the user's viewport width. Breakpoints are encoded as **design tokens** (DTCG JSON) and generated into platform-specific constants by Style Dictionary.

## Breakpoint Definitions

| Tier | Name           | Range            | Min-width token                    | Max-width token                    | Rationale                                                                                                           |
| ---- | -------------- | ---------------- | ---------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1    | **Mobile**     | 0 – 639 px       | `breakpoint.mobile` (0 px)         | `breakpoint.mobileMax` (639 px)    | Single-column, touch-first layout. Covers phones in portrait and small landscape.                                   |
| 2    | **Tablet**     | 640 – 1 023 px   | `breakpoint.tablet` (640 px)       | `breakpoint.tabletMax` (1 023 px)  | Two-column capable. Sidebar navigation appears. 640 px aligns with Tailwind `sm` and common tablet portrait widths. |
| 3    | **Desktop**    | 1 024 – 1 439 px | `breakpoint.desktop` (1 024 px)    | `breakpoint.desktopMax` (1 439 px) | Full multi-column layout. Matches common laptop screens and iPad landscape.                                         |
| 4    | **Widescreen** | 1 440 px +       | `breakpoint.widescreen` (1 440 px) | —                                  | Extended layout with wider content area. 1 440 px covers most external monitors.                                    |

### Visual Diagram

```
 0 px          640 px         1024 px        1440 px
  │── mobile ──│── tablet ────│── desktop ───│── widescreen ──▶
  │  < 640     │  640–1023    │  1024–1439   │  ≥ 1440
  └────────────┴──────────────┴──────────────┴───────────────────
```

## Token Architecture

Breakpoints follow the standard three-tier model:

### Tier 1 — Primitive (`tokens/primitive/breakpoints.json`)

Raw threshold values using t-shirt size names. These are abstract and not tied to device semantics.

| Token path      | Value    | CSS variable      |
| --------------- | -------- | ----------------- |
| `breakpoint.sm` | 640 px   | `--breakpoint-sm` |
| `breakpoint.md` | 1 024 px | `--breakpoint-md` |
| `breakpoint.lg` | 1 440 px | `--breakpoint-lg` |

### Tier 2 — Semantic (`tokens/semantic/breakpoints.json`)

Device-oriented names that reference primitives. These are the tokens consumed by engineers.

| Token path              | References         | CSS variable               |
| ----------------------- | ------------------ | -------------------------- |
| `breakpoint.mobile`     | `0px` (literal)    | `--breakpoint-mobile`      |
| `breakpoint.mobileMax`  | `639px` (literal)  | `--breakpoint-mobile-max`  |
| `breakpoint.tablet`     | `{breakpoint.sm}`  | `--breakpoint-tablet`      |
| `breakpoint.tabletMax`  | `1023px` (literal) | `--breakpoint-tablet-max`  |
| `breakpoint.desktop`    | `{breakpoint.md}`  | `--breakpoint-desktop`     |
| `breakpoint.desktopMax` | `1439px` (literal) | `--breakpoint-desktop-max` |
| `breakpoint.widescreen` | `{breakpoint.lg}`  | `--breakpoint-widescreen`  |

### Tier 3 — Component

Breakpoints are layout-level tokens. Individual components should adapt via **container queries** rather than viewport breakpoints. No component-level breakpoint tokens are defined.

## Platform Usage

### Web (CSS)

> **⚠️ CSS custom properties (`var()`) cannot be used inside `@media` rules.**  
> Use the literal pixel values below. The custom properties are available for JavaScript access.

#### Mobile-first (recommended)

```css
/* Base styles target mobile */

@media (min-width: 640px) {
  /* Tablet and above */
}

@media (min-width: 1024px) {
  /* Desktop and above */
}

@media (min-width: 1440px) {
  /* Widescreen */
}
```

#### Range-scoped

```css
@media (max-width: 639px) {
  /* Mobile only */
}

@media (min-width: 640px) and (max-width: 1023px) {
  /* Tablet only */
}

@media (min-width: 1024px) and (max-width: 1439px) {
  /* Desktop only */
}
```

#### JavaScript access

```js
const tablet = getComputedStyle(document.documentElement)
  .getPropertyValue('--breakpoint-tablet')
  .trim(); // "640px"

const isTablet = window.matchMedia(`(min-width: ${tablet})`).matches;
```

#### Container queries

```css
.card-grid {
  container-type: inline-size;
}

@container (min-width: 640px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

### Android / Kotlin

Breakpoint constants are generated as a Kotlin object:

```kotlin
import com.finance.tokens.FinanceBreakpoints

// Jetpack Compose
BoxWithConstraints {
  when {
    maxWidth < FinanceBreakpoints.TABLET.dp -> MobileLayout()
    maxWidth < FinanceBreakpoints.DESKTOP.dp -> TabletLayout()
    maxWidth < FinanceBreakpoints.WIDESCREEN.dp -> DesktopLayout()
    else -> WidescreenLayout()
  }
}
```

Breakpoints also appear in `dimens.xml` for XML layout use:

```xml
<dimen name="breakpoint_sm">640px</dimen>
<dimen name="breakpoint_md">1024px</dimen>
<dimen name="breakpoint_lg">1440px</dimen>
```

### iOS / Swift

Breakpoint values are included in the generated `FinanceTokens.swift` enum:

```swift
// SwiftUI
GeometryReader { geo in
  if geo.size.width < CGFloat(FinanceTokens.breakpointSm) {
    MobileLayout()
  } else if geo.size.width < CGFloat(FinanceTokens.breakpointMd) {
    TabletLayout()
  } else {
    DesktopLayout()
  }
}
```

### Windows (XAML)

Use adaptive triggers with the breakpoint values:

```xml
<VisualStateManager.VisualStateGroups>
  <VisualStateGroup>
    <VisualState x:Name="Mobile">
      <VisualState.StateTriggers>
        <AdaptiveTrigger MinWindowWidth="0" />
      </VisualState.StateTriggers>
    </VisualState>
    <VisualState x:Name="Tablet">
      <VisualState.StateTriggers>
        <AdaptiveTrigger MinWindowWidth="640" />
      </VisualState.StateTriggers>
    </VisualState>
    <VisualState x:Name="Desktop">
      <VisualState.StateTriggers>
        <AdaptiveTrigger MinWindowWidth="1024" />
      </VisualState.StateTriggers>
    </VisualState>
    <VisualState x:Name="Widescreen">
      <VisualState.StateTriggers>
        <AdaptiveTrigger MinWindowWidth="1440" />
      </VisualState.StateTriggers>
    </VisualState>
  </VisualStateGroup>
</VisualStateManager.VisualStateGroups>
```

## Design Rationale

### Why these values?

| Threshold    | Justification                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **640 px**   | Aligns with Tailwind CSS `sm`, covers iPad Mini portrait (768 px with padding), and creates a comfortable two-column minimum. Divisible by 8 (grid alignment). |
| **1 024 px** | Standard laptop width threshold. Matches iPad landscape. Widely used across design systems (Material, Fluent).                                                 |
| **1 440 px** | Common external monitor starting width. Provides room for three-column financial dashboards and side-by-side chart comparisons.                                |

### Mobile-first approach

All base styles target mobile. Wider layouts are additive via `min-width` media queries. This ensures:

- The smallest screen always works
- Styles are progressively enhanced
- Less CSS specificity complexity

### Why not use `em` units?

Pixel values ensure predictable, device-independent breakpoints. Using `em` can cause inconsistencies when the user changes their base font size, which would shift layout breakpoints unexpectedly. Financial data tables and dashboards need stable, predictable column counts.

## Existing Usage Migration

The existing `responsive.css` uses hardcoded breakpoints at `640px`, `768px`, `1024px`, and `1200px`. These should be progressively aligned to the token-defined values:

| Current  | Token equivalent      | Migration note                                                            |
| -------- | --------------------- | ------------------------------------------------------------------------- |
| `640px`  | `640px` (tablet)      | ✅ Already aligned                                                        |
| `768px`  | `640px` (tablet)      | ⚠️ Consider migrating to 640px — the sidebar appearance can shift earlier |
| `1024px` | `1024px` (desktop)    | ✅ Already aligned                                                        |
| `1200px` | `1440px` (widescreen) | ⚠️ Consider whether the sidebar width expansion should move to 1440px     |

> **Note:** Migration of existing breakpoints is out of scope for #309. Track in a follow-up issue.

## Build Outputs

Running `npm run build` in `packages/design-tokens/` produces:

| Platform   | File                                 | Breakpoint format                        |
| ---------- | ------------------------------------ | ---------------------------------------- |
| Web        | `build/web/tokens.css`               | CSS custom properties (`:root`)          |
| Web (dark) | `build/web/tokens-dark.css`          | Same properties in `[data-theme="dark"]` |
| iOS        | `build/ios/FinanceTokens.swift`      | Swift enum constants                     |
| Android    | `build/android/dimens.xml`           | Android dimension resources              |
| Kotlin     | `build/kotlin/FinanceBreakpoints.kt` | Kotlin object with `Int` constants       |
