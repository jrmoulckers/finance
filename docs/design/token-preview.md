# Design Token Preview & Reference

> **Package:** `@finance/design-tokens`
> **Spec:** [DTCG Community Group Format](https://design-tokens.github.io/community-group/format/)
> **Build:** Style Dictionary 5.x
> **Last Updated:** 2025-07-15

This document serves as the visual reference and inventory for all design tokens in the Finance app. Platform engineers use this to understand available tokens, their resolved values, and how they map across themes.

---

## Table of Contents

1. [Token Architecture](#token-architecture)
2. [Color Primitives](#color-primitives)
3. [Semantic Colors by Theme](#semantic-colors-by-theme)
4. [Chart Colors (CVD-Safe)](#chart-colors-cvd-safe)
5. [Typography Scale](#typography-scale)
6. [Spacing Scale](#spacing-scale)
7. [Border Radius](#border-radius)
8. [Elevation / Shadows](#elevation--shadows)
9. [Motion / Animation](#motion--animation)
10. [Breakpoints](#breakpoints)
11. [Component Tokens](#component-tokens)
12. [Chart Component Tokens](#chart-component-tokens)
13. [Progress Component Tokens](#progress-component-tokens)
14. [Cognitive Accessibility Tokens](#cognitive-accessibility-tokens)
15. [Platform Output Map](#platform-output-map)
16. [Theme Matrix](#theme-matrix)

---

## Token Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        COMPONENT TOKENS                            │
│  button.primary.background  card.padding  chart.series.1           │
│  Consumed directly by platform UI code                             │
├─────────────────────────────────────────────────────────────────────┤
│                        SEMANTIC TOKENS                             │
│  semantic.interactive.default  elevation.low  typeScale.body.*     │
│  Purpose-driven, theme-switchable                                  │
├─────────────────────────────────────────────────────────────────────┤
│                        PRIMITIVE TOKENS                            │
│  color.blue.600  spacing.4  fontSize.base  shadow.sm               │
│  Raw values, never used directly in UI code                        │
└─────────────────────────────────────────────────────────────────────┘
```

**Rule:** UI code should reference component tokens first, then semantic tokens. Never reference primitives directly in UI code.

---

## Color Primitives

### Neutral Scale

| Token               | Hex       | Preview | Usage                     |
| ------------------- | --------- | ------- | ------------------------- |
| `color.neutral.0`   | `#FFFFFF` | ⬜      | White / light background  |
| `color.neutral.50`  | `#F9FAFB` | 🔲      | Subtle background         |
| `color.neutral.100` | `#F3F4F6` | 🔲      | Secondary background      |
| `color.neutral.200` | `#E5E7EB` | 🔲      | Borders (light)           |
| `color.neutral.300` | `#D1D5DB` | 🔲      | Disabled elements         |
| `color.neutral.400` | `#9CA3AF` | 🔲      | Placeholder text          |
| `color.neutral.500` | `#6B7280` | 🔲      | Secondary text (dark bg)  |
| `color.neutral.600` | `#4B5563` | 🔲      | Secondary text (light bg) |
| `color.neutral.700` | `#374151` | 🔲      | Borders (dark)            |
| `color.neutral.800` | `#1F2937` | ⬛      | Dark elevated surface     |
| `color.neutral.900` | `#111827` | ⬛      | Dark background           |
| `color.neutral.950` | `#030712` | ⬛      | Near-black                |

### Brand Blue Scale

| Token            | Hex       | Usage               |
| ---------------- | --------- | ------------------- |
| `color.blue.50`  | `#EFF6FF` | Blue tint           |
| `color.blue.100` | `#DBEAFE` | Light blue bg       |
| `color.blue.200` | `#BFDBFE` | Pressed (dark)      |
| `color.blue.300` | `#93C5FD` | Hover (dark)        |
| `color.blue.400` | `#60A5FA` | Interactive (dark)  |
| `color.blue.500` | `#3B82F6` | Focus ring          |
| `color.blue.600` | `#2563EB` | Interactive (light) |
| `color.blue.700` | `#1D4ED8` | Hover (light)       |
| `color.blue.800` | `#1E40AF` | Pressed (light)     |
| `color.blue.900` | `#1E3A8A` | Deep blue           |

### Status Colors

| Token             | Hex       | Semantic Purpose |
| ----------------- | --------- | ---------------- |
| `color.green.600` | `#16A34A` | Positive (light) |
| `color.green.700` | `#15803D` | Amount + (light) |
| `color.green.500` | `#22C55E` | Positive (dark)  |
| `color.amber.600` | `#D97706` | Warning (light)  |
| `color.amber.700` | `#B45309` | Warning (HC)     |
| `color.amber.500` | `#F59E0B` | Warning (dark)   |
| `color.red.600`   | `#DC2626` | Negative (light) |
| `color.red.700`   | `#B91C1C` | Amount − (light) |
| `color.red.500`   | `#EF4444` | Negative (dark)  |

---

## Semantic Colors by Theme

### Background Tokens

| Semantic Token                  | Light     | Dark      | OLED      | High Contrast |
| ------------------------------- | --------- | --------- | --------- | ------------- |
| `semantic.background.primary`   | `#FFFFFF` | `#030712` | `#000000` | `#FFFFFF`     |
| `semantic.background.secondary` | `#F9FAFB` | `#111827` | `#0A0A0A` | `#F3F4F6`     |
| `semantic.background.elevated`  | `#FFFFFF` | `#1F2937` | `#111111` | `#FFFFFF`     |

### Text Tokens

| Semantic Token            | Light     | Dark      | OLED      | High Contrast |
| ------------------------- | --------- | --------- | --------- | ------------- |
| `semantic.text.primary`   | `#111827` | `#F9FAFB` | `#F9FAFB` | `#030712`     |
| `semantic.text.secondary` | `#4B5563` | `#9CA3AF` | `#9CA3AF` | `#374151`     |
| `semantic.text.disabled`  | `#9CA3AF` | `#4B5563` | `#6B7280` | `#6B7280`     |
| `semantic.text.inverse`   | `#FFFFFF` | `#111827` | `#000000` | `#FFFFFF`     |

### Interactive Tokens

| Semantic Token                  | Light     | Dark      | OLED      | High Contrast |
| ------------------------------- | --------- | --------- | --------- | ------------- |
| `semantic.interactive.default`  | `#2563EB` | `#60A5FA` | `#60A5FA` | `#1E40AF`     |
| `semantic.interactive.hover`    | `#1D4ED8` | `#93C5FD` | `#93C5FD` | `#1E3A8A`     |
| `semantic.interactive.pressed`  | `#1E40AF` | `#BFDBFE` | `#BFDBFE` | `#111827`     |
| `semantic.interactive.disabled` | `#D1D5DB` | `#374151` | `#4B5563` | `#9CA3AF`     |

### Status Tokens

| Semantic Token             | Light     | Dark      | OLED      | High Contrast |
| -------------------------- | --------- | --------- | --------- | ------------- |
| `semantic.status.positive` | `#16A34A` | `#22C55E` | `#22C55E` | `#15803D`     |
| `semantic.status.negative` | `#DC2626` | `#EF4444` | `#EF4444` | `#B91C1C`     |
| `semantic.status.warning`  | `#D97706` | `#F59E0B` | `#F59E0B` | `#B45309`     |
| `semantic.status.info`     | `#2563EB` | `#60A5FA` | `#60A5FA` | `#1E40AF`     |

### Border Tokens

| Semantic Token            | Light     | Dark      | OLED      | High Contrast |
| ------------------------- | --------- | --------- | --------- | ------------- |
| `semantic.border.default` | `#E5E7EB` | `#374151` | `#6B7280` | `#111827`     |
| `semantic.border.focus`   | `#3B82F6` | `#60A5FA` | `#60A5FA` | `#1E40AF`     |
| `semantic.border.error`   | `#EF4444` | `#F87171` | `#F87171` | `#B91C1C`     |

---

## Chart Colors (CVD-Safe)

IBM Design Language CVD-safe palette. Safe for protanopia, deuteranopia, and tritanopia.

| Token           | Hex       | Name    | Light BG Contrast  | Dark BG Contrast |
| --------------- | --------- | ------- | ------------------ | ---------------- |
| `color.chart.1` | `#648FFF` | Blue    | 3.5:1 (UI ✅)      | 4.5:1 ✅         |
| `color.chart.2` | `#785EF0` | Purple  | 3.9:1 (UI ✅)      | 4.6:1 ✅         |
| `color.chart.3` | `#DC267F` | Magenta | 4.6:1 ✅           | 5.3:1 ✅         |
| `color.chart.4` | `#FE6100` | Orange  | 3.3:1 (UI ✅)      | 5.9:1 ✅         |
| `color.chart.5` | `#FFB000` | Gold    | 2.1:1 (pattern ✅) | 8.6:1 ✅         |
| `color.chart.6` | `#009E73` | Teal    | 3.1:1 (UI ✅)      | 5.0:1 ✅         |

> **Rule:** Colors below 4.5:1 for text MUST use the color only for filled regions (bars, slices) — NOT for standalone text labels. All meet 3:1 minimum for UI components (WCAG AA).

---

## Typography Scale

### Primitive Font Sizes

| Token           | Value  | CSS Variable       |
| --------------- | ------ | ------------------ |
| `fontSize.xs`   | `12px` | `--font-size-xs`   |
| `fontSize.sm`   | `14px` | `--font-size-sm`   |
| `fontSize.base` | `16px` | `--font-size-base` |
| `fontSize.lg`   | `18px` | `--font-size-lg`   |
| `fontSize.xl`   | `20px` | `--font-size-xl`   |
| `fontSize.2xl`  | `24px` | `--font-size-2xl`  |
| `fontSize.3xl`  | `30px` | `--font-size-3xl`  |
| `fontSize.4xl`  | `36px` | `--font-size-4xl`  |
| `fontSize.5xl`  | `48px` | `--font-size-5xl`  |

### Semantic Type Scale

| Role     | Size   | Weight   | Line Height | CSS Prefix                |
| -------- | ------ | -------- | ----------- | ------------------------- |
| Display  | `48px` | Bold     | 1.25        | `--type-scale-display-*`  |
| Headline | `30px` | Semibold | 1.25        | `--type-scale-headline-*` |
| Title    | `20px` | Semibold | 1.5         | `--type-scale-title-*`    |
| Body     | `16px` | Regular  | 1.5         | `--type-scale-body-*`     |
| Label    | `14px` | Medium   | 1.5         | `--type-scale-label-*`    |
| Caption  | `12px` | Regular  | 1.5         | `--type-scale-caption-*`  |

### Platform Type Mapping

| Semantic Role | Web CSS           | iOS Dynamic Type | Android M3      | Windows WinUI |
| ------------- | ----------------- | ---------------- | --------------- | ------------- |
| Display       | `font-size: 48px` | `.largeTitle`    | `displayLarge`  | `TitleLarge`  |
| Headline      | `font-size: 30px` | `.title1`        | `headlineLarge` | `Title`       |
| Title         | `font-size: 20px` | `.title3`        | `titleLarge`    | `Subtitle`    |
| Body          | `font-size: 16px` | `.body`          | `bodyLarge`     | `Body`        |
| Label         | `font-size: 14px` | `.subheadline`   | `labelLarge`    | `BodyStrong`  |
| Caption       | `font-size: 12px` | `.caption1`      | `bodySmall`     | `Caption`     |

---

## Spacing Scale

Based on a 4px base unit grid.

| Token        | Value  | CSS Variable   | Common Usage                    |
| ------------ | ------ | -------------- | ------------------------------- |
| `spacing.0`  | `0px`  | `--spacing-0`  | None                            |
| `spacing.1`  | `4px`  | `--spacing-1`  | Tight gaps, icon margins        |
| `spacing.2`  | `8px`  | `--spacing-2`  | Button padding-y, input padding |
| `spacing.3`  | `12px` | `--spacing-3`  | Input padding-x                 |
| `spacing.4`  | `16px` | `--spacing-4`  | Card padding, section gaps      |
| `spacing.5`  | `20px` | `--spacing-5`  | Generous padding                |
| `spacing.6`  | `24px` | `--spacing-6`  | Large gaps, cognitive mode      |
| `spacing.8`  | `32px` | `--spacing-8`  | Section separators              |
| `spacing.10` | `40px` | `--spacing-10` | Major section gaps              |
| `spacing.12` | `48px` | `--spacing-12` | Touch target minimum            |
| `spacing.16` | `64px` | `--spacing-16` | Page-level spacing              |
| `spacing.20` | `80px` | `--spacing-20` | Hero spacing                    |

---

## Border Radius

| Token               | Value    | CSS Variable           | Usage                  |
| ------------------- | -------- | ---------------------- | ---------------------- |
| `borderRadius.none` | `0px`    | `--border-radius-none` | Sharp corners          |
| `borderRadius.sm`   | `4px`    | `--border-radius-sm`   | Subtle rounding, bars  |
| `borderRadius.md`   | `8px`    | `--border-radius-md`   | Buttons, inputs        |
| `borderRadius.lg`   | `12px`   | `--border-radius-lg`   | Cards, containers      |
| `borderRadius.xl`   | `16px`   | `--border-radius-xl`   | Modals, large cards    |
| `borderRadius.full` | `9999px` | `--border-radius-full` | Pills, avatars, badges |

---

## Elevation / Shadows

| Semantic Token     | Resolves To   | CSS Variable         | Usage               |
| ------------------ | ------------- | -------------------- | ------------------- |
| `elevation.none`   | `shadow.none` | `--elevation-none`   | Flat elements       |
| `elevation.low`    | `shadow.sm`   | `--elevation-low`    | Cards, subtle lift  |
| `elevation.medium` | `shadow.md`   | `--elevation-medium` | Dropdowns, tooltips |
| `elevation.high`   | `shadow.lg`   | `--elevation-high`   | Modals, popovers    |

### Shadow Primitives

| Token       | Value                                |
| ----------- | ------------------------------------ |
| `shadow.sm` | `0px 1px 2px 0px rgba(0,0,0,0.05)`   |
| `shadow.md` | `0px 4px 6px -1px rgba(0,0,0,0.1)`   |
| `shadow.lg` | `0px 10px 15px -3px rgba(0,0,0,0.1)` |
| `shadow.xl` | `0px 20px 25px -5px rgba(0,0,0,0.1)` |

---

## Motion / Animation

### Primitive Durations

| Token              | Value   | Usage                           |
| ------------------ | ------- | ------------------------------- |
| `duration.instant` | `0ms`   | Micro-interactions (toggles)    |
| `duration.fast`    | `150ms` | Hover states, list items, fades |
| `duration.normal`  | `250ms` | Page transitions, reveals       |
| `duration.slow`    | `400ms` | Progress indicators             |
| `duration.slower`  | `800ms` | Celebrations, skeleton shimmer  |

### Primitive Easings

| Token               | Value                                     | Character                |
| ------------------- | ----------------------------------------- | ------------------------ |
| `easing.default`    | `cubic-bezier(0.4, 0, 0.2, 1)`            | Standard balanced        |
| `easing.standard`   | `cubic-bezier(0.2, 0, 0, 1)`              | M3 page transitions      |
| `easing.decelerate` | `cubic-bezier(0, 0, 0, 1)`                | Soft landing (entering)  |
| `easing.accelerate` | `cubic-bezier(0.3, 0, 1, 1)`              | Quick exit (dismissing)  |
| `easing.spring`     | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | Overshoot (celebrations) |

### Semantic Animation Presets

| Token                          | Duration | Easing     | Purpose                  |
| ------------------------------ | -------- | ---------- | ------------------------ |
| `animation.pageTransition.*`   | `250ms`  | standard   | Route changes            |
| `animation.listItem.*`         | `150ms`  | decelerate | Staggered list enters    |
| `animation.progress.*`         | `400ms`  | default    | Progress bars, charts    |
| `animation.celebrate.*`        | `800ms`  | spring     | Goal reached, milestones |
| `animation.fadeIn.*`           | `250ms`  | decelerate | Cards, tooltips          |
| `animation.fadeOut.*`          | `150ms`  | accelerate | Toast dismiss            |
| `animation.microInteraction.*` | `0ms`    | default    | Button press, toggle     |
| `animation.loading.*`          | `800ms`  | inOut      | Skeleton shimmer         |

> **Critical:** All animations MUST respect `prefers-reduced-motion: reduce`. When active, replace with instant state changes.

---

## Breakpoints

### Primitive

| Token           | Value    | CSS Variable      |
| --------------- | -------- | ----------------- |
| `breakpoint.sm` | `640px`  | `--breakpoint-sm` |
| `breakpoint.md` | `1024px` | `--breakpoint-md` |
| `breakpoint.lg` | `1440px` | `--breakpoint-lg` |

### Semantic Layout

| Token                   | Value    | Range       | Layout Type |
| ----------------------- | -------- | ----------- | ----------- |
| `breakpoint.mobile`     | `0px`    | 0–639px     | Mobile      |
| `breakpoint.tablet`     | `640px`  | 640–1023px  | Tablet      |
| `breakpoint.desktop`    | `1024px` | 1024–1439px | Desktop     |
| `breakpoint.widescreen` | `1440px` | 1440px+     | Widescreen  |

---

## Component Tokens

### Button

| Token                           | Primary     | Secondary   | Destructive |
| ------------------------------- | ----------- | ----------- | ----------- |
| `button.{variant}.background`   | interactive | transparent | negative    |
| `button.{variant}.text`         | inverse     | interactive | inverse     |
| `button.{variant}.borderRadius` | 8px         | 8px         | 8px         |
| `button.{variant}.paddingX`     | 16px        | 16px        | 16px        |
| `button.{variant}.paddingY`     | 8px         | 8px         | 8px         |

### Card

| Token               | Value          | CSS Variable           |
| ------------------- | -------------- | ---------------------- |
| `card.background`   | elevated bg    | `--card-background`    |
| `card.borderRadius` | 12px           | `--card-border-radius` |
| `card.padding`      | 16px           | `--card-padding`       |
| `card.shadow`       | elevation.low  | `--card-shadow`        |
| `card.border`       | border.default | `--card-border`        |

### Input

| Token                | Value          | CSS Variable            |
| -------------------- | -------------- | ----------------------- |
| `input.background`   | primary bg     | `--input-background`    |
| `input.border`       | border.default | `--input-border`        |
| `input.borderFocus`  | border.focus   | `--input-border-focus`  |
| `input.borderError`  | border.error   | `--input-border-error`  |
| `input.text`         | text.primary   | `--input-text`          |
| `input.placeholder`  | text.disabled  | `--input-placeholder`   |
| `input.borderRadius` | 8px            | `--input-border-radius` |
| `input.paddingX`     | 12px           | `--input-padding-x`     |
| `input.paddingY`     | 8px            | `--input-padding-y`     |

### Navigation

| Token                   | Value          | CSS Variable               |
| ----------------------- | -------------- | -------------------------- |
| `navigation.background` | elevated bg    | `--navigation-background`  |
| `navigation.text`       | text.secondary | `--navigation-text`        |
| `navigation.textActive` | interactive    | `--navigation-text-active` |
| `navigation.indicator`  | interactive    | `--navigation-indicator`   |
| `navigation.border`     | border.default | `--navigation-border`      |

---

## Chart Component Tokens

| Token                           | Value            | Usage                      |
| ------------------------------- | ---------------- | -------------------------- |
| `chart.container.background`    | primary bg       | Chart area background      |
| `chart.container.borderRadius`  | 12px             | Chart container rounding   |
| `chart.container.padding`       | 16px             | Internal chart padding     |
| `chart.container.defaultHeight` | 320px            | Default chart height       |
| `chart.axis.lineColor`          | border.default   | Axis line color            |
| `chart.axis.labelColor`         | text.secondary   | Axis label text            |
| `chart.tooltip.background`      | elevated bg      | Tooltip surface            |
| `chart.tooltip.shadow`          | elevation.medium | Tooltip elevation          |
| `chart.series.1` through `.6`   | CVD-safe palette | Data series colors         |
| `chart.series.overflow`         | neutral.400      | "Other" category color     |
| `chart.bar.borderRadius`        | 4px              | Bar top rounding           |
| `chart.donut.innerRadiusRatio`  | 0.6              | Donut hole size            |
| `chart.line.strokeWidth`        | 2px              | Line thickness             |
| `chart.line.dotRadius`          | 4px              | Data point dot size        |
| `chart.progressBar.height`      | 8px              | Budget progress bar height |

---

## Progress Component Tokens

| Token                       | Value           | Usage                      |
| --------------------------- | --------------- | -------------------------- |
| `progress.bar.track`        | secondary bg    | Unfilled track             |
| `progress.bar.fill`         | interactive     | Default fill color         |
| `progress.bar.height`       | 8px             | Standard height            |
| `progress.bar.heightLarge`  | 12px            | Goal card height           |
| `progress.bar.borderRadius` | full            | Rounded ends               |
| `progress.ring.strokeWidth` | 8px             | Ring thickness             |
| `progress.state.onTrack`    | status.positive | On track — with ✓ icon     |
| `progress.state.warning`    | status.warning  | Near limit — with ⚠ icon   |
| `progress.state.overBudget` | status.negative | Over budget — with ↑ icon  |
| `progress.state.complete`   | status.positive | Goal reached — with ★ icon |

---

## Cognitive Accessibility Tokens

When cognitive mode is active (`data-a11y-cognitive="true"`), these override default tokens:

### Typography Override

| Role     | Default     | Cognitive   |
| -------- | ----------- | ----------- |
| Display  | 48px / 1.25 | 36px / 1.5  |
| Headline | 30px / 1.25 | 24px / 1.5  |
| Title    | 20px / 1.5  | 20px / 1.75 |
| Body     | 16px / 1.5  | 18px / 1.75 |
| Label    | 14px / 1.5  | 16px / 1.75 |
| Caption  | 12px / 1.5  | 14px / 1.75 |

### Spacing Override

| Token                         | Default | Cognitive |
| ----------------------------- | ------- | --------- |
| `cognitiveSpacing.sectionGap` | 24px    | 32px      |
| `cognitiveSpacing.cardGap`    | 16px    | 24px      |
| `cognitiveSpacing.elementGap` | 8px     | 16px      |

### Component Override

| Component | Property    | Default | Cognitive |
| --------- | ----------- | ------- | --------- |
| Button    | paddingX    | 16px    | 24px      |
| Button    | paddingY    | 8px     | 12px      |
| Button    | minHeight   | —       | 48px      |
| Card      | padding     | 16px    | 24px      |
| Input     | minHeight   | —       | 48px      |
| Input     | borderWidth | 1px     | 2px       |

---

## Platform Output Map

### CSS Custom Properties (Web)

```
:root {
  /* Primitives */
  --color-blue-600: #2563EB;
  --spacing-4: 16px;
  --font-size-base: 16px;

  /* Semantic */
  --semantic-interactive-default: var(--color-blue-600);
  --type-scale-body-font-size: var(--font-size-base);

  /* Component */
  --button-primary-background: var(--semantic-interactive-default);
  --card-padding: var(--spacing-4);
}
```

### XAML Resources (Windows)

```xml
<Color x:Key="SemanticInteractiveDefault">#FF2563EB</Color>
<x:Double x:Key="CardPadding">16</x:Double>
<SolidColorBrush x:Key="SemanticInteractiveDefaultBrush" Color="#FF2563EB" />
```

### Swift Constants (iOS)

```swift
public static let semanticInteractiveDefault = colorBlue600
public static let cardPadding = spacing4
```

### Android XML Resources

```xml
<color name="semantic_interactive_default">#ff2563eb</color>
<dimen name="card_padding">16dp</dimen>
```

---

## Theme Matrix

| Theme          | Selector / Attribute                     | Builds Generated      |
| -------------- | ---------------------------------------- | --------------------- |
| Light          | `:root` (default)                        | CSS, Swift, XML, XAML |
| Dark           | `[data-theme="dark"]`                    | CSS, Swift, XML, XAML |
| Dark OLED      | `[data-theme="dark-oled"]`               | CSS, Swift, XML, XAML |
| High Contrast  | `[data-theme="high-contrast"]`           | CSS, Swift, XML, XAML |
| Cognitive Mode | `[data-a11y-cognitive="true"]` (overlay) | CSS overrides only    |

### Theme × Cognitive Mode Compound States

All themes work independently with cognitive mode. When cognitive mode is active, it overlays typography, spacing, and animation changes on top of any theme:

```
Theme (colors) × Cognitive Mode (layout/motion) = Compound State
```

Tested combinations:

- ✅ Light + Cognitive
- ✅ Dark + Cognitive
- ✅ Dark OLED + Cognitive
- ✅ High Contrast + Cognitive
- ✅ High Contrast + Cognitive + `forced-colors: active` (Windows)

---

## Token File Inventory

Complete listing of all design token JSON files:

### Primitive Tokens (`tokens/primitive/`)

| File                 | Purpose                               |
| -------------------- | ------------------------------------- |
| `colors.json`        | Color scales (neutral, brand, status) |
| `spacing.json`       | 4px grid spacing scale                |
| `typography.json`    | Font sizes and weights                |
| `shadows.json`       | Shadow definitions                    |
| `border-radius.json` | Border radius scale                   |
| `breakpoints.json`   | Viewport breakpoint values            |
| `motion.json`        | Duration and easing primitives        |
| `cognitive.json`     | Cognitive mode overrides              |

### Semantic Tokens (`tokens/semantic/`)

| File                        | Purpose                           |
| --------------------------- | --------------------------------- |
| `colors.light.json`         | Light theme color mappings        |
| `colors.dark.json`          | Dark theme color mappings         |
| `colors.dark-oled.json`     | OLED dark theme (true black)      |
| `colors.high-contrast.json` | High contrast theme mappings      |
| `typography.json`           | Type scale (display → caption)    |
| `elevation.json`            | Shadow elevation semantics        |
| `breakpoints.json`          | Device-oriented breakpoint names  |
| `animation.json`            | Purpose-mapped animation presets  |
| `cognitive.json`            | Cognitive accessibility overrides |

### Component Tokens (`tokens/component/`)

| File              | Purpose                                           |
| ----------------- | ------------------------------------------------- |
| `button.json`     | Button variants (primary, secondary, destructive) |
| `card.json`       | Card surface, padding, elevation                  |
| `input.json`      | Form input styling                                |
| `chart.json`      | Chart containers, axes, series colors             |
| `navigation.json` | Sidebar and bottom nav tokens                     |
| `progress.json`   | Progress bars and rings                           |
| `premium.json`    | Premium badge, gate, upsell tokens                |
| `animation.json`  | Component-level animation bindings                |
| `cognitive.json`  | Cognitive mode component overrides                |
