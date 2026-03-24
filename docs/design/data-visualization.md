# Financial Data Visualization Guidelines

> Design specification for all charts, graphs, and data visualizations in the
> Finance application. These guidelines ensure accessible, colorblind-safe,
> platform-native, and financially accurate visual representations across iOS,
> Android, Web, and Windows.

**Status:** Active
**Issue:** [#311](https://github.com/nicholasgubbins/finance-management/issues/311)
**Last updated:** 2025-07-04

---

## Table of Contents

1. [Chart Type Selection](#1-chart-type-selection)
2. [Color System](#2-color-system)
3. [Typography in Charts](#3-typography-in-charts)
4. [Responsive Behavior](#4-responsive-behavior)
5. [Accessibility](#5-accessibility)
6. [Currency Display](#6-currency-display)
7. [Empty, Loading & Error States](#7-empty-loading--error-states)
8. [Animation & Motion](#8-animation--motion)
9. [Implementation Reference](#9-implementation-reference)

---

## 1. Chart Type Selection

Choose the chart type based on the **financial question** the user is answering.
The guiding principle from our UX design principles applies: _"Clarity Over
Completeness — show the most important information first, details on demand."_

### Decision Matrix

| Financial Question                            | Chart Type       | Component Reference               | Expertise Tier |
| --------------------------------------------- | ---------------- | --------------------------------- | -------------- |
| "Where does my money go?"                     | Bar chart        | `SpendingBarChart`                | 🌱 📊 🧠       |
| "How is my spending split across categories?" | Pie chart        | `CategoryPieChart`                | 📊 🧠          |
| "How does my budget break down?"              | Donut chart      | `BudgetDonutChart`                | 🌱 📊 🧠       |
| "How has my spending changed over time?"      | Line chart       | `TrendLineChart`                  | 📊 🧠          |
| "What's my income vs. expenses trend?"        | Multi-line chart | `TrendLineChart` (multi-series)   | 📊 🧠          |
| "How much of my budget have I used?"          | Donut chart      | `BudgetDonutChart` (center label) | 🌱 📊 🧠       |

### When to Use Each Chart Type

#### Bar Chart — `SpendingBarChart`

- **Best for:** Comparing discrete categories (spending per category, monthly
  totals)
- **Data shape:** 2–12 categorical items with a single numeric measure
- **Avoid when:** Comparing more than 12 categories (group into "Other")
- **Financial context:** Monthly spending by category, account balances
  comparison, budget vs. actual

#### Line Chart — `TrendLineChart`

- **Best for:** Showing change over time (daily, weekly, monthly trends)
- **Data shape:** Continuous time-series with 1–4 overlaid series
- **Avoid when:** Fewer than 3 data points (use a bar chart instead)
- **Financial context:** Income vs. expenses over months, net worth trend,
  spending trajectory, goal progress over time

#### Pie / Donut Chart — `CategoryPieChart` / `BudgetDonutChart`

- **Best for:** Showing proportional composition (part-of-whole relationships)
- **Data shape:** 2–7 slices; combine remainder into "Other" beyond 7
- **Avoid when:** Comparing values across time or when slices are nearly equal
  (differences become hard to perceive)
- **Financial context:** Budget allocation breakdown, category spending
  distribution
- **Donut variant:** Preferred over pie — the center label shows the total
  (e.g., `$2,200`) and the ring draws attention to proportions

#### Area Chart (future)

- **Best for:** Showing cumulative trends where total volume matters
- **Data shape:** Time-series with stacked categories
- **Financial context:** Stacked expense categories over time, savings
  accumulation

### Expertise Tier Adaptations

Per the [Product Identity](./product-identity.md) tier system, chart complexity
scales with user expertise:

| Tier               | Chart Behavior                                                        |
| ------------------ | --------------------------------------------------------------------- |
| 🌱 Getting Started | Simple bar or donut charts only. Large labels. No multi-series lines. |
| 📊 Comfortable     | Full chart set. Tooltips with context. Default for most users.        |
| 🧠 Advanced        | Multi-axis, comparison overlays, raw data table toggle.               |

---

## 2. Color System

### 2.1 CVD-Safe Palette

All chart colors use the **IBM Design Language CVD-safe palette**, defined in
[`chart-palette.ts`](../../apps/web/src/components/charts/chart-palette.ts).
This palette is safe for protanopia, deuteranopia, and tritanopia.

```typescript
// Source of truth: apps/web/src/components/charts/chart-palette.ts
export const CHART_COLORS = [
  '#648FFF', // Blue
  '#FE6100', // Orange
  '#785EF0', // Purple
  '#FFB000', // Gold
  '#DC267F', // Magenta
  '#009E73', // Teal
] as const;
```

| Swatch | Name    | Hex       | Light Mode Contrast (on #FFF) | Dark Mode Contrast (on #111827) |
| ------ | ------- | --------- | ----------------------------- | ------------------------------- |
| 🔵     | Blue    | `#648FFF` | 3.5:1 (UI ✅)                 | 4.5:1 ✅                        |
| 🟠     | Orange  | `#FE6100` | 3.3:1 (UI ✅)                 | 5.9:1 ✅                        |
| 🟣     | Purple  | `#785EF0` | 3.9:1 (UI ✅)                 | 4.6:1 ✅                        |
| 🟡     | Gold    | `#FFB000` | 2.1:1 (with pattern ✅)       | 8.6:1 ✅                        |
| 🔴     | Magenta | `#DC267F` | 4.6:1 ✅                      | 5.3:1 ✅                        |
| 🟢     | Teal    | `#009E73` | 3.1:1 (UI ✅)                 | 5.0:1 ✅                        |

> **Rule:** Colors that fall below 4.5:1 contrast for text MUST use the color
> only for filled regions (bars, slices, areas) and NOT for standalone text
> labels. All chart colors meet the 3:1 minimum for UI components (WCAG AA).

### 2.2 Color Assignment Rules

1. **Consistent mapping:** The same category always gets the same color within
   a session. Use the `chartColor(index)` helper with a stable category index.
2. **Maximum 6 colors:** If more than 6 categories exist, group tail categories
   into an "Other" slice using a neutral gray (`#9CA3AF`).
3. **Wrapping:** The `chartColor()` function wraps via modulo — this is a safety
   net, not a design goal. Prefer grouping over wrapping.

### 2.3 Semantic Colors for Financial Concepts

These semantic colors are used **only when accompanied by text labels and/or
icons** — never as the sole indicator:

| Concept            | Light Mode | Dark Mode | Secondary Indicator       |
| ------------------ | ---------- | --------- | ------------------------- |
| Income / Positive  | `#059669`  | `#34D399` | ↑ arrow icon + label text |
| Expense / Negative | `#DC2626`  | `#F87171` | ↓ arrow icon + label text |
| Neutral / On Track | `#6B7280`  | `#9CA3AF` | — dash icon + label text  |
| Over Budget        | `#D97706`  | `#FBBF24` | ⚠ icon + label text       |

> **Critical Rule:** Per our [UX Principles](./ux-principles.md), Finance uses
> **non-judgmental** language. Over-budget states use amber (caution), not red
> (alarm). The app never "shames" — it informs.

### 2.4 Never Color Alone

Information MUST NOT be conveyed through color alone. Every colored element must
have at least one additional differentiator:

- **Bar charts:** Text labels on axis + tooltip values
- **Pie/donut charts:** Labels on slices (when > 5% of total) + legend with
  text labels
- **Line charts:** Distinct stroke patterns (solid, dashed, dotted) + legend
  labels
- **Status indicators:** Icon + text label alongside color

The `patternId()` helper in `chart-palette.ts` supports SVG pattern overlays
for additional differentiation.

### 2.5 Theme Support

All chart colors must work across three themes:

| Theme         | Background Token                         | Text Token                         |
| ------------- | ---------------------------------------- | ---------------------------------- |
| Light         | `--color-background-primary` (`#FFFFFF`) | `--color-text-primary` (`#111827`) |
| Dark          | `--color-background-primary` (`#111827`) | `--color-text-primary` (`#F9FAFB`) |
| High Contrast | `--color-background-primary` (`#000000`) | `--color-text-primary` (`#FFFFFF`) |

Chart components read these tokens via CSS custom properties. See the
`BudgetDonutChart` center label for an example:

```typescript
style={{
  fill: 'var(--color-text-primary, #111827)',
}}
```

---

## 3. Typography in Charts

### 3.1 Type Scale for Chart Elements

All chart typography uses CSS custom properties that map to platform-native type
ramps via design tokens.

| Element       | Size                                | Weight                                | Color Token               | Example                |
| ------------- | ----------------------------------- | ------------------------------------- | ------------------------- | ---------------------- |
| Chart title   | `1rem`                              | 600                                   | `--color-text-primary`    | "Spending by category" |
| Axis labels   | `12px`                              | 400                                   | `--color-text-secondary`  | "Jan", "Feb", "$500"   |
| Data labels   | `11px`                              | 500                                   | `--color-text-primary`    | "Food" (on pie slice)  |
| Tooltip title | `13px`                              | 500                                   | `--color-text-primary`    | "Groceries"            |
| Tooltip value | `13px`                              | 600                                   | `--color-text-primary`    | "$450"                 |
| Legend text   | `12px`                              | 400                                   | `--color-text-secondary`  | "Income", "Expenses"   |
| Center label  | `1.25rem`                           | 600                                   | `--color-text-primary`    | "$2,200" (donut)       |
| Empty state   | `var(--type-scale-title-font-size)` | `var(--type-scale-title-font-weight)` | `--semantic-text-primary` | "No data yet"          |

### 3.2 Axis Label Rules

- **X-axis (categories):** Truncate labels at 12 characters with ellipsis.
  Full name appears in tooltip on hover/focus.
- **X-axis (time):** Use abbreviated month names (`Jan`, `Feb`) for monthly
  views. Use `MM/DD` for daily views within a single month.
- **Y-axis (currency):** Use `formatChartCurrency()` — integer display,
  no decimals. Prefix with currency symbol. Abbreviate large values
  (`$1.2K`, `$3.4M`).
- **Rotation:** Avoid rotated axis labels. If labels overlap, reduce the number
  of visible ticks.

### 3.3 Number Formatting in Charts

All chart number formatting MUST use the shared `formatChartCurrency()` utility:

```typescript
// apps/web/src/components/charts/chart-palette.ts
export function formatChartCurrency(value: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
```

**Rules:**

- Chart axis labels and tooltips display **whole numbers** (no cents) for
  readability
- Dollar signs, euro signs, etc. come from `Intl.NumberFormat` — never hardcode
  currency symbols
- Thousands separators are locale-aware (`,` for en-US, `.` for de-DE)

---

## 4. Responsive Behavior

### 4.1 Breakpoint Adaptations

All charts use Recharts' `ResponsiveContainer` (width `100%`) or D3 viewBox
scaling to adapt to container size.

| Breakpoint   | Width       | Chart Behavior                                                         |
| ------------ | ----------- | ---------------------------------------------------------------------- |
| Mobile       | < 640px     | Full-width, reduced margins, legends below chart, larger touch targets |
| Tablet       | 640–1024px  | Side legends, standard margins, hover tooltips + tap targets           |
| Desktop      | 1024–1280px | Full layout, hover tooltips, keyboard navigation                       |
| Wide Desktop | > 1280px    | Multi-panel layouts, charts side-by-side                               |

### 4.2 Mobile-Specific Rules

- **Touch targets:** All interactive chart elements (bars, dots, slices) must
  have a minimum hit area of **44×44 CSS pixels** (per iOS HIG) and
  **48×48dp** (per Material Design).
- **Tooltips on mobile:** Tap to show (not hover). Tap outside to dismiss.
  Tooltip must not overflow viewport.
- **Legend placement:** Below chart on mobile (not beside). Single column.
- **Y-axis width:** Reduce to `60px` on mobile (from `80px` on desktop) and
  abbreviate large values (`$1K` instead of `$1,000`).
- **Donut center labels:** Increase to `1.5rem` on mobile for readability.

### 4.3 Container Sizing

```tsx
// Standard responsive container pattern (from SpendingBarChart.tsx)
<ResponsiveContainer width="100%" height={height}>
  <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
    {/* ... */}
  </BarChart>
</ResponsiveContainer>
```

- Default chart height: `320px`
- Minimum chart height: `240px`
- Maximum chart height: `480px`
- Charts MUST NOT have a fixed width — always use `width="100%"`

---

## 5. Accessibility

### 5.1 ARIA Structure

Every chart component follows this accessibility pattern (established in our
existing components):

```tsx
<div
  ref={containerRef}
  role="figure"
  aria-label={description} // Full text description of the chart
  aria-roledescription="bar chart" // Human-readable chart type
  onKeyDown={handleKeyDown} // Arrow key navigation
>
  <h3 id={`${chartId}-title`} className="chart-title">
    {title}
  </h3>
  <p id={`${chartId}-desc`} className="sr-only">
    {description}
  </p>
  <ResponsiveContainer>
    <BarChart role="img" aria-labelledby={`${chartId}-title`} aria-describedby={`${chartId}-desc`}>
      {/* Data cells with role="listitem" and aria-label */}
    </BarChart>
  </ResponsiveContainer>
</div>
```

**Required ARIA attributes per chart:**

| Attribute              | Element          | Value                                                |
| ---------------------- | ---------------- | ---------------------------------------------------- |
| `role="figure"`        | Outer container  | Identifies the chart region                          |
| `aria-label`           | Outer container  | Full text description from `buildChartDescription()` |
| `aria-roledescription` | Outer container  | `"bar chart"`, `"line chart"`, etc.                  |
| `role="img"`           | SVG / chart root | Identifies the graphic                               |
| `aria-labelledby`      | SVG / chart root | Points to chart title `<h3>`                         |
| `aria-describedby`     | SVG / chart root | Points to `.sr-only` description                     |
| `role="listitem"`      | Each data point  | Each bar, slice, or dot                              |
| `aria-label`           | Each data point  | `"Food: $450 (56.3%)"`                               |

### 5.2 Text Descriptions

Use the `buildChartDescription()` utility to generate machine-readable
descriptions:

```typescript
// apps/web/src/components/charts/chart-palette.ts
buildChartDescription(
  'Bar chart',
  [
    { label: 'Food', value: 450 },
    { label: 'Transport', value: 200 },
  ],
  'USD',
);
// → "Bar chart showing 2 categories totalling $650. Food: $450, Transport: $200."
```

**Description patterns by chart type:**

| Chart Type | Description Pattern                                                                           |
| ---------- | --------------------------------------------------------------------------------------------- |
| Bar chart  | `"Bar chart showing {n} categories totalling {total}. {cat}: {val}, ..."`                     |
| Pie chart  | `"Pie chart showing {n} categories totalling {total}. {cat}: {val}, ..."`                     |
| Donut      | `"Donut chart showing {n} categories totalling {total}. {cat}: {val}, ..."`                   |
| Line chart | `"Line chart '{title}' with {n} data points and {m} series. {series}: range {min} to {max}."` |

### 5.3 Keyboard Navigation

All charts support keyboard navigation using the `useArrowKeyNavigation` hook
(Recharts charts) or custom `onKeyDown` handler (D3 charts):

| Key                | Action                                          |
| ------------------ | ----------------------------------------------- |
| `Tab`              | Focus enters/exits the chart                    |
| `Arrow Left/Right` | Move between data points (bars, dots) or slices |
| `Arrow Up/Down`    | Move between data points (vertical) or slices   |
| `Home`             | Jump to first data point                        |
| `End`              | Jump to last data point                         |
| `Enter/Space`      | Activate tooltip or detail view                 |
| `Escape`           | Close tooltip                                   |

**Focus management:**

- First interactive element receives `tabindex="0"`; remaining receive
  `tabindex="-1"`
- Active element receives visible focus ring:
  `stroke: var(--color-border-focus, #3B82F6); stroke-width: 3`
- Focus follows the roving tabindex pattern (see `CategoryPieChart` D3
  implementation)

### 5.4 Data Table Alternative

Every chart MUST have a data table alternative available. This can be:

1. **Visually hidden table** — `<table>` with `.sr-only` class, always present
   in the DOM for screen readers.
2. **Toggle button** — "View as table" button below the chart that swaps the
   visualization for a styled `<table>`.
3. **Expandable section** — Disclosure widget (`<details>`) below the chart.

**Recommended pattern (toggle):**

```tsx
<button aria-pressed={showTable} onClick={() => setShowTable(!showTable)}>
  {showTable ? 'View as chart' : 'View as table'}
</button>;

{
  showTable ? (
    <table aria-label={title}>
      <thead>
        <tr>
          <th scope="col">Category</th>
          <th scope="col">Amount</th>
          <th scope="col">Percentage</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.name}>
            <td>{d.name}</td>
            <td>{formatChartCurrency(d.amount, currency)}</td>
            <td>{((d.amount / total) * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <SpendingBarChart data={data} currency={currency} />
  );
}
```

### 5.5 Screen Reader Announcements

- When chart data updates, announce the change via `aria-live="polite"` on a
  status region.
- Tooltips triggered by keyboard focus should populate an `aria-live` region so
  screen readers announce the focused data point.

---

## 6. Currency Display

### 6.1 Cents-to-Dollars Conversion

The Finance app stores all monetary values in **minor units (cents)** in the
database. The `CurrencyDisplay` component
([`CurrencyDisplay.tsx`](../../apps/web/src/components/common/CurrencyDisplay.tsx))
handles this conversion:

```typescript
// CurrencyDisplay.tsx — stores amount in cents, displays in major units
const amountInMajorUnits = amount / 100;
const formatter = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
```

**Critical distinction:**

| Context               | Input Unit | Decimal Display | Utility                   |
| --------------------- | ---------- | --------------- | ------------------------- |
| `CurrencyDisplay`     | Cents      | 2 decimals      | Full precision display    |
| `formatChartCurrency` | Dollars    | 0 decimals      | Chart axis/tooltip labels |

> **⚠ Convention:** Chart components receive values in **major units
> (dollars)**, not cents. The conversion from cents to dollars must happen
> _before_ passing data to chart components. This is intentional — chart labels
> at the axis level don't need cent precision.

### 6.2 Locale-Aware Formatting

All currency formatting MUST use `Intl.NumberFormat` — never concatenate
currency symbols manually.

```typescript
// ✅ Correct — locale-aware
formatChartCurrency(1000, 'EUR', 'de-DE'); // → "1.000 €"

// ❌ Wrong — hardcoded symbol and separator
`€${value.toLocaleString()}`;
```

**Locale rules:**

| Locale  | Currency | Format Example |
| ------- | -------- | -------------- |
| `en-US` | USD      | `$1,234`       |
| `en-GB` | GBP      | `£1,234`       |
| `de-DE` | EUR      | `1.234 €`      |
| `ja-JP` | JPY      | `¥1,234`       |
| `fr-FR` | EUR      | `1 234 €`      |

### 6.3 Chart-Specific Currency Rules

- **Axis labels:** Whole numbers only, no cents (`$1,234` not `$1,234.56`)
- **Tooltips:** Whole numbers for chart tooltips (matching `formatChartCurrency`)
- **Center labels (donut):** Whole numbers (`$2,200`)
- **Data labels (pie slices):** Category name only (value in tooltip)
- **Large numbers:** Abbreviate on axes when space is constrained: `$1.2K`,
  `$3.4M`
- **Negative values:** Use locale-standard negative format (e.g., `−$500` or
  `($500)` depending on locale)

### 6.4 Sign Display for Income/Expense

When showing income and expenses together (e.g., in `TrendLineChart`), use
`signDisplay: 'exceptZero'` to clarify direction:

- Income: `+$4,000`
- Expense: `−$2,400` (uses minus sign, not hyphen)
- Zero: `$0`

Always accompany the sign with an arrow icon (↑ for income, ↓ for expense)
and text label to satisfy the "never color alone" rule.

---

## 7. Empty, Loading & Error States

### 7.1 Empty State

When a chart has no data, display the `EmptyState` component
([`EmptyState.tsx`](../../apps/web/src/components/common/EmptyState.tsx))
instead of an empty chart area.

**Pattern:**

```tsx
if (data.length === 0) {
  return (
    <EmptyState
      icon={<BarChartIcon />}
      title="No spending data yet"
      description="Add your first transaction to see spending insights here."
      action={<Button onClick={onAddTransaction}>Add Transaction</Button>}
    />
  );
}
```

**Empty state rules:**

- MUST include a descriptive title explaining _why_ the chart is empty
- SHOULD include a call-to-action that helps the user populate data
- MUST use `role="status"` and `aria-label` (provided by `EmptyState`)
- Icon is decorative (`aria-hidden="true"`)
- Use the same chart container dimensions to prevent layout shift

**Chart-specific empty messages:**

| Chart              | Title                        | Description                                               |
| ------------------ | ---------------------------- | --------------------------------------------------------- |
| `SpendingBarChart` | "No spending data yet"       | "Add your first transaction to see spending insights."    |
| `TrendLineChart`   | "Not enough data for trends" | "You'll see trends here after your second month."         |
| `BudgetDonutChart` | "No budget set up"           | "Create a budget to track your spending plan."            |
| `CategoryPieChart` | "No category data"           | "Categorize transactions to see your spending breakdown." |

The `buildChartDescription()` utility also handles empty data:

```typescript
buildChartDescription('Bar chart', []);
// → "Bar chart with no data."
```

### 7.2 Loading State

While chart data is being fetched, show a skeleton placeholder that matches the
chart's approximate shape.

**Rules:**

- Use the `LoadingSpinner` component
  ([`LoadingSpinner.tsx`](../../apps/web/src/components/common/LoadingSpinner.tsx))
  with `role="status"` and `aria-live="polite"`
- Skeleton should occupy the same dimensions as the loaded chart to prevent
  layout shift
- Announce loading state to screen readers: `aria-label="Loading spending chart"`
- Loading should not animate if `prefers-reduced-motion: reduce` is set

**Skeleton chart pattern:**

```tsx
<div
  className="chart-skeleton"
  role="status"
  aria-label="Loading spending chart"
  aria-live="polite"
  style={{ width: '100%', height: `${height}px` }}
>
  <LoadingSpinner label="Loading spending data" />
</div>
```

### 7.3 Error State

When chart data fails to load, display an inline error with retry action.

**Rules:**

- Use the `ErrorBanner` component pattern
- MUST include `role="alert"` for screen reader announcement
- Provide a "Retry" button
- Never show technical error details to end users
- Non-judgmental language: _"We couldn't load this chart"_ not
  _"Error: API failure"_

**Pattern:**

```tsx
<div role="alert" className="chart-error">
  <p>We couldn't load your spending data.</p>
  <button onClick={onRetry}>Try again</button>
</div>
```

---

## 8. Animation & Motion

### 8.1 Reduced Motion Detection

All chart components MUST check `prefers-reduced-motion` and disable animations
accordingly. This is already implemented in all existing chart components:

```typescript
// Pattern used in SpendingBarChart, BudgetDonutChart, TrendLineChart
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const disableAnimation = prefersReducedMotion();

// Recharts usage
<Bar isAnimationActive={!disableAnimation} animationDuration={600} />

// D3 usage (CategoryPieChart)
if (reducedMotion) {
  slices.attr('d', arc);
} else {
  slices.transition().duration(600).attrTween('d', /* ... */);
}
```

### 8.2 Animation Timing

| Animation Type       | Duration | Easing         | Reduced Motion Behavior |
| -------------------- | -------- | -------------- | ----------------------- |
| Chart entrance       | 600ms    | ease-out       | Instant render          |
| Tooltip appear       | 150ms    | ease-in        | Instant render          |
| Tooltip dismiss      | 100ms    | ease-out       | Instant remove          |
| Data transition      | 400ms    | ease-in-out    | Instant swap            |
| Slice expansion (D3) | 600ms    | d3.interpolate | Instant render          |
| Focus ring           | 0ms      | none           | Same (no animation)     |

### 8.3 Entrance Animation Rules

- **Bar charts:** Bars grow upward from the baseline
- **Line charts:** Line draws from left to right
- **Pie/donut charts:** Slices expand from 0° (see `CategoryPieChart` D3
  `attrTween` implementation)
- **All charts:** Entrance animation plays once on mount, not on data updates
- **Data updates:** Cross-fade or morph to new values (400ms)

### 8.4 Motion Design Principles

From our [UX Principles](./ux-principles.md): _"Minimal — meaningful
transitions only, reduced motion respected."_

- **DO:** Animate chart entrances to guide the eye to the data
- **DO:** Use transitions when data changes to show what moved
- **DON'T:** Add decorative animations (pulsing, bouncing, rotating)
- **DON'T:** Loop animations indefinitely
- **DON'T:** Animate number counters (they cause accessibility issues)
- **DON'T:** Block interaction during animation

---

## 9. Implementation Reference

### 9.1 Existing Components

The web app (`apps/web/src/components/charts/`) contains four chart components
built with two visualization libraries:

#### Recharts Components

| Component          | File                   | Library  | Chart Type | Key Props                                            |
| ------------------ | ---------------------- | -------- | ---------- | ---------------------------------------------------- |
| `SpendingBarChart` | `SpendingBarChart.tsx` | Recharts | Bar        | `data`, `currency`, `height`, `title`                |
| `BudgetDonutChart` | `BudgetDonutChart.tsx` | Recharts | Donut/Pie  | `data`, `currency`, `height`, `title`, `centerLabel` |
| `TrendLineChart`   | `TrendLineChart.tsx`   | Recharts | Line       | `data`, `series`, `currency`, `height`, `title`      |

#### D3 Components

| Component          | File                   | Library | Chart Type | Key Props                                      |
| ------------------ | ---------------------- | ------- | ---------- | ---------------------------------------------- |
| `CategoryPieChart` | `CategoryPieChart.tsx` | D3.js   | Pie        | `data`, `currency`, `width`, `height`, `title` |

### 9.2 Shared Utilities

All chart utilities live in
[`chart-palette.ts`](../../apps/web/src/components/charts/chart-palette.ts):

| Export                    | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `CHART_COLORS`            | CVD-safe color array (6 colors)              |
| `CHART_COLOR_LABELS`      | Human-readable color names for accessibility |
| `chartColor(index)`       | Get color by index with wrapping             |
| `patternId(index)`        | Generate SVG pattern ID for texture overlays |
| `formatChartCurrency()`   | Locale-aware currency formatting for charts  |
| `buildChartDescription()` | Generate accessible text description         |

### 9.3 Data Interfaces

```typescript
// SpendingBarChart
interface SpendingCategory {
  name: string; // Category label
  amount: number; // Amount in major units (dollars)
}

// BudgetDonutChart
interface BudgetSlice {
  name: string; // Slice label
  value: number; // Amount in major units (dollars)
}

// CategoryPieChart
interface CategorySlice {
  name: string; // Slice label
  value: number; // Amount in major units (dollars)
}

// TrendLineChart
interface TrendDataPoint {
  label: string; // X-axis label (e.g., "Jan")
  [seriesKey: string]: string | number; // Dynamic series values
}
interface TrendSeries {
  dataKey: string; // Key in TrendDataPoint
  name: string; // Display name in legend
}
```

### 9.4 Creating a New Chart Component

When adding a new chart type, follow this checklist:

- [ ] Use colors from `CHART_COLORS` via `chartColor(index)` — never hardcode
- [ ] Call `formatChartCurrency()` for all monetary display
- [ ] Generate description with `buildChartDescription()` or equivalent
- [ ] Wrap in `role="figure"` container with `aria-label` and
      `aria-roledescription`
- [ ] Add `role="img"` with `aria-labelledby` and `aria-describedby` to the
      SVG/chart root
- [ ] Add `role="listitem"` with `aria-label` to each data point
- [ ] Implement keyboard navigation (arrow keys, Home/End)
- [ ] Check `prefers-reduced-motion` and disable animations accordingly
- [ ] Use `ResponsiveContainer` (Recharts) or `viewBox` scaling (D3)
- [ ] Handle empty data state with `EmptyState` component
- [ ] Add `data-chart-point` attribute to interactive elements for consistent
      focus management
- [ ] Export component and types from `charts/index.ts`
- [ ] Write tests covering: render, empty state, accessibility attributes
      (follow existing test patterns)
- [ ] Support `currency` and `title` props
- [ ] Use CSS custom property tokens for theme-aware colors

### 9.5 Platform-Specific Notes

These guidelines define the specification. Platform engineers consume this spec
through design tokens — no shared UI components across platforms.

| Platform | Charting Library             | Token Format | Notes                                   |
| -------- | ---------------------------- | ------------ | --------------------------------------- |
| Web      | Recharts + D3.js             | CSS          | Reference implementation in repo        |
| iOS      | Swift Charts / Core Graphics | Swift        | Map `CHART_COLORS` to Swift `Color`     |
| Android  | MPAndroidChart / Compose     | Kotlin XML   | Map `CHART_COLORS` to `@color/`         |
| Windows  | WinUI Charts / Win2D         | XAML         | Map `CHART_COLORS` to `SolidColorBrush` |

---

## Appendix: Quick Reference Card

```
┌──────────────────────────────────────────────────────────────────┐
│  Finance — Data Visualization Checklist                         │
├──────────────────────────────────────────────────────────────────┤
│  ✅  Uses CVD-safe palette from CHART_COLORS                    │
│  ✅  Never conveys info through color alone                     │
│  ✅  Currency formatted via Intl.NumberFormat                   │
│  ✅  role="figure" + aria-label on container                    │
│  ✅  role="img" on SVG with aria-labelledby/describedby         │
│  ✅  Keyboard navigable (arrow keys, Home/End)                  │
│  ✅  prefers-reduced-motion respected                           │
│  ✅  Data table alternative available                           │
│  ✅  Empty state with EmptyState component                      │
│  ✅  ResponsiveContainer or viewBox for responsive sizing       │
│  ✅  Works in light, dark, and high-contrast themes             │
│  ✅  Non-judgmental language (no alarm/shame)                    │
│  ✅  Values in major units (dollars) — not cents                │
│  ✅  Maximum 6 colors / 7 slices before grouping                │
└──────────────────────────────────────────────────────────────────┘
```
