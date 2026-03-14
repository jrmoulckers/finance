# @finance/design-tokens

Design tokens for the Finance app, defined in [DTCG](https://design-tokens.github.io/community-group/format/) format and built with [Style Dictionary v4](https://styledictionary.com/).

## Token Architecture

```
tokens/
├── primitive/     # Raw values (colors, spacing, typography, shadows, motion)
├── semantic/      # Purpose-mapped tokens with light/dark themes
└── component/     # Component-specific tokens (button, card, input, navigation)
```

## Build

```bash
npm run build    # Generate platform outputs in build/
npm run clean    # Remove build artifacts
```

### Output Platforms

| Platform      | Path             | Files                                            |
| ------------- | ---------------- | ------------------------------------------------ |
| Web (CSS)     | `build/web/`     | `tokens.css`, `tokens-dark.css`                  |
| iOS (Swift)   | `build/ios/`     | `FinanceTokens.swift`, `FinanceTokensDark.swift` |
| Android (XML) | `build/android/` | `colors.xml`, `dimens.xml`, `colors-night.xml`   |

## Usage

### CSS

```css
@import '@finance/design-tokens/build/web/tokens.css';

.card {
  background: var(--semantic-background-elevated);
  border-radius: var(--card-border-radius);
  padding: var(--card-padding);
}
```

Dark mode uses `[data-theme="dark"]` selector — import `tokens-dark.css` alongside.

### Adding Tokens

1. Add values to the appropriate JSON file under `tokens/`
2. Use `$value` and `$type` (DTCG format)
3. Reference other tokens with `{group.subgroup.key}` syntax
4. Run `npm run build` and verify output
