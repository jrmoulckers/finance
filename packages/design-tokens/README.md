# @finance/design-tokens

Design tokens for the Finance app, defined in [DTCG](https://design-tokens.github.io/community-group/format/) format and built with [Style Dictionary v5](https://styledictionary.com/).

## Token Architecture

```
tokens/
├── primitive/     # Raw values (colors, spacing, radius, typography, shadows, motion, opacity, z-index, cognitive)
├── semantic/      # Purpose-mapped tokens with theme variants + accessibility modes
│   ├── colors.light.json               # Light theme colors
│   ├── colors.dark.json                # Dark theme colors
│   ├── colors.dark-oled.json           # OLED dark theme (true black)
│   ├── colors.high-contrast.json       # Light high-contrast theme (WCAG AAA)
│   ├── colors.high-contrast-dark.json  # Dark high-contrast theme (WCAG AAA, near-black)
│   ├── typography.json            # Type scale (display → caption → amount)
│   ├── elevation.json             # Shadow elevation mapping (light default)
│   ├── animation.json             # Motion purpose mapping
│   ├── breakpoints.json           # Responsive layout breakpoints
│   ├── state.json                 # Opacity states (disabled, scrim, hover)
│   ├── layer.json                 # Stacking layers (modal, toast, tooltip…)
│   └── cognitive.json             # Cognitive accessibility overrides
├── override/      # Theme-scoped overrides layered after semantic + component (not auto-globbed)
│   ├── elevation.dark.json        # Visible dark/OLED elevation (shadow.dark.*)
│   └── chart.dark.json            # Dark/OLED CVD-safe chart series routing
└── component/     # Component-specific tokens
    ├── button.json                # Button variants (primary, secondary, destructive)
    ├── card.json                  # Card container styling
    ├── input.json                 # Text input/field styling
    ├── navigation.json            # Navigation bar/tab styling
    ├── chart.json                 # Data visualization charts
    ├── progress.json              # Progress bars and rings
    ├── animation.json             # Component animation bindings
    └── cognitive.json             # Cognitive mode component overrides
```

## Naming Conventions

Token authors should follow these conventions so names stay predictable across the three tiers:

- **Tiers**: `primitive` → `semantic` → `component`. Reference up the chain with `{group.subgroup.key}`; never hardcode a raw value in a semantic/component token.
- **Casing**: token group and key names are `camelCase` (`borderRadius`, `fontSize`, `zIndex`, `positiveSubtle`, `typeScale`). Numeric scale steps use bare numbers as keys (`spacing.4`, `color.blue.500`, `opacity.40`).
- **Scales**: color ramps run `50,100,…,900` (`950` where a deeper step is needed); `spacing` keys equal the multiplier of the 4px base (`spacing.6` = 24px); `borderRadius` uses t-shirt sizes (`sm`…`3xl`, plus `none`/`full`); `zIndex`/`opacity` use ordered numeric steps with gaps.
- **Semantic status**: each status hue exposes a solid foreground (`status.positive`) and a low-emphasis background (`status.positiveSubtle`). Never convey financial state through color alone — always pair with an icon/label.
- **Types**: use DTCG `$type` (`color`, `dimension`, `number`, `shadow`, `fontFamily`, `fontVariantNumeric`, `fontWeight`). Keep names stable — renames/removals are breaking changes.

## Build

```bash
npm run build    # Generate platform outputs in build/
npm run clean    # Remove build artifacts
```

### Output Platforms

| Platform       | Path             | Files                                                                                                                                                     |
| -------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web (CSS)      | `build/web/`     | `tokens.css`, `tokens-dark.css`, `tokens-dark-oled.css`, `tokens-high-contrast.css`, `tokens-high-contrast-dark.css`                                      |
| iOS (Swift)    | `build/ios/`     | `FinanceTokens.swift`, `FinanceTokensDark.swift`, `FinanceTokensDarkOLED.swift`, `FinanceTokensHighContrast.swift`, `FinanceTokensHighContrastDark.swift` |
| Android (XML)  | `build/android/` | `colors.xml`, `dimens.xml`, `colors-night.xml`, `colors-night-oled.xml`, `colors-high-contrast.xml`, `colors-high-contrast-dark.xml`                      |
| Windows (XAML) | `build/windows/` | `FinanceTokens.xaml`, `FinanceTokensBrushes.xaml` + dark/OLED/HC/HC-dark variants                                                                         |
| Kotlin (KMP)   | `build/kotlin/`  | `FinanceBreakpoints.kt`                                                                                                                                   |

### Theme Coverage

| Theme              | CSS Selector                        | Use Case                                                                    |
| ------------------ | ----------------------------------- | --------------------------------------------------------------------------- |
| Light              | `:root`                             | Default theme                                                               |
| Dark               | `[data-theme="dark"]`               | Standard dark mode                                                          |
| Dark OLED          | `[data-theme="dark-oled"]`          | True black for AMOLED battery savings                                       |
| High Contrast      | `[data-theme="high-contrast"]`      | Low vision / `prefers-contrast: more`                                       |
| High Contrast Dark | `[data-theme="high-contrast-dark"]` | Low vision + dark (`prefers-contrast: more` + `prefers-color-scheme: dark`) |

## Usage

### CSS (Web)

```css
@import '@finance/design-tokens/build/web/tokens.css';
@import '@finance/design-tokens/build/web/tokens-dark.css';
@import '@finance/design-tokens/build/web/tokens-high-contrast.css';

.card {
  background: var(--semantic-background-elevated);
  border-radius: var(--card-border-radius);
  padding: var(--card-padding);
}
```

### XAML (Windows)

```xml
<Page.Resources>
  <ResourceDictionary Source="ms-appx:///Tokens/FinanceTokens.xaml" />
</Page.Resources>

<Border
  Background="{StaticResource SemanticBackgroundElevatedBrush}"
  CornerRadius="{StaticResource CardBorderRadius}"
  Padding="{StaticResource CardPadding}" />
```

### Swift (iOS)

```swift
import FinanceTokens

let cardBg = FinanceTokens.cardBackground
let cardRadius = FinanceTokens.cardBorderRadius
```

### Kotlin / Android XML

```xml
<View
  android:background="@color/card_background"
  android:padding="@dimen/card_padding" />
```

## Token Tiers

Every visual property follows the three-tier resolution chain:

```
primitive (raw value)  →  semantic (purpose)  →  component (binding)
    color.blue.600     →  interactive.default  →  button.primary.background
    spacing.4          →     —                 →  card.padding
    shadow.sm          →  elevation.low        →  card.shadow
```

## Adding Tokens

1. Add the primitive value to the appropriate file under `tokens/primitive/`
2. Create a semantic mapping in `tokens/semantic/` (purpose-driven name)
3. Bind to components in `tokens/component/` (component-specific name)
4. Use `$value` and `$type` (DTCG format)
5. Reference other tokens with `{group.subgroup.key}` syntax
6. Run `npm run build` and verify output across all platforms
7. Update `docs/design/token-preview.md` if adding a new token category

## Documentation

- **[Token Preview & Reference](../../docs/design/token-preview.md)** — Visual reference of all tokens
- **[Data Visualization](../../docs/design/data-visualization.md)** — Chart token usage
- **[Cognitive Accessibility](../../docs/design/cognitive-accessibility.md)** — Cognitive mode tokens
- **[Animation Library](../../docs/design/animation-library.md)** — Motion token reference
- **[OLED Dark Mode](../../docs/design/oled-dark-mode.md)** — OLED theme tokens
