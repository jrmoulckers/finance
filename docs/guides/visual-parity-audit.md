# Cross-Platform Visual Parity Audit Guide

> Ensures every screen in Finance looks and feels consistent across Android, iOS,
> Web, and Windows — while respecting each platform's native conventions.

---

## 1. Design Token Verification

Design tokens are the single source of truth for visual consistency. Every
platform must resolve the same semantic tokens to equivalent rendered values.

### 1.1 Color Tokens

| Token Name              | Figma Value | Android (Compose)   | iOS (SwiftUI)          | Web (CSS)              | Windows (WinUI)     |
| ----------------------- | ----------- | ------------------- | ---------------------- | ---------------------- | ------------------- |
| `color.primary`         | `#1B6EF3`   | `Color(0xFF1B6EF3)` | `Color(hex: 0x1B6EF3)` | `var(--color-primary)` | `<SolidColorBrush>` |
| `color.surface`         | `#FFFFFF`   | ✅                  | ✅                     | ✅                     | ✅                  |
| `color.error`           | `#D32F2F`   | ✅                  | ✅                     | ✅                     | ✅                  |
| `color.on-primary`      | `#FFFFFF`   | ✅                  | ✅                     | ✅                     | ✅                  |
| `color.surface-variant` | `#F5F5F5`   | ✅                  | ✅                     | ✅                     | ✅                  |

**Verification steps:**

1. Export the full token list from Figma using the _Tokens Studio_ plugin.
2. For each platform, grep the codebase for every semantic token name.
3. Confirm the resolved hex value matches Figma within ΔE ≤ 1.0 (perceptual).
4. Repeat for both **light** and **dark** color schemes.

### 1.2 Typography Tokens

| Token                | Figma Spec          | Android         | iOS               | Web                    | Windows            |
| -------------------- | ------------------- | --------------- | ----------------- | ---------------------- | ------------------ |
| `type.display-large` | Inter 36/44 Medium  | `MaterialTheme` | `.title` + custom | `font-size: 2.25rem`   | `TitleLarge`       |
| `type.body-medium`   | Inter 14/20 Regular | `MaterialTheme` | `.body`           | `font-size: 0.875rem`  | `BodyTextBlock`    |
| `type.label-small`   | Inter 11/16 Medium  | `MaterialTheme` | `.caption`        | `font-size: 0.6875rem` | `CaptionTextBlock` |

**Verification steps:**

1. Compare rendered font-size, line-height, and weight on each platform.
2. Accept platform font substitution (San Francisco on iOS, Segoe UI on Windows)
   as long as **visual weight** is equivalent.
3. Confirm text truncation and wrapping behavior is consistent.

### 1.3 Spacing & Layout Tokens

| Token           | Value | Tolerance |
| --------------- | ----- | --------- |
| `spacing.xs`    | 4 dp  | ±1 dp     |
| `spacing.sm`    | 8 dp  | ±2 dp     |
| `spacing.md`    | 16 dp | ±2 dp     |
| `spacing.lg`    | 24 dp | ±2 dp     |
| `spacing.xl`    | 32 dp | ±2 dp     |
| `radius.card`   | 12 dp | ±1 dp     |
| `radius.button` | 8 dp  | ±1 dp     |

---

## 2. Screenshot Comparison Matrix

Use this template to track visual parity per screen, per platform, per theme.

### 2.1 Matrix Template

| Screen                 | Android Light | Android Dark | iOS Light | iOS Dark | Web Light | Web Dark | Windows Light | Windows Dark | Status |
| ---------------------- | :-----------: | :----------: | :-------: | :------: | :-------: | :------: | :-----------: | :----------: | :----: |
| Onboarding             |      📸       |      📸      |    📸     |    📸    |    📸     |    📸    |      📸       |      📸      |   ⬜   |
| Sign In                |      📸       |      📸      |    📸     |    📸    |    📸     |    📸    |      📸       |      📸      |   ⬜   |
| Dashboard              |      📸       |      📸      |    📸     |    📸    |    📸     |    📸    |      📸       |      📸      |   ⬜   |
| Transaction List       |      📸       |      📸      |    📸     |    📸    |    📸     |    📸    |      📸       |      📸      |   ⬜   |
| Transaction Detail     |      📸       |      📸      |    📸     |    📸    |    📸     |    📸    |      📸       |      📸      |   ⬜   |
| Add / Edit Transaction |      📸       |      📸      |    📸     |    📸    |    📸     |    📸    |      📸       |      📸      |   ⬜   |
| Budget Overview        |      📸       |      📸      |    📸     |    📸    |    📸     |    📸    |      📸       |      📸      |   ⬜   |
| Goal Detail            |      📸       |      📸      |    📸     |    📸    |    📸     |    📸    |      📸       |      📸      |   ⬜   |
| Settings               |      📸       |      📸      |    📸     |    📸    |    📸     |    📸    |      📸       |      📸      |   ⬜   |
| Data Export            |      📸       |      📸      |    📸     |    📸    |    📸     |    📸    |      📸       |      📸      |   ⬜   |

