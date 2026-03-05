# ADR-0005: Design System Approach

**Status:** Proposed
**Date:** 2025-07-15
**Author:** AI agent (Copilot), with human review pending
**Reviewers:** TBD

## Context

Finance targets five distinct UI platforms — iOS/macOS (SwiftUI), Android (Jetpack Compose), Web (React), Windows (WinUI 3), and wearables (watchOS/Wear OS). Each platform has its own design language (HIG, Material Design 3, Fluent, etc.), native UI framework, and accessibility APIs.

Key forces driving this decision:

- **Native-first principle:** Per ADR-0002, each platform uses its native UI framework. Users expect apps to feel native on their platform — SwiftUI on Apple, Compose on Android, React on Web, WinUI on Windows.
- **Brand consistency:** Despite native implementations, the app must have a recognizable brand identity — consistent colors, typography scales, spacing, and visual language across all platforms.
- **Accessibility requirements:** WCAG 2.2 AA minimum compliance is non-negotiable for a financial application. Color-blind-safe palettes are essential for financial data visualization where color conveys meaning (positive/negative amounts, budget status).
- **Multi-theme support:** Light mode, dark mode, high-contrast mode, and color-blind-safe variants must be supported across all platforms.
- **Developer efficiency:** With four separate platform codebases, design changes must propagate efficiently without manual synchronization across teams.
- **Financial data visualization:** Charts, budgets, and transaction displays require specialized accessible visualization components on each platform.

## Decision

We will implement a **design token-based architecture** with the following key components:

### 1. Design Tokens (DTCG JSON Spec) as Single Source of Truth

