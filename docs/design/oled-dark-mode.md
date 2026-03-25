# OLED Dark Mode Theme

> **Issue:** [#307](https://github.com/nickvdyck/finance-management/issues/307)
> **Token variant:** `dark-oled`
> **Selector:** `[data-theme="dark-oled"]`

## Design Rationale

### Why OLED Dark Mode?

OLED and AMOLED displays light each pixel individually. When a pixel displays
true black (`#000000`), it turns off completely. This has two significant
benefits:

1. **Battery savings** — On AMOLED devices, a true black UI can reduce display
   power consumption by 30–60% compared to dark gray backgrounds (studies by
   Google/Android, Purdue University, 2021).
2. **Infinite contrast** — Turned-off pixels produce zero light emission,
   creating a perception of content "floating" on the display surface.

### Design Philosophy

The OLED theme is a specialized variant of the standard dark theme, optimized
for users on AMOLED/OLED screens (most modern smartphones, some laptops and
monitors). Key differences:

| Property             | Standard Dark           | OLED Dark                |
| -------------------- | ----------------------- | ------------------------ |
| Primary background   | `#030712` (neutral-950) | `#000000` (true black)   |
| Secondary background | `#111827` (neutral-900) | `#0A0A0A` (near-black)   |
| Elevated surface     | `#1F2937` (neutral-800) | `#111111` (minimal lift) |
| Border default       | `#374151` (neutral-700) | `#6B7280` (neutral-500)  |
| Text disabled        | `#4B5563` (neutral-600) | `#6B7280` (neutral-500)  |
| Text inverse         | `#111827` (neutral-900) | `#000000` (true black)   |
| Elevation (shadows)  | Drop shadows            | Subtle luminous borders  |

---

## Color Palette & WCAG AA Contrast Ratios

All foreground colors have been verified against the OLED black background
(`#000000`, relative luminance = 0). WCAG AA requirements:

- **Normal text** (< 18pt / < 14pt bold): **4.5:1** minimum
- **Large text** (≥ 18pt / ≥ 14pt bold): **3:1** minimum
- **UI components** (borders, icons, controls): **3:1** minimum
- **Disabled controls**: Exempt per WCAG 2.1 SC 1.4.3

### Backgrounds

| Token                             | Value                   | Hex       | Description                    |
| --------------------------------- | ----------------------- | --------- | ------------------------------ |
| `--semantic-background-primary`   | `{color.oled.black}`    | `#000000` | True black — OLED pixels off   |
| `--semantic-background-secondary` | `{color.oled.surface}`  | `#0A0A0A` | Near-black secondary surface   |
| `--semantic-background-elevated`  | `{color.oled.elevated}` | `#111111` | Elevated cards, modals, panels |

### Text on Primary Background (#000000)

| Token                       | Value                 | Hex       | Contrast   | Requirement | Result    |
| --------------------------- | --------------------- | --------- | ---------- | ----------- | --------- |
| `--semantic-text-primary`   | `{color.neutral.50}`  | `#F9FAFB` | **20.1:1** | 4.5:1       | ✅ Pass   |
| `--semantic-text-secondary` | `{color.neutral.400}` | `#9CA3AF` | **8.3:1**  | 4.5:1       | ✅ Pass   |
| `--semantic-text-disabled`  | `{color.neutral.500}` | `#6B7280` | **4.35:1** | Exempt      | ✅ Exempt |

### Text on Elevated Surface (#111111)

| Token                       | Value                 | Hex       | Contrast   | Requirement | Result    |
| --------------------------- | --------------------- | --------- | ---------- | ----------- | --------- |
| `--semantic-text-primary`   | `{color.neutral.50}`  | `#F9FAFB` | **18.3:1** | 4.5:1       | ✅ Pass   |
| `--semantic-text-secondary` | `{color.neutral.400}` | `#9CA3AF` | **7.6:1**  | 4.5:1       | ✅ Pass   |
| `--semantic-text-disabled`  | `{color.neutral.500}` | `#6B7280` | **4.0:1**  | Exempt      | ✅ Exempt |

### Interactive Colors on #000000

| Token                             | Value                 | Hex       | Contrast   | Requirement       | Result    |
| --------------------------------- | --------------------- | --------- | ---------- | ----------------- | --------- |
| `--semantic-interactive-default`  | `{color.blue.400}`    | `#60A5FA` | **8.3:1**  | 4.5:1 (text link) | ✅ Pass   |
| `--semantic-interactive-hover`    | `{color.blue.300}`    | `#93C5FD` | **11.9:1** | 3:1               | ✅ Pass   |
| `--semantic-interactive-pressed`  | `{color.blue.200}`    | `#BFDBFE` | **15.4:1** | 3:1               | ✅ Pass   |
| `--semantic-interactive-disabled` | `{color.neutral.600}` | `#4B5563` | **2.79:1** | Exempt            | ✅ Exempt |

### Status Colors on #000000

| Token                        | Value               | Hex       | Contrast  | Requirement | Result  |
| ---------------------------- | ------------------- | --------- | --------- | ----------- | ------- |
| `--semantic-status-positive` | `{color.green.500}` | `#22C55E` | **9.5:1** | 3:1 (UI)    | ✅ Pass |
| `--semantic-status-negative` | `{color.red.500}`   | `#EF4444` | **5.6:1** | 3:1 (UI)    | ✅ Pass |
| `--semantic-status-warning`  | `{color.amber.500}` | `#F59E0B` | **9.8:1** | 3:1 (UI)    | ✅ Pass |
| `--semantic-status-info`     | `{color.blue.400}`  | `#60A5FA` | **8.3:1** | 3:1 (UI)    | ✅ Pass |

### Border & UI Component Colors on #000000

| Token                       | Value                 | Hex       | Contrast   | Requirement | Result  |
| --------------------------- | --------------------- | --------- | ---------- | ----------- | ------- |
| `--semantic-border-default` | `{color.neutral.500}` | `#6B7280` | **4.35:1** | 3:1 (UI)    | ✅ Pass |
| `--semantic-border-focus`   | `{color.blue.400}`    | `#60A5FA` | **8.3:1**  | 3:1 (UI)    | ✅ Pass |
| `--semantic-border-error`   | `{color.red.400}`     | `#F87171` | **7.56:1** | 3:1 (UI)    | ✅ Pass |

### CVD-Safe Chart Palette on #000000

Chart colors use the IBM CVD-safe palette (unchanged across all themes):

| Token             | Hex       | Contrast   | 3:1 UI | 4.5:1 Text |
| ----------------- | --------- | ---------- | ------ | ---------- |
| `--color-chart-1` | `#648FFF` | **8.0:1**  | ✅     | ✅         |
| `--color-chart-2` | `#785EF0` | **4.67:1** | ✅     | ✅         |
| `--color-chart-3` | `#DC267F` | **4.6:1**  | ✅     | ✅         |
| `--color-chart-4` | `#FE6100` | **6.93:1** | ✅     | ✅         |
| `--color-chart-5` | `#FFB000` | **9.81:1** | ✅     | ✅         |
| `--color-chart-6` | `#009E73` | **6.18:1** | ✅     | ✅         |

---

## Elevation Strategy

Traditional drop shadows are invisible on true black backgrounds because there
is no lighter surface to cast against. The OLED theme replaces shadow-based
elevation with subtle luminous borders:

| Elevation Level | Standard Dark                   | OLED Dark                          |
| --------------- | ------------------------------- | ---------------------------------- |
| None            | `none`                          | `none`                             |
| Low             | `0px 1px 2px rgba(0,0,0,0.05)`  | `0 0 0 1px rgba(255,255,255,0.08)` |
| Medium          | `0px 4px 6px rgba(0,0,0,0.1)`   | `0 0 0 1px rgba(255,255,255,0.12)` |
| High            | `0px 10px 15px rgba(0,0,0,0.1)` | `0 0 0 1px rgba(255,255,255,0.16)` |

This preserves the visual hierarchy without wasting pixel illumination on
invisible shadow effects.

---

## Usage Instructions

### Web (CSS / React)

The OLED theme activates when `data-theme="dark-oled"` is set on the `<html>`
element:

```html
<html data-theme="dark-oled"></html>
```

#### Using the `useTheme` Hook

```tsx
import { useTheme } from '@/hooks';

function ThemeSelector() {
  const { theme, setTheme, resolvedTheme, themes } = useTheme();

  return (
    <fieldset>
      <legend>Theme</legend>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
        aria-label="Select color theme"
      >
        <option value="system">System (auto)</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="dark-oled">OLED Dark</option>
      </select>
      <p>Active theme: {resolvedTheme}</p>
    </fieldset>
  );
}
```

The hook:

- Persists the user's choice to `localStorage` (key: `finance-theme-preference`)
- Listens for OS `prefers-color-scheme` changes when set to `system`
- Applies/removes the `data-theme` attribute on `<html>` automatically

### Token Resolution Chain

The OLED theme follows the standard three-tier token architecture:

```
Primitive (color.oled.black: #000000)
    ↓
Semantic (semantic.background.primary → {color.oled.black})
    ↓
Component (card-background → var(--semantic-background-elevated))
```

Component tokens reference semantic tokens via `var()`, so overriding the
semantic layer is sufficient. No component-level overrides are needed.

### Adding to Settings Page

Integrate the theme selector into the Settings page. Recommended pattern:

```tsx
// In settings page
const { theme, setTheme } = useTheme();

<div role="radiogroup" aria-label="Theme preference">
  {[
    { value: 'system', label: 'System', description: 'Follow device setting' },
    { value: 'light', label: 'Light', description: 'Light backgrounds' },
    { value: 'dark', label: 'Dark', description: 'Dark gray backgrounds' },
    { value: 'dark-oled', label: 'OLED Dark', description: 'True black, saves battery on AMOLED' },
  ].map((option) => (
    <label key={option.value}>
      <input
        type="radio"
        name="theme"
        value={option.value}
        checked={theme === option.value}
        onChange={() => setTheme(option.value)}
      />
      <span>{option.label}</span>
      <span>{option.description}</span>
    </label>
  ))}
</div>;
```

---

## Token Architecture

### Primitive Tokens Added

```jsonc
// packages/design-tokens/tokens/primitive/colors.json
"oled": {
  "black":    { "$value": "#000000", "$type": "color" },
  "surface":  { "$value": "#0A0A0A", "$type": "color" },
  "elevated": { "$value": "#111111", "$type": "color" }
}
```

### Semantic Token File

Source: `packages/design-tokens/tokens/semantic/colors.dark-oled.json`

### Build Outputs

| Platform      | File                                    | Selector                     |
| ------------- | --------------------------------------- | ---------------------------- |
| Web (CSS)     | `build/web/tokens-dark-oled.css`        | `[data-theme="dark-oled"]`   |
| iOS (Swift)   | `build/ios/FinanceTokensDarkOLED.swift` | `FinanceTokensDarkOLED` enum |
| Android (XML) | `build/android/colors-night-oled.xml`   | Night-OLED qualifier         |

### Style Dictionary Build

The OLED variant is built as a third theme alongside light and dark:

```bash
node packages/design-tokens/config/style-dictionary.config.mjs
# ✅ Design tokens built successfully (light + dark + dark-oled)!
```

---

## Differences from Standard Dark Mode

| Aspect               | Standard Dark      | OLED Dark                | Rationale                                         |
| -------------------- | ------------------ | ------------------------ | ------------------------------------------------- |
| Background primary   | `#030712`          | `#000000`                | OLED pixel-off battery saving                     |
| Background secondary | `#111827`          | `#0A0A0A`                | Minimal luminance for surface differentiation     |
| Background elevated  | `#1F2937`          | `#111111`                | Low-lift surfaces stay near black                 |
| Border default       | `#374151` (2.04:1) | `#6B7280` (4.35:1)       | Raised to 3:1+ for WCAG AA UI compliance on black |
| Text disabled        | `#4B5563`          | `#6B7280`                | Improved readability on pure black                |
| Text inverse         | `#111827`          | `#000000`                | Matches OLED primary background                   |
| Elevation strategy   | Drop shadows       | Luminous border outlines | Shadows invisible on true black                   |

All other tokens (text, interactive, status, amount, chart) remain identical to
the standard dark theme.

---

## Accessibility Notes

1. **WCAG AA compliance** — Every non-exempt foreground/background pairing meets
   the required contrast ratio (4.5:1 normal text, 3:1 large text / UI).
2. **Disabled state exemption** — Disabled interactive elements (`neutral-600`,
   2.79:1) and disabled text (`neutral-500`, 4.35:1) are exempt per WCAG 2.1
   SC 1.4.3 but are still kept as readable as practical.
3. **Color is not sole indicator** — Status information uses icons, labels, and
   patterns in addition to color (unchanged from other themes).
4. **Halation awareness** — Pure white text on true black can cause halation
   (text bloom) for some users. The primary text color `#F9FAFB` is slightly
   off-white to mitigate this effect. Users experiencing discomfort should switch
   to the standard dark theme.
5. **Reduced motion** — The `prefers-reduced-motion: reduce` media query
   applies equally to all themes.

---

## Platform Support

| Platform       | Mechanism                               | Status                |
| -------------- | --------------------------------------- | --------------------- |
| Web            | `[data-theme="dark-oled"]` CSS selector | ✅ Implemented        |
| iOS            | `FinanceTokensDarkOLED.swift` enum      | 🔧 Build output ready |
| Android        | `colors-night-oled.xml` resource        | 🔧 Build output ready |
| Windows (XAML) | Future: `FinanceTokensDarkOLED.xaml`    | 📋 Planned            |

---

## Related Files

- `packages/design-tokens/tokens/primitive/colors.json` — OLED primitive colors
- `packages/design-tokens/tokens/semantic/colors.dark-oled.json` — OLED semantic tokens
- `packages/design-tokens/config/style-dictionary.config.mjs` — Build config
- `packages/design-tokens/build/web/tokens-dark-oled.css` — Generated CSS
- `apps/web/src/theme/tokens.css` — CSS imports and media queries
- `apps/web/src/hooks/useTheme.ts` — Theme toggle hook