**Status legend:** ✅ Pass · ⚠️ Minor deviation · ❌ Fail · ⬜ Not yet audited

### 2.2 Capture Workflow

1. Use a **fixed device/viewport size** per platform:
   - Android: Pixel 7 (412 × 892 dp)
   - iOS: iPhone 15 (393 × 852 pt)
   - Web: 1440 × 900 px desktop, 390 × 844 px mobile
   - Windows: 1280 × 720 px
2. Capture both light and dark mode for each screen.
3. Name files: `{screen}_{platform}_{theme}.png`
   (e.g., `dashboard_android_dark.png`).
4. Store in `docs/screenshots/parity/` for version-controlled review.

---

## 3. Acceptable Deviation Thresholds

Not every pixel must match across platforms. These thresholds define what is
acceptable vs. what requires a fix.

| Category         | Threshold            | Notes                                            |
| ---------------- | -------------------- | ------------------------------------------------ |
| Spacing          | ±2 dp                | Rounding differences across density buckets      |
| Font size        | Same visual weight   | Platform fonts differ; match optical size not px |
| Corner radius    | ±1 dp                | Rendering engine anti-aliasing may differ        |
| Color            | ΔE ≤ 1.0 (CIELAB)    | Imperceptible to human eye                       |
| Icon size        | ±1 dp                | Vector rendering may round differently           |
| Shadow/elevation | Platform-native OK   | Material elevation on Android, shadow on iOS/Web |
| Animation curve  | Same semantic intent | Exact curves may use platform-native easing      |
| System chrome    | Platform-native      | Status bar, navigation bar follow OS conventions |

### Deviation Severity

- **P0 — Blocker:** Brand color wrong, layout broken, text unreadable.
- **P1 — Major:** Spacing off by >4 dp, wrong font weight, missing dark mode.
- **P2 — Minor:** Spacing off by 2–4 dp, shadow subtle difference.
- **P3 — Cosmetic:** Sub-pixel rendering difference, platform-native chrome.

---

## 4. Audit Tools

### 4.1 Figma Overlay Comparison

1. Export the Figma frame as a PNG at 1× scale.
2. Overlay on the device screenshot at 50% opacity.
3. Confirm alignment of key elements (headers, cards, buttons, spacing).
4. Flag any element that is visibly offset.

### 4.2 Manual Side-by-Side

1. Open all four platform screenshots of the same screen in a tiled view.
2. Walk through the checklist:
   - [ ] Header position and text
   - [ ] Card spacing and border radius
   - [ ] Button size, shape, and label
   - [ ] Color consistency (background, text, accents)
   - [ ] Icon size and alignment
   - [ ] Empty-state illustrations
3. Record deviations in the matrix above.

### 4.3 Automated Screenshot Diff

For CI integration, use pixel-diff tools to catch regressions:

```yaml
# Example: screenshot diff step in CI
- name: Screenshot Diff
  run: |
    npx reg-cli \
      actual-screenshots/ \
      expected-screenshots/ \
      diff-output/ \
      --report reg-report.html \
      --json reg-report.json \
      --threshold 0.01
```

**Tool options:**

| Tool             | Use Case                    | Integration |
| ---------------- | --------------------------- | ----------- |
| `reg-cli`        | Pixel diff with HTML report | CI / local  |
| `BackstopJS`     | Visual regression for web   | CI          |
| `shot-scraper`   | Automated web screenshots   | CI          |
| `Maestro`        | Mobile screenshot flows     | CI / local  |
| `Paparazzi`      | Compose snapshot testing    | Android CI  |
| `swift-snapshot` | SwiftUI snapshot testing    | iOS CI      |

---

## 5. Audit Cadence

| Event                      | Action                                |
| -------------------------- | ------------------------------------- |
| Every PR touching UI       | Screenshot comparison in PR review    |
| Weekly (during active dev) | Full matrix audit of changed screens  |
| Pre-release                | Complete audit of all screens         |
| Post-design-token change   | Full token verification + screenshots |

---

## 6. Reporting

After each audit, update the screenshot matrix and file issues for any
deviation at P1 or above. Link issues to the affected screen and platform.

```markdown
### Audit Report — YYYY-MM-DD

- **Screens audited:** N
- **Platforms:** Android, iOS, Web, Windows
- **Pass:** X | **Minor:** Y | **Fail:** Z
- **Issues filed:** #nn, #nn
```