All design decisions — colors, typography, spacing, radii, elevation, motion — are encoded as platform-agnostic JSON tokens following the [W3C Design Tokens Community Group (DTCG) specification](https://www.w3.org/community/design-tokens/). The DTCG spec reached its first stable version in late 2025, providing true cross-tool interoperability.

Tokens are the **only** shared artifact between platforms. No UI component code is shared.

### 2. Three-Tier Token Model

Tokens are organized in three layers, each building on the previous:

| Layer | Purpose | Naming Convention | Example |
|-------|---------|-------------------|---------|
| **Primitive** | Raw, context-free values | `color.blue.500`, `spacing.4` | `#0066FF`, `16px` |
| **Semantic** | Role-based mappings that change per theme | `color.surface.primary`, `color.text.primary` | Maps to different primitives in light vs dark |
| **Component** | Per-component token bindings | `button.background.primary`, `card.border.radius` | References semantic tokens |

**Example primitive tokens (`tokens/primitives/colors.json`):**
```json
{
  "color": {
    "blue": {
      "50":  { "$value": "#E8F0FE", "$type": "color" },
      "100": { "$value": "#D2E3FC", "$type": "color" },
      "500": { "$value": "#0066FF", "$type": "color" },
      "700": { "$value": "#0052CC", "$type": "color" },
      "900": { "$value": "#003D99", "$type": "color" }
    },
    "neutral": {
      "0":   { "$value": "#FFFFFF", "$type": "color" },
      "50":  { "$value": "#F8F9FA", "$type": "color" },
      "900": { "$value": "#1A1A2E", "$type": "color" },
      "1000": { "$value": "#000000", "$type": "color" }
    }
  },
  "spacing": {
    "1":  { "$value": "4px",  "$type": "dimension" },
    "2":  { "$value": "8px",  "$type": "dimension" },
    "3":  { "$value": "12px", "$type": "dimension" },
    "4":  { "$value": "16px", "$type": "dimension" },
    "6":  { "$value": "24px", "$type": "dimension" },
    "8":  { "$value": "32px", "$type": "dimension" }
  }
}
```

**Example semantic tokens (`tokens/semantic/light.json`):**
```json
{
  "color": {
    "surface": {
      "primary":   { "$value": "{color.neutral.0}",   "$type": "color" },
      "secondary": { "$value": "{color.neutral.50}",  "$type": "color" }
    },
    "text": {
      "primary":   { "$value": "{color.neutral.900}", "$type": "color" },
      "secondary": { "$value": "{color.neutral.600}", "$type": "color" }
    },
    "interactive": {
      "primary":   { "$value": "{color.blue.500}",    "$type": "color" },
      "hover":     { "$value": "{color.blue.700}",    "$type": "color" }
    },
    "data": {
      "positive":  { "$value": "#009E73", "$type": "color", "$description": "Income, positive balance — CVD-safe teal" },
      "negative":  { "$value": "#DC267F", "$type": "color", "$description": "Overspending, alerts — CVD-safe magenta" },
      "neutral":   { "$value": "#666666", "$type": "color" },
      "category1": { "$value": "#648FFF", "$type": "color", "$description": "IBM CVD-safe blue" },
      "category2": { "$value": "#785EF0", "$type": "color", "$description": "IBM CVD-safe purple" },
      "category3": { "$value": "#FE6100", "$type": "color", "$description": "IBM CVD-safe orange" },
      "category4": { "$value": "#FFB000", "$type": "color", "$description": "IBM CVD-safe yellow" }
    }
  },
  "spacing": {
    "component": {
      "padding":    { "$value": "{spacing.4}", "$type": "dimension" },
      "gap":        { "$value": "{spacing.3}", "$type": "dimension" },
      "sectionGap": { "$value": "{spacing.8}", "$type": "dimension" }
    }
  }
}
```

### 3. Theme Variants

Four theme sets override semantic tokens without duplicating the full token tree:

| Theme | Use Case | Key Characteristics |
|-------|----------|---------------------|
| **Light** | Default, well-lit environments | White surfaces, dark text, vibrant accents |
| **Dark** | Low-light, OLED battery savings | Dark surfaces, light text, muted accents |
| **High Contrast** | Low vision, accessibility | Maximum contrast ratios, bold borders, enlarged focus indicators |
| **Color-Blind Safe** | Color vision deficiency users | IBM CVD-safe palette, pattern overlays on charts |

**Dark theme override (`tokens/semantic/dark.json`):**
```json
{
  "color": {
    "surface": {
      "primary":   { "$value": "{color.neutral.900}", "$type": "color" },
      "secondary": { "$value": "{color.neutral.800}", "$type": "color" }
    },
    "text": {
      "primary":   { "$value": "{color.neutral.50}",  "$type": "color" },
      "secondary": { "$value": "{color.neutral.300}", "$type": "color" }
    },
    "data": {
      "positive":  { "$value": "#56B4E9", "$type": "color", "$description": "Adjusted for dark backgrounds" },
      "negative":  { "$value": "#FF6B9D", "$type": "color", "$description": "Adjusted for dark backgrounds" }
    }
  }
}
```

### 4. IBM CVD-Safe Color Palette for Data Visualization

Financial data visualization relies heavily on color to convey meaning (positive/negative, category breakdowns, budget status). We adopt the **IBM Color-Blind Safe palette**, validated for all color vision deficiency types (protanopia, deuteranopia, tritanopia):

| Swatch | Hex | Role |
|--------|-----|------|
| Blue | `#648FFF` | Income / positive trends |
| Purple | `#785EF0` | Investments |
| Magenta | `#DC267F` | Overspending / alerts |
| Orange | `#FE6100` | Spending categories |
| Yellow | `#FFB000` | Savings / goals |

**Data visualization rules:**
1. Never rely on color alone — use patterns, textures, direct labels, and distinct shapes.
2. Limit categories to 6 maximum per chart (+ "Other").
3. Maintain ≥4.5:1 contrast ratio for all data elements against their background.
4. Use sequential palettes (Viridis, Cividis) for heatmaps and gradients.
5. Direct-label chart elements; minimize legend dependence.
6. Provide text/table alternatives for all charts.
7. Test with Color Oracle / Coblis simulator in CI.

### 5. Typography Scales Per Platform

Each platform uses its native type system, mapped from shared semantic tokens:

| Semantic Token | iOS (SF Pro) | Android (Roboto) | Web (Inter) | Windows (Segoe UI Variable) |
|---------------|-------------|-----------------|-------------|---------------------------|
| `type.display.large` | .largeTitle (34pt) | Display Large (57sp) | 3.5rem (56px) | 40px |
| `type.heading.1` | .title (28pt) | Headline Large (32sp) | 2rem (32px) | 28px |
| `type.heading.2` | .title2 (22pt) | Headline Medium (28sp) | 1.5rem (24px) | 24px |
| `type.body` | .body (17pt) | Body Large (16sp) | 1rem (16px) | 14px |
| `type.caption` | .caption (12pt) | Body Small (12sp) | 0.75rem (12px) | 12px |
| `type.money` | SF Mono (17pt) | Roboto Mono (16sp) | Tabular nums (16px) | Cascadia Mono (14px) |

The `type.money` token uses monospaced/tabular numerals for financial figures, ensuring decimal points align in lists and tables.

### 6. Style Dictionary for Platform Transforms

[Style Dictionary](https://styledictionary.com/) transforms DTCG JSON tokens into platform-native code:

```json
{
  "source": ["tokens/**/*.json"],
  "platforms": {
    "ios-swift": {
      "transformGroup": "ios-swift",
      "buildPath": "packages/design-tokens/build/ios/",
      "files": [{
        "destination": "FinanceTokens.swift",
        "format": "ios-swift/class.swift",
        "options": { "accessControl": "public" }
      }]
    },
    "android": {
      "transformGroup": "android",
      "buildPath": "packages/design-tokens/build/android/",
      "files": [
        { "destination": "colors.xml", "format": "android/colors" },
        { "destination": "dimens.xml", "format": "android/dimens" },
        { "destination": "font_dimens.xml", "format": "android/fontDimens" }
      ]
    },
    "css": {
      "transformGroup": "css",
      "buildPath": "packages/design-tokens/build/web/",
      "files": [
        { "destination": "tokens.css", "format": "css/variables" },
        { "destination": "tokens.ts", "format": "javascript/es6" }
      ]
    },
    "xaml": {
      "transformGroup": "xaml",
      "buildPath": "packages/design-tokens/build/windows/",
      "files": [{
        "destination": "Tokens.xaml",
        "format": "xaml/resources"
      }]
    }
  }
}
```

**Generated output examples:**

**Swift (`FinanceTokens.swift`):**
```swift
public struct FinanceTokens {
    public struct Color {
        public static let surfacePrimary = UIColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0)
        public static let textPrimary = UIColor(red: 0.1, green: 0.1, blue: 0.18, alpha: 1.0)
        public static let dataPositive = UIColor(red: 0.0, green: 0.62, blue: 0.45, alpha: 1.0)
        public static let dataNegative = UIColor(red: 0.86, green: 0.15, blue: 0.5, alpha: 1.0)
    }
    public struct Spacing {
        public static let componentPadding: CGFloat = 16.0
        public static let componentGap: CGFloat = 12.0
    }
}
```

**CSS (`tokens.css`):**
```css
:root {
  --color-surface-primary: #FFFFFF;
  --color-text-primary: #1A1A2E;
  --color-data-positive: #009E73;
  --color-data-negative: #DC267F;
  --spacing-component-padding: 16px;
  --spacing-component-gap: 12px;
}
```

**Android (`colors.xml`):**
```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="color_surface_primary">#FFFFFF</color>
  <color name="color_text_primary">#1A1A2E</color>
  <color name="color_data_positive">#009E73</color>
  <color name="color_data_negative">#DC267F</color>
</resources>
```

### 7. Native UI Components Per Platform

Each platform implements components natively using shared **component specifications** (not shared code):

| Platform | UI Framework | Design Language | Charting Library |
|----------|-------------|-----------------|-----------------|
| iOS/macOS | SwiftUI | Human Interface Guidelines | Swift Charts |
| Android | Jetpack Compose | Material Design 3 (Material You) | Vico (Compose-native) |
| Web | React + TypeScript | Custom (brand-aligned) | Recharts + D3.js |
| Windows | WinUI 3 / XAML | Windows 11 Fluent Design | LiveCharts2 |

**Component specifications** (stored in `packages/component-specs/`) define:
- **Behavioral spec:** States, interactions, transitions, and edge cases.
- **Token bindings:** Which semantic tokens apply to each visual property.
- **Accessibility contract:** Required labels, roles, keyboard/gesture support, screen reader behavior.
- **Visual reference:** Figma design with platform variants.

### 8. Accessibility Contracts for Components

Every component specification includes a mandatory accessibility contract:

**Example — Transaction Row accessibility contract:**
```markdown
## Accessibility Contract: Transaction Row

### Screen Reader
- Announce as a single group: "{payee}, {category}, {amount}, {date}"
- Amount sign announced as "positive" or "negative" (not "minus")
- Currency announced before amount: "negative forty-two dollars"

### Keyboard/Switch
- Focusable as a single unit
- Enter/Space: open transaction detail
- Context menu (right-click/long-press): categorize, flag, delete

### Target Size
- Minimum: 44×44pt (iOS) / 48×48dp (Android) / 24×24px (Web, WCAG 2.2 AA)
- Recommended: full row height ≥ 56pt/dp

### Motion
- Respect `prefers-reduced-motion` / `UIAccessibility.isReduceMotionEnabled`
- Swipe actions must have non-gesture alternatives (context menu)

### Contrast
- Amount text: ≥4.5:1 against row background (all themes)
- Category chip: ≥3:1 for non-text elements
```

### 9. Data Visualization Approach

Charts are implemented natively per platform but share a common **chart specification** defining data shape, axis configuration, color token bindings, and accessibility requirements:

```typescript
// Shared chart specification (packages/component-specs/charts/category-breakdown.ts)
interface CategoryBreakdownSpec {
  type: 'donut';
  maxSegments: 6;  // + "Other" bucket
  tokens: {
    segments: [
      'color.data.category1',  // #648FFF — IBM CVD-safe
      'color.data.category2',  // #785EF0
      'color.data.category3',  // #FE6100
      'color.data.category4',  // #FFB000
      'color.data.positive',   // #009E73
      'color.data.negative',   // #DC267F
    ];
    background: 'color.surface.primary';
    label: 'color.text.primary';
  };
  accessibility: {
    role: 'img';
    label: 'Category spending breakdown for {month}';
    textAlternative: 'required';  // Table fallback mandatory
    directLabels: true;           // Label segments directly, not just legend
  };
}
```

## Alternatives Considered

### Alternative 1: Shared Cross-Platform UI Library

Build a single component library (e.g., using React Native or Flutter) shared across all platforms.

- **Pros:** Single codebase for UI; faster feature development; guaranteed visual parity.
- **Cons:** Violates native-first principle (ADR-0002); components fight platform conventions; accessibility is harder to retrofit; users notice non-native behavior (scroll physics, navigation patterns, keyboard handling); maintenance burden of cross-platform abstraction layer.

### Alternative 2: Compose Multiplatform Everywhere

Use JetBrains Compose Multiplatform as a single UI framework across Android, iOS, Web, and Desktop.

- **Pros:** Kotlin-based shared UI; growing ecosystem; Google and JetBrains backing; true code sharing.
- **Cons:** iOS support still maturing (alpha/beta quality for production); no WinUI integration; doesn't feel native on Apple platforms (no SF Symbols, non-standard navigation); web support experimental; limited accessibility API coverage on non-Android platforms.

### Alternative 3: CSS-in-JS Shared Styles

Share a CSS-in-JS theming library across Web and use manual equivalents for native platforms.

- **Pros:** Familiar tooling for web developers; large ecosystem (styled-components, Emotion).
- **Cons:** CSS-in-JS only works for web; native platforms need separate solutions anyway; no standard format for cross-platform token exchange; runtime performance cost on web.

### Alternative 4: No Design Tokens — Platform-Independent Design

Let each platform team make independent design decisions with only high-level brand guidelines.

- **Pros:** Maximum platform-native feel; minimal coordination overhead; each team moves independently.
- **Cons:** Brand inconsistency across platforms; design drift over time; no automated way to propagate changes; accessibility standards applied inconsistently; duplicated design effort.

## Consequences

### Positive

- **Brand consistency with platform-native feel:** Tokens encode the brand (colors, type, spacing) while platform teams implement components that feel native.
- **Efficient change propagation:** A color or spacing change in the JSON token source automatically generates updated code for all four platforms via Style Dictionary.
- **Accessibility built-in:** CVD-safe palette, accessibility contracts in component specs, and per-platform accessibility API usage ensure inclusive design by default.
- **Theme support:** Light, dark, high-contrast, and CVD-safe themes are encoded as token overrides — no duplicated component code.
- **Scalable:** Adding a new platform (e.g., visionOS) requires only a new Style Dictionary transform, not a new component library.

### Negative

- **No shared UI code:** Each component must be implemented independently on each platform, multiplying UI development effort by ~4x.
- **Spec maintenance:** Component specifications must be kept in sync with implementations — drift is possible if specs aren't treated as living documents.
- **Style Dictionary learning curve:** Custom transforms may be needed for platform-specific output formats (e.g., XAML resource dictionaries).
- **Token overhead:** The three-tier token model adds indirection — developers must understand the primitive→semantic→component chain to make design changes.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Platform implementations diverge from specs | Medium | Medium | Cross-platform visual regression testing with shared test data; regular design reviews |
| Token naming conflicts or ambiguity | Low | Medium | Strict naming convention in DTCG spec; automated linting of token files |
| Style Dictionary transform bugs | Low | High | CI pipeline builds tokens on every change; snapshot tests for generated output |
| Accessibility contract compliance | Medium | High | Automated a11y audits in CI (axe-core for web, XCUITest assertions for iOS) |

## Implementation Notes

### Repository Structure

```
packages/
├── design-tokens/
│   ├── tokens/                    # DTCG JSON token definitions
│   │   ├── primitives/
│   │   │   ├── colors.json        # Raw color values
│   │   │   ├── typography.json    # Font families, weights, sizes
│   │   │   ├── spacing.json       # Spacing scale
│   │   │   ├── radii.json         # Border radii
│   │   │   ├── elevation.json     # Shadow/elevation values
│   │   │   └── motion.json        # Duration, easing curves
│   │   ├── semantic/
│   │   │   ├── light.json         # Light theme semantic mappings
│   │   │   ├── dark.json          # Dark theme overrides
│   │   │   ├── high-contrast.json # High contrast overrides
│   │   │   └── cvd-safe.json      # Color-blind safe overrides
│   │   └── component/
│   │       ├── button.json        # Button token bindings
│   │       ├── card.json          # Card token bindings
│   │       ├── transaction-row.json
│   │       └── chart.json         # Chart/data-viz token bindings
│   ├── build/                     # Generated platform outputs (gitignored)
│   │   ├── ios/                   # FinanceTokens.swift
│   │   ├── android/               # colors.xml, dimens.xml
│   │   ├── web/                   # tokens.css, tokens.ts
│   │   └── windows/               # Tokens.xaml
│   ├── config.json                # Style Dictionary configuration
│   └── package.json
├── component-specs/
│   ├── transaction-row.md         # Behavioral spec + token bindings + a11y contract
│   ├── budget-gauge.md
│   ├── balance-card.md
│   ├── category-chip.md
│   ├── amount-display.md
│   └── charts/
│       ├── category-breakdown.md
│       ├── spending-trend.md
│       └── budget-progress.md
└── test-data/
    ├── transactions.json          # Shared test fixtures for cross-platform parity
    ├── budgets.json
    └── accounts.json
```

### Build Pipeline

The token build is integrated into the monorepo's Turborepo pipeline:

```json
// turbo.json (partial)
{
  "pipeline": {
    "design-tokens#build": {
      "inputs": ["tokens/**/*.json", "config.json"],
      "outputs": ["build/**"],
      "cache": true
    }
  }
}
```

Tokens are built as a dependency of all platform apps:
```bash
npx turbo run build --filter=design-tokens
```

### Component Catalog Per Platform

| Platform | Catalog Tool | Purpose |
|----------|-------------|---------|
| Web | Storybook.js + `@storybook/addon-a11y` | Interactive docs, accessibility auditing, visual regression |
| iOS | SwiftUI Previews + dedicated catalog target | Xcode previews for all components with state variants |
| Android | Compose Previews + `:design-system-catalog` module | Android Studio previews, dedicated catalog app |
| Windows | XAML Hot Reload + catalog project | Visual Studio previews, component browser |

### Figma Integration

Figma serves as the design source, with Tokens Studio exporting to the DTCG JSON format consumed by Style Dictionary:

```
Figma Variables → Tokens Studio (export) → tokens/*.json → Style Dictionary → Platform code
```

The Figma design system is structured as:
- **Foundations** — shared tokens, colors, typography, spacing, icons
- **iOS Components** — HIG-compliant variants
- **Android Components** — Material 3 variants
- **Web Components** — Custom brand-aligned variants
- **Windows Components** — WinUI/Fluent variants
- **Data Visualization** — Charts, graphs, gauges (all platforms)

## References

- [W3C DTCG Spec (2025)](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/)
- [Martin Fowler — Design Token-Based UI Architecture](https://martinfowler.com/articles/design-token-based-ui-architecture.html)
- [Style Dictionary](https://styledictionary.com/)
- [IBM CVD-Safe Palette](https://rgblind.com/blog/color-blindness-friendly-chart-colors)
- [WCAG 2.2 Specification](https://www.w3.org/TR/WCAG22/)
- [ADR-0002: Cross-Platform Framework Selection](./0002-cross-platform-framework-selection.md)
