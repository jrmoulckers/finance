# Component Library

Comprehensive reference for all shared UI components in the Finance web application. Each entry documents the component's purpose, props interface, usage examples, and accessibility features.

**Stack:** React 19 · TypeScript · Recharts · D3.js  
**Source:** [`apps/web/src/components/`](../../apps/web/src/components/)  
**Design tokens:** [`packages/design-tokens/`](../../packages/design-tokens/) ([token README](../../packages/design-tokens/README.md))  
**Visualization guidelines:** [data-visualization.md](./data-visualization.md)  
**UX principles:** [ux-principles.md](./ux-principles.md)

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Design Token Usage](#design-token-usage)
3. [Layout Components](#layout-components)
   - [AppLayout](#applayout)
   - [SidebarNavigation & BottomNavigation](#sidebarnavigation--bottomnavigation)
   - [SkipToContent](#skiptocontent)
   - [FocusManager](#focusmanager)
4. [Form Components](#form-components)
   - [TransactionForm](#transactionform)
   - [AccountForm](#accountform)
   - [BudgetForm](#budgetform)
   - [GoalForm](#goalform)
5. [Chart Components](#chart-components)
   - [Chart Palette & Utilities](#chart-palette--utilities)
   - [SpendingBarChart](#spendingbarchart)
   - [BudgetDonutChart](#budgetdonutchart)
   - [CategoryPieChart](#categorypiechart)
   - [TrendLineChart](#trendlinechart)
6. [Feedback Components](#feedback-components)
   - [LoadingSpinner](#loadingspinner)
   - [ErrorBanner](#errorbanner)
   - [ErrorBoundary](#errorboundary)
   - [EmptyState](#emptystate)
   - [ConfirmDialog](#confirmdialog)
7. [Status & Notification Components](#status--notification-components)
   - [OfflineBanner](#offlinebanner)
   - [SyncStatusBar](#syncstatusbar)
   - [UpdateBanner](#updatebanner)
   - [InstallBanner](#installbanner)
8. [Utility Components](#utility-components)
   - [CurrencyDisplay](#currencydisplay)
   - [DataExport](#dataexport)
   - [KeyboardShortcutsModal](#keyboardshortcutsmodal)
9. [Composition Patterns](#composition-patterns)
10. [Accessibility Reference](#accessibility-reference)

---

## Design Philosophy

The component library follows the Finance [UX principles](./ux-principles.md):

- **Clarity over completeness** — components surface the most important information first and disclose detail progressively.
- **3-tap transactions** — form dialogs open in modals with autofocus, Escape to cancel, and minimal required fields.
- **Non-judgmental finance** — visual components present data factually using neutral language and colorblind-safe palettes.
- **Accessibility first** — every component uses semantic HTML, ARIA attributes, focus management, keyboard navigation, and respects `prefers-reduced-motion`.

All components consume [design tokens](../../packages/design-tokens/README.md) via CSS custom properties for colors, spacing, typography, and component-specific values. This ensures visual consistency and supports light/dark theming automatically.

---

## Design Token Usage

Design tokens are organized in three tiers:

| Tier          | Path                | Purpose                                  | Example                                                 |
| ------------- | ------------------- | ---------------------------------------- | ------------------------------------------------------- |
| **Primitive** | `tokens/primitive/` | Raw values (colors, spacing, radii)      | `--color-blue-500`, `--spacing-4`                       |
| **Semantic**  | `tokens/semantic/`  | Purpose-mapped tokens with theme support | `--semantic-text-primary`, `--semantic-status-negative` |
| **Component** | `tokens/component/` | Component-specific tokens                | `--card-border-radius`, `--input-border`                |

**How components consume tokens:**

```css
/* Prefer semantic tokens over primitives */
.error-banner {
  background: var(--color-red-50);
  border: 1px solid var(--semantic-status-negative);
  border-radius: var(--border-radius-md);
  padding: var(--spacing-3) var(--spacing-4);
}
```

**Theme support:** Light tokens apply to `:root` by default. Dark tokens activate via `[data-theme="dark"]` on `<html>` or automatically via `prefers-color-scheme: dark`. See [`apps/web/src/theme/tokens.css`](../../apps/web/src/theme/tokens.css).

---

## Layout Components

Components that define the application shell, navigation structure, and focus management.

**Source:** [`apps/web/src/components/layout/`](../../apps/web/src/components/layout/)

### AppLayout

The top-level application shell that provides the responsive sidebar/bottom navigation, header, skip-link, and content area.

**Import:**

```tsx
import { AppLayout } from '@/components/layout';
```

**Props:**

| Prop         | Type                     | Required | Default | Description                                                         |
| ------------ | ------------------------ | -------- | ------- | ------------------------------------------------------------------- |
| `activePath` | `string`                 | ✅       | —       | Current route path for highlighting the active nav item             |
| `onNavigate` | `(path: string) => void` | ✅       | —       | Callback invoked when the user selects a navigation item            |
| `pageTitle`  | `string`                 | ✅       | —       | Title displayed in the header and used as the `<main>` `aria-label` |
| `children`   | `React.ReactNode`        | ✅       | —       | Page content rendered inside `<main>`                               |

**Usage:**

```tsx
<AppLayout activePath="/dashboard" onNavigate={navigate} pageTitle="Dashboard">
  <DashboardPage />
</AppLayout>
```

**Accessibility:**

- Renders a skip-to-content link (`<a href="#main-content">`) as the first focusable element
- `<main id="main-content">` serves as the skip-link target
- `<header>` has `aria-label="App header"`
- Keyboard shortcut button announces `aria-keyshortcuts="Shift+/"`
- Composes `SidebarNavigation`, `BottomNavigation`, `UpdateBanner`, `OfflineBanner`, `InstallBanner`, and `KeyboardShortcutsModal`

---

### SidebarNavigation & BottomNavigation

Responsive navigation components. `SidebarNavigation` renders on wider viewports; `BottomNavigation` renders on mobile.

**Import:**

```tsx
import { SidebarNavigation, BottomNavigation } from '@/components/layout';
```

**Props (`NavigationProps`):**

| Prop              | Type                     | Required | Default | Description                                       |
| ----------------- | ------------------------ | -------- | ------- | ------------------------------------------------- |
| `activePath`      | `string`                 | ✅       | —       | Current route path                                |
| `onNavigate`      | `(path: string) => void` | ✅       | —       | Navigation callback                               |
| `onOpenShortcuts` | `() => void`             | —        | —       | Opens the keyboard shortcuts modal (sidebar only) |

**Navigation items:** Dashboard (`/`), Accounts (`/accounts`), Transactions (`/transactions`), Budgets (`/budgets`), Goals (`/goals`).

**Accessibility:**

- `<nav aria-label="Main navigation">` wraps both variants
- Active item uses `aria-current="page"`
- Each item has an `aria-label` matching its text label
- All icons have `aria-hidden="true"`
- Sidebar uses semantic `<ul role="list">` / `<li role="listitem">` structure

---

### SkipToContent

A visually-hidden link that becomes visible on focus, allowing keyboard users to skip past navigation directly to main content.

**Import:**

```tsx
import { SkipToContent } from '@/components/layout/SkipToContent';
```

**Props:**

| Prop       | Type     | Required | Default                  | Description                          |
| ---------- | -------- | -------- | ------------------------ | ------------------------------------ |
| `targetId` | `string` | —        | `'main-content'`         | `id` of the element to receive focus |
| `label`    | `string` | —        | `'Skip to main content'` | Visible text of the skip link        |

**Usage:**

```tsx
<SkipToContent />
<nav>...</nav>
<main id="main-content">...</main>
```

**Accessibility:**

- Visually hidden until focused (`:focus-visible` CSS class)
- Programmatically moves focus to the target element using `moveFocusTo()`
- Supports Enter and Space key activation

---

### FocusManager

An invisible component that manages focus on route changes. Moves focus to the main content area and announces the new page title to screen readers.

**Import:**

```tsx
import { FocusManager } from '@/components/layout/FocusManager';
```

**Props:**

| Prop             | Type                                        | Required | Default           | Description                                     |
| ---------------- | ------------------------------------------- | -------- | ----------------- | ----------------------------------------------- |
| `targetSelector` | `string`                                    | —        | `'#main-content'` | CSS selector for the focus target               |
| `resolveTitle`   | `(pathname: string) => string \| undefined` | —        | —                 | Maps pathnames to page titles for announcements |

**Usage:**

```tsx
<BrowserRouter>
  <FocusManager resolveTitle={(path) => titles[path]} />
  <Routes>...</Routes>
</BrowserRouter>
```

**Accessibility:**

- Skips focus management on initial render (avoids stealing focus on page load)
- Announces `"Navigated to {title}"` via a live region
- 100ms delay prevents announcement before the new page renders

---

## Form Components

Modal dialog forms for creating and editing financial entities. All forms share a consistent pattern: focus trap, Escape to cancel, client-side validation with ARIA error messaging, and loading states.

**Source:** [`apps/web/src/components/forms/`](../../apps/web/src/components/forms/)

**Shared form patterns:**

- Open as modal dialogs with `role="dialog"` and `aria-modal="true"`
- Focus is trapped within the dialog using `useFocusTrap()`
- First input is autofocused on open
- Escape key cancels the dialog
- Backdrop click dismisses the form
- Validation errors use `aria-invalid` and `aria-describedby` with `role="alert"` error spans
- Submit button shows `aria-busy` during async submission
- Required fields are marked with `aria-required="true"` and visual `form-group__label--required` class

### TransactionForm

Modal form for creating or editing a financial transaction.

**Import:**

```tsx
import { TransactionForm } from '@/components/forms';
```

**Props:**

| Prop          | Type                                              | Required | Default | Description                        |
| ------------- | ------------------------------------------------- | -------- | ------- | ---------------------------------- |
| `isOpen`      | `boolean`                                         | ✅       | —       | Controls dialog visibility         |
| `onSubmit`    | `(data: CreateTransactionInput) => Promise<void>` | ✅       | —       | Callback with validated form data  |
| `onCancel`    | `() => void`                                      | ✅       | —       | Callback when user cancels         |
| `accounts`    | `Account[]`                                       | ✅       | —       | Available accounts for selection   |
| `categories`  | `Category[]`                                      | ✅       | —       | Available categories for selection |
| `initialData` | `Transaction`                                     | —        | —       | Pre-fill data for edit mode        |

**Fields:**

- **Amount** (required) — number input, `step="0.01"`, `inputMode="decimal"`
- **Description** (required) — text input, maps to `payee`
- **Type** — radio group: Expense, Income, Transfer (default: Expense)
- **Category** — optional select
- **Account** (required) — select dropdown
- **Date** — date input, defaults to today
- **Notes** — optional textarea

**Usage:**

```tsx
<TransactionForm
  isOpen={showForm}
  onSubmit={async (data) => {
    await createTransaction(data);
    setShowForm(false);
  }}
  onCancel={() => setShowForm(false)}
  accounts={accounts}
  categories={categories}
/>
```

**Accessibility:**

- Dialog labeled by `"New Transaction"` / `"Edit Transaction"` heading
- Uses Zod schema validation with per-field error messages
- Form-level submission errors rendered in a `role="alert"` banner
- `householdId` is derived from the selected account (no extra user input needed)

---

### AccountForm

Modal form for creating or editing a financial account.

**Import:**

```tsx
import { AccountForm } from '@/components/forms';
```

**Props:**

| Prop          | Type                                          | Required | Default | Description                       |
| ------------- | --------------------------------------------- | -------- | ------- | --------------------------------- |
| `isOpen`      | `boolean`                                     | ✅       | —       | Controls dialog visibility        |
| `onSubmit`    | `(data: CreateAccountInput) => Promise<void>` | ✅       | —       | Callback with validated form data |
| `onCancel`    | `() => void`                                  | ✅       | —       | Callback when user cancels        |
| `initialData` | `Account`                                     | —        | —       | Pre-fill data for edit mode       |

**Fields:**

- **Account Name** (required) — text input
- **Account Type** — select: Checking, Savings, Credit Card, Cash, Investment, Loan, Other
- **Currency** — select: USD, EUR, GBP, CAD, AUD, JPY
- **Initial Balance** — number input, defaults to `0.00`

**Usage:**

```tsx
<AccountForm
  isOpen={showForm}
  onSubmit={async (data) => {
    await createAccount(data);
    setShowForm(false);
  }}
  onCancel={() => setShowForm(false)}
/>
```

**Accessibility:**

- `householdId` is resolved from the local SQLite database automatically
- Error banner if no household exists blocks submission with an explanation

---

### BudgetForm

Modal form for creating or editing a budget.

**Import:**

```tsx
import { BudgetForm } from '@/components/forms';
```

**Props:**

| Prop          | Type                                         | Required | Default | Description                                    |
| ------------- | -------------------------------------------- | -------- | ------- | ---------------------------------------------- |
| `isOpen`      | `boolean`                                    | ✅       | —       | Controls dialog visibility                     |
| `onSubmit`    | `(data: CreateBudgetInput) => Promise<void>` | ✅       | —       | Callback with validated data (amount in cents) |
| `onCancel`    | `() => void`                                 | ✅       | —       | Callback when user cancels                     |
| `categories`  | `Category[]`                                 | ✅       | —       | Available categories                           |
| `initialData` | `Budget`                                     | —        | —       | Pre-fill data for edit mode                    |

**Fields:**

- **Category** (required) — select dropdown (first focused field)
- **Amount** (required) — number input, entered as dollars, stored as integer cents
- **Period** — select: Monthly (default), Weekly, Biweekly, Quarterly, Yearly
- **Start Date** — date input, defaults to first of the current month

**Usage:**

```tsx
<BudgetForm
  isOpen={showForm}
  onSubmit={async (data) => {
    await createBudget(data);
    setShowForm(false);
  }}
  onCancel={() => setShowForm(false)}
  categories={categories}
/>
```

**Accessibility:**

- Budget name is auto-derived from the selected category
- Dollar-to-cents conversion happens on submit — the user always works in major units

---

### GoalForm

Modal form for creating or editing a savings goal.

**Import:**

```tsx
import { GoalForm } from '@/components/forms';
```

**Props:**

| Prop          | Type                                       | Required | Default | Description                  |
| ------------- | ------------------------------------------ | -------- | ------- | ---------------------------- |
| `isOpen`      | `boolean`                                  | ✅       | —       | Controls dialog visibility   |
| `onSubmit`    | `(data: CreateGoalInput) => Promise<void>` | ✅       | —       | Callback with validated data |
| `onCancel`    | `() => void`                               | ✅       | —       | Callback when user cancels   |
| `initialData` | `Goal`                                     | —        | —       | Pre-fill data for edit mode  |

**Fields:**

- **Name** (required) — text input, placeholder "Emergency Fund"
- **Target Amount** (required) — number input
- **Current Amount** — number input, defaults to `0.00`
- **Target Date** — date input with `min` set to tomorrow (create mode only)
- **Description** — optional textarea

**Usage:**

```tsx
<GoalForm
  isOpen={showForm}
  onSubmit={async (data) => {
    await createGoal(data);
    setShowForm(false);
  }}
  onCancel={() => setShowForm(false)}
/>
```

**Accessibility:**

- In create mode, target date must be in the future (validation error if not)
- `householdId` is resolved from the local database automatically

---

## Chart Components

Data visualization components for financial insights. All charts follow the [data visualization guidelines](./data-visualization.md) and use a colorblind-safe (CVD-safe) palette.

**Source:** [`apps/web/src/components/charts/`](../../apps/web/src/components/charts/)

**Shared chart features:**

- CVD-safe IBM Design Language color palette
- `role="figure"` wrapper with `aria-label` containing a full text description
- `aria-roledescription` identifies the chart type (e.g., `"bar chart"`)
- Individual data points have `role="listitem"` with `aria-label` showing value and percentage
- Arrow-key navigation between data points (roving tabindex pattern)
- `prefers-reduced-motion` respected — animations disabled when the user preference is set
- Tooltips styled with design tokens for light/dark theme consistency

### Chart Palette & Utilities

Shared color palette and formatting utilities used by all chart components.

**Import:**

```tsx
import {
  CHART_COLORS,
  chartColor,
  formatChartCurrency,
  buildChartDescription,
} from '@/components/charts';
```

**Palette (CVD-safe):**

| Index | Name    | Hex       | Swatch |
| ----- | ------- | --------- | ------ |
| 0     | Blue    | `#648FFF` | 🔵     |
| 1     | Orange  | `#FE6100` | 🟠     |
| 2     | Purple  | `#785EF0` | 🟣     |
| 3     | Gold    | `#FFB000` | 🟡     |
| 4     | Magenta | `#DC267F` | 🔴     |
| 5     | Teal    | `#009E73` | 🟢     |

**Utility functions:**

| Function                | Signature                                       | Description                                                |
| ----------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| `chartColor`            | `(index: number) => string`                     | Returns palette color at index (wraps around)              |
| `formatChartCurrency`   | `(value: number, currency?, locale?) => string` | Formats a number as currency using `Intl.NumberFormat`     |
| `buildChartDescription` | `(chartType, dataPoints, currency?) => string`  | Generates a full-text accessible description of chart data |

---

### SpendingBarChart

Recharts bar chart showing spending amounts by category.

**Import:**

```tsx
import { SpendingBarChart } from '@/components/charts';
```

**Props:**

| Prop       | Type                 | Required | Default                  | Description                                 |
| ---------- | -------------------- | -------- | ------------------------ | ------------------------------------------- |
| `data`     | `SpendingCategory[]` | ✅       | —                        | Array of `{ name: string; amount: number }` |
| `currency` | `string`             | —        | `'USD'`                  | ISO 4217 currency code                      |
| `height`   | `number`             | —        | `320`                    | Chart height in pixels                      |
| `title`    | `string`             | —        | `'Spending by category'` | Visible chart heading                       |

**Usage:**

```tsx
<SpendingBarChart
  data={[
    { name: 'Food', amount: 450 },
    { name: 'Transport', amount: 120 },
    { name: 'Entertainment', amount: 80 },
  ]}
  currency="USD"
/>
```

**Accessibility:**

- Container: `role="figure"` with `aria-roledescription="bar chart"`
- SVG: `role="img"` with `aria-labelledby` pointing to chart title
- Screen-reader description: `aria-describedby` links to a visually-hidden `<p>` with full data summary
- Each bar cell: `role="listitem"` with `aria-label` showing category name and formatted amount
- Horizontal arrow-key navigation between bars

---

### BudgetDonutChart

Recharts donut chart for budget allocation breakdown with a center label.

**Import:**

```tsx
import { BudgetDonutChart } from '@/components/charts';
```

**Props:**

| Prop          | Type            | Required | Default              | Description                                |
| ------------- | --------------- | -------- | -------------------- | ------------------------------------------ |
| `data`        | `BudgetSlice[]` | ✅       | —                    | Array of `{ name: string; value: number }` |
| `currency`    | `string`        | —        | `'USD'`              | ISO 4217 currency code                     |
| `height`      | `number`        | —        | `320`                | Chart height in pixels                     |
| `title`       | `string`        | —        | `'Budget breakdown'` | Visible chart heading                      |
| `centerLabel` | `string`        | —        | Formatted total      | Text displayed in the donut center         |

**Usage:**

```tsx
<BudgetDonutChart
  data={[
    { name: 'Housing', value: 1500 },
    { name: 'Food', value: 600 },
    { name: 'Savings', value: 400 },
  ]}
  centerLabel="$2,500"
/>
```

**Accessibility:**

- Container: `role="figure"` with `aria-roledescription="donut chart"`
- Each slice cell: `role="listitem"` with `aria-label` showing name, amount, and percentage
- Arrow-key navigation (both axes) through slices
- Auto-generated text description includes all category totals

---

### CategoryPieChart

Custom D3.js pie chart for category breakdowns with animated transitions.

**Import:**

```tsx
import { CategoryPieChart } from '@/components/charts';
```

**Props:**

| Prop       | Type              | Required | Default                  | Description                                |
| ---------- | ----------------- | -------- | ------------------------ | ------------------------------------------ |
| `data`     | `CategorySlice[]` | ✅       | —                        | Array of `{ name: string; value: number }` |
| `currency` | `string`          | —        | `'USD'`                  | ISO 4217 currency code                     |
| `width`    | `number`          | —        | `320`                    | Chart width in pixels                      |
| `height`   | `number`          | —        | `320`                    | Chart height in pixels                     |
| `title`    | `string`          | —        | `'Spending by category'` | Visible chart heading                      |

**Usage:**

```tsx
<CategoryPieChart
  data={[
    { name: 'Groceries', value: 320 },
    { name: 'Dining', value: 180 },
    { name: 'Coffee', value: 45 },
  ]}
/>
```

**Accessibility:**

- Container: `role="figure"` with `aria-roledescription="pie chart"`
- SVG rendered directly with D3, using `role="img"` and `aria-labelledby` / `aria-describedby`
- Each slice: `role="listitem"` with `aria-label` showing name, amount, and percentage
- Focus ring on slices via D3 event listeners (stroke changes on focus/blur)
- Arrow-key navigation implemented via `onKeyDown` on the `<svg>` element
- Labels only shown for slices > 5% of total (avoids visual clutter)
- Animations use `d3.interpolate` with `prefers-reduced-motion` check

---

### TrendLineChart

Recharts multi-series line chart for financial trends over time.

**Import:**

```tsx
import { TrendLineChart } from '@/components/charts';
```

**Props:**

| Prop       | Type               | Required | Default             | Description                                                     |
| ---------- | ------------------ | -------- | ------------------- | --------------------------------------------------------------- |
| `data`     | `TrendDataPoint[]` | ✅       | —                   | Array of `{ label: string; [seriesKey]: number }`               |
| `series`   | `TrendSeries[]`    | ✅       | —                   | Array of `{ dataKey: string; name: string }` defining each line |
| `currency` | `string`           | —        | `'USD'`             | ISO 4217 currency code                                          |
| `height`   | `number`           | —        | `320`               | Chart height in pixels                                          |
| `title`    | `string`           | —        | `'Trend over time'` | Visible chart heading                                           |

**Data model:**

```tsx
interface TrendDataPoint {
  label: string; // X-axis label (e.g., "Jan", "Feb")
  [seriesKey: string]: string | number; // Each series value
}

interface TrendSeries {
  dataKey: string; // Key in TrendDataPoint matching a series
  name: string; // Display name shown in the legend
}
```

**Usage:**

```tsx
<TrendLineChart
  data={[
    { label: 'Jan', income: 5000, expenses: 3200 },
    { label: 'Feb', income: 5200, expenses: 3100 },
    { label: 'Mar', income: 4800, expenses: 3400 },
  ]}
  series={[
    { dataKey: 'income', name: 'Income' },
    { dataKey: 'expenses', name: 'Expenses' },
  ]}
/>
```

**Accessibility:**

- Screen-reader description includes series count, data point count, and min/max range per series
- Includes a `<Legend>` component for visual series identification
- Data points have `tabIndex={-1}` and `data-chart-point` for keyboard navigation
- Horizontal arrow-key navigation through data points

---

## Feedback Components

Components that communicate system state, errors, and empty conditions to the user.

**Source:** [`apps/web/src/components/common/`](../../apps/web/src/components/common/)

### LoadingSpinner

An animated spinner indicating that content is loading.

**Import:**

```tsx
import { LoadingSpinner } from '@/components/common';
```

**Props:**

| Prop        | Type     | Required | Default     | Description                                   |
| ----------- | -------- | -------- | ----------- | --------------------------------------------- |
| `size`      | `number` | —        | `40`        | Width and height of the spinner SVG in pixels |
| `label`     | `string` | —        | `'Loading'` | Accessible label announced by screen readers  |
| `className` | `string` | —        | `''`        | Additional CSS class names                    |

**Usage:**

```tsx
<LoadingSpinner />
<LoadingSpinner size={24} label="Loading transactions" />
```

**Accessibility:**

- `role="status"` with `aria-live="polite"` announces loading state
- Visually hidden `<span>` provides the screen reader text
- SVG is marked `aria-hidden="true"` (decorative)
- Spinner uses CSS `@keyframes` animation, auto-disabled by `prefers-reduced-motion`

---

### ErrorBanner

A dismissible inline banner for non-fatal error messages.

**Import:**

```tsx
import { ErrorBanner } from '@/components/common';
```

**Props:**

| Prop        | Type         | Required | Default | Description                               |
| ----------- | ------------ | -------- | ------- | ----------------------------------------- |
| `message`   | `string`     | ✅       | —       | Error message text                        |
| `onRetry`   | `() => void` | —        | —       | If provided, renders a "Retry" button     |
| `onDismiss` | `() => void` | —        | —       | If provided, renders a dismiss (×) button |
| `className` | `string`     | —        | `''`    | Additional CSS class names                |

**Usage:**

```tsx
<ErrorBanner
  message="Failed to load transactions"
  onRetry={() => refetch()}
  onDismiss={() => setError(null)}
/>
```

**Accessibility:**

- `role="alert"` ensures immediate announcement by screen readers
- Dismiss button has `aria-label="Dismiss error"`
- Error icon is `aria-hidden="true"` (decorative)
- Styled with semantic status tokens (`--semantic-status-negative`)

---

### ErrorBoundary

React class component that catches render errors in the component tree and displays a recovery UI.

**Import:**

```tsx
import { ErrorBoundary } from '@/components/common';
```

**Props:**

| Prop       | Type        | Required | Default         | Description                    |
| ---------- | ----------- | -------- | --------------- | ------------------------------ |
| `children` | `ReactNode` | ✅       | —               | Application content to protect |
| `fallback` | `ReactNode` | —        | Default message | Custom fallback UI             |

**Usage:**

```tsx
<ErrorBoundary>
  <App />
</ErrorBoundary>

<ErrorBoundary fallback={<p>Custom error message</p>}>
  <RiskyWidget />
</ErrorBoundary>
```

**Accessibility:**

- Heading receives focus after error (`tabIndex={-1}`, `ref.focus()`)
- Error details wrapped in `role="alert"` with `aria-live="assertive"`
- "Try Again" and "Return to Dashboard" actions are clearly labeled
- Error details only shown in development mode (no sensitive data in production)
- Captured errors are sent to the monitoring system via `captureError()`

---

### EmptyState

A centered placeholder shown when a list or view has no data.

**Import:**

```tsx
import { EmptyState } from '@/components/common';
```

**Props:**

| Prop          | Type              | Required | Default | Description                             |
| ------------- | ----------------- | -------- | ------- | --------------------------------------- |
| `title`       | `string`          | ✅       | —       | Heading text                            |
| `description` | `string`          | —        | —       | Supporting description text             |
| `icon`        | `React.ReactNode` | —        | —       | Decorative icon above the title         |
| `action`      | `React.ReactNode` | —        | —       | Call-to-action element (button or link) |
| `className`   | `string`          | —        | `''`    | Additional CSS class names              |

**Usage:**

```tsx
<EmptyState
  title="No transactions yet"
  description="Add your first transaction to start tracking your spending."
  action={<button onClick={openForm}>Add Transaction</button>}
/>
```

**Accessibility:**

- `<section role="status" aria-label={title}>` announces the empty state
- Icon container has `aria-hidden="true"` (decorative)
- Styled with design tokens (`--type-scale-title-font-size`, `--semantic-text-primary`)

---

### ConfirmDialog

An alert dialog that asks the user to confirm a destructive or important action.

**Import:**

```tsx
import { ConfirmDialog } from '@/components/common';
```

**Props:**

| Prop           | Type                              | Required | Default    | Description                                              |
| -------------- | --------------------------------- | -------- | ---------- | -------------------------------------------------------- |
| `isOpen`       | `boolean`                         | ✅       | —          | Controls dialog visibility                               |
| `title`        | `string`                          | ✅       | —          | Dialog heading                                           |
| `message`      | `string`                          | ✅       | —          | Explanation of the action being confirmed                |
| `confirmLabel` | `string`                          | —        | `'Delete'` | Confirm button text                                      |
| `cancelLabel`  | `string`                          | —        | `'Cancel'` | Cancel button text                                       |
| `variant`      | `'danger' \| 'warning' \| 'info'` | —        | `'danger'` | Visual style for the confirm button                      |
| `onConfirm`    | `() => void`                      | ✅       | —          | Callback on confirm                                      |
| `onCancel`     | `() => void`                      | ✅       | —          | Callback on cancel                                       |
| `isLoading`    | `boolean`                         | —        | `false`    | Shows a spinner and disables confirm during async action |

**Usage:**

```tsx
<ConfirmDialog
  isOpen={showConfirm}
  title="Delete Transaction"
  message="This action cannot be undone. Are you sure?"
  confirmLabel="Delete"
  variant="danger"
  onConfirm={handleDelete}
  onCancel={() => setShowConfirm(false)}
  isLoading={isDeleting}
/>
```

**Accessibility:**

- Uses `role="alertdialog"` with `aria-modal="true"` (forces screen readers to stay in dialog)
- `aria-labelledby` → title, `aria-describedby` → message
- Focus trap with `useFocusTrap()`, initial focus on Cancel button (safe default)
- Escape key dismisses the dialog
- Scroll lock on `document.body` while open
- Loading state announced via `announce()` with `assertive` politeness
- Confirm button: `aria-busy` during loading, `disabled` prevents double-submit

---

## Status & Notification Components

Components that communicate connectivity, sync state, and app updates.

### OfflineBanner

A non-intrusive banner displayed when the browser loses network connectivity.

**Import:**

```tsx
import { OfflineBanner } from '@/components/OfflineBanner';
```

**Props:** None. Uses the `useOfflineStatus()` hook internally.

**Usage:**

```tsx
<OfflineBanner />
```

**Accessibility:**

- `role="status"` with `aria-live="polite"` and `aria-atomic="true"`
- Hidden class applied when online — banner gracefully appears/disappears
- Icon is `aria-hidden="true"` and `focusable="false"`
- Message: "You are offline. Changes will sync when connectivity is restored."

---

### SyncStatusBar

A compact status bar showing the current data synchronization state.

**Import:**

```tsx
import { SyncStatusBar } from '@/components/common';
```

**Props:** None. Uses `useSyncStatus()` and `getUnresolvedConflicts()` internally.

**Variants:**

| Variant    | Text                              | Action            |
| ---------- | --------------------------------- | ----------------- |
| `synced`   | "All synced" + relative time      | —                 |
| `pending`  | "{n} pending changes"             | "Sync now" button |
| `syncing`  | "Syncing…"                        | — (spinner icon)  |
| `error`    | "Sync failed"                     | "Retry" button    |
| `offline`  | "Offline — changes saved locally" | —                 |
| `conflict` | "{n} conflicts need attention"    | —                 |

**Usage:**

```tsx
<SyncStatusBar />
```

**Accessibility:**

- `role="status"` with `aria-live="polite"` and `aria-atomic="true"`
- Action buttons have descriptive `aria-label` attributes (e.g., "Retry failed sync")
- Icons are `aria-hidden="true"` with `focusable="false"`
- Syncing icon has a CSS spinning animation class

---

### UpdateBanner

Announces when a new service worker version is available and provides an "Update now" button.

**Import:**

```tsx
import { UpdateBanner } from '@/components/common';
```

**Props:** None. Uses `useServiceWorkerUpdate()` internally.

**Usage:**

```tsx
<UpdateBanner />
```

**Accessibility:**

- `role="status"` with `aria-live="polite"` and `aria-atomic="true"`
- "Update now" button: `aria-label="Update the app now and reload to the latest version"`
- "Dismiss" button: `aria-label="Dismiss update notification"`
- Renders nothing when no update is available or after dismissal

---

### InstallBanner

A bottom-of-screen banner prompting PWA installation. Only renders when the browser has fired `beforeinstallprompt` and the user has not previously dismissed it.

**Import:**

```tsx
import { InstallBanner } from '@/components/common';
```

**Props:** None. Uses `useInstallPrompt()` internally.

**Usage:**

```tsx
<InstallBanner />
```

**Accessibility:**

- `<aside role="complementary" aria-label="Install application">`
- Dismiss button: `aria-label="Dismiss install banner"`
- All elements are keyboard-accessible
- Dismiss persists to `localStorage` across sessions
- Respects `prefers-reduced-motion` via CSS (no JS animation)

---

## Utility Components

### CurrencyDisplay

Formats and displays a monetary amount with locale-aware formatting, optional coloring, and sign display.

**Import:**

```tsx
import { CurrencyDisplay } from '@/components/common';
```

**Props:**

| Prop         | Type      | Required | Default        | Description                             |
| ------------ | --------- | -------- | -------------- | --------------------------------------- |
| `amount`     | `number`  | ✅       | —              | Amount in **minor units** (cents)       |
| `currency`   | `string`  | —        | `'USD'`        | ISO 4217 currency code                  |
| `locale`     | `string`  | —        | `'en-US'`      | BCP 47 locale string                    |
| `colorize`   | `boolean` | —        | `false`        | Apply green/red CSS class based on sign |
| `showSign`   | `boolean` | —        | `false`        | Show `+`/`-` sign (except zero)         |
| `className`  | `string`  | —        | `''`           | Additional CSS class names              |
| `aria-label` | `string`  | —        | Auto-generated | Custom accessible label                 |

**Usage:**

```tsx
{
  /* Displays "$45.00" */
}
<CurrencyDisplay amount={4500} />;

{
  /* Displays "-$12.50" in red with sign */
}
<CurrencyDisplay amount={-1250} colorize showSign />;

{
  /* Euro formatting */
}
<CurrencyDisplay amount={9900} currency="EUR" locale="de-DE" />;
```

> **Note:** The `amount` prop expects **minor units** (cents). The component divides by 100 internally to produce the display value.

**Accessibility:**

- Auto-generated `aria-label` includes "negative" prefix for negative amounts
- Absolute value used in the label for screen reader clarity
- Custom `aria-label` prop overrides the default when provided

---

### DataExport

Export UI that allows users to download their financial data as JSON or CSV.

**Import:**

```tsx
import { DataExport } from '@/components/DataExport';
```

**Props:**

| Prop        | Type     | Required | Default | Description                |
| ----------- | -------- | -------- | ------- | -------------------------- |
| `className` | `string` | —        | `''`    | Additional CSS class names |

**Usage:**

```tsx
<DataExport />
```

**Features:**

- Format selection buttons (JSON / CSV) with accessible labels
- Progress indicator with indeterminate animation during export
- Browser file download via Blob URL
- Success/error feedback with ARIA live regions
- Focus returns to the triggering button after dismissing an error

**Accessibility:**

- Button group has `role="group"` with `aria-labelledby`
- Progress: `role="status"` with `aria-label="Export in progress"`
- Success: `role="status"` with `aria-live="polite"`
- Error: `role="alert"` with dismiss button (`aria-label="Dismiss error"`)
- `focus-visible` outline on buttons
- Respects `prefers-reduced-motion` for the progress animation

---

### KeyboardShortcutsModal

A help dialog listing the application's keyboard shortcuts.

**Import:**

```tsx
import { KeyboardShortcutsModal } from '@/components/common';
```

**Props:**

| Prop      | Type         | Required | Default | Description                              |
| --------- | ------------ | -------- | ------- | ---------------------------------------- |
| `isOpen`  | `boolean`    | ✅       | —       | Controls dialog visibility               |
| `onClose` | `() => void` | ✅       | —       | Callback when the user closes the dialog |

**Shortcuts listed:**

| Key   | Action                    |
| ----- | ------------------------- |
| `?`   | Open the shortcuts dialog |
| `Esc` | Close open dialogs        |

**Usage:**

```tsx
<KeyboardShortcutsModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
```

**Accessibility:**

- `role="dialog"` with `aria-modal="true"`
- `aria-labelledby` → heading, `aria-describedby` → description paragraph
- Focus trap with initial focus on the Close button
- Escape key closes the dialog
- Shortcuts displayed in a semantic `<table>` with `<th scope="col">` / `<th scope="row">`
- Uses `<kbd>` elements for key names

---

## Composition Patterns

### Full Page Layout

The standard page composition nests content inside `AppLayout` with feedback components:

```tsx
import { AppLayout } from '@/components/layout';
import { ErrorBoundary, LoadingSpinner, EmptyState } from '@/components/common';
import { SyncStatusBar } from '@/components/common';

function TransactionsPage() {
  const { data, isLoading, error } = useTransactions();

  return (
    <ErrorBoundary>
      <AppLayout activePath="/transactions" onNavigate={navigate} pageTitle="Transactions">
        <SyncStatusBar />
        {isLoading && <LoadingSpinner label="Loading transactions" />}
        {error && <ErrorBanner message={error.message} onRetry={refetch} />}
        {!isLoading && data?.length === 0 && (
          <EmptyState
            title="No transactions yet"
            description="Add your first transaction to get started."
            action={<button onClick={openForm}>Add Transaction</button>}
          />
        )}
        {data && data.length > 0 && <TransactionList data={data} />}
      </AppLayout>
    </ErrorBoundary>
  );
}
```

### Dashboard with Charts

Charts compose together to build financial overview screens:

```tsx
import { SpendingBarChart, BudgetDonutChart, TrendLineChart } from '@/components/charts';

function DashboardCharts({ spending, budgets, trends, series }) {
  return (
    <div className="dashboard-grid">
      <SpendingBarChart data={spending} title="This Month's Spending" />
      <BudgetDonutChart data={budgets} title="Budget Allocation" />
      <TrendLineChart data={trends} series={series} title="Income vs Expenses" />
    </div>
  );
}
```

### Confirm-Before-Delete

Pair any delete action with `ConfirmDialog`:

```tsx
import { ConfirmDialog } from '@/components/common';

function TransactionRow({ transaction, onDelete }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <>
      <button onClick={() => setShowConfirm(true)}>Delete</button>
      <ConfirmDialog
        isOpen={showConfirm}
        title="Delete Transaction"
        message={`Delete "${transaction.payee}" for ${transaction.amount}?`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={async () => {
          setIsDeleting(true);
          await onDelete(transaction.id);
          setIsDeleting(false);
          setShowConfirm(false);
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
```

---

## Accessibility Reference

A summary of accessibility patterns applied across the component library.

### ARIA Utilities

The app provides shared accessibility utilities in [`apps/web/src/accessibility/aria.ts`](../../apps/web/src/accessibility/aria.ts):

| Utility                   | Type     | Purpose                                                   |
| ------------------------- | -------- | --------------------------------------------------------- |
| `ariaLabel()`             | function | Set `aria-label` or `aria-labelledby` on an element       |
| `ariaDescribe()`          | function | Set `aria-describedby` on an element                      |
| `ariaLive()`              | function | Mark an element as a live region                          |
| `useArrowKeyNavigation()` | hook     | Roving tabindex arrow-key navigation (used by all charts) |
| `useFocusTrap()`          | hook     | Trap focus within a container (used by all modals)        |
| `moveFocusTo()`           | function | Programmatically move focus to an element                 |
| `getFirstFocusable()`     | function | Query the first focusable descendant                      |
| `announce()`              | function | Announce a message via a visually-hidden live region      |

### Patterns by Category

| Pattern                    | Where Used                                                             | Implementation                                                             |
| -------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Focus trap**             | All modals (forms, ConfirmDialog, KeyboardShortcutsModal)              | `useFocusTrap()` hook                                                      |
| **Roving tabindex**        | All chart data points                                                  | `useArrowKeyNavigation()` hook                                             |
| **Live regions**           | LoadingSpinner, OfflineBanner, SyncStatusBar, UpdateBanner, DataExport | `role="status"` + `aria-live="polite"`                                     |
| **Alert regions**          | ErrorBanner, form-level errors, ErrorBoundary                          | `role="alert"` or `aria-live="assertive"`                                  |
| **Skip navigation**        | AppLayout                                                              | `<a href="#main-content">` skip link                                       |
| **Route focus management** | FocusManager                                                           | Moves focus + announces on navigation                                      |
| **Reduced motion**         | All charts, LoadingSpinner, DataExport progress                        | `prefers-reduced-motion` media query                                       |
| **High contrast**          | Global CSS                                                             | `prefers-contrast: more` increases border visibility                       |
| **Form validation**        | All forms                                                              | `aria-invalid`, `aria-describedby`, `aria-required`, `role="alert"` errors |
| **Dialog semantics**       | Forms: `role="dialog"`, ConfirmDialog: `role="alertdialog"`            | `aria-modal="true"`, `aria-labelledby`, `aria-describedby`                 |
| **Keyboard shortcuts**     | AppLayout header, SidebarNavigation                                    | `aria-keyshortcuts="Shift/"`                                               |

### WCAG 2.1 AA Compliance

| Criterion                        | Implementation                                               |
| -------------------------------- | ------------------------------------------------------------ |
| **1.3.1 Info and Relationships** | Semantic HTML, ARIA roles, labeled form controls             |
| **1.4.1 Use of Color**           | CVD-safe chart palette, never color-only meaning             |
| **1.4.3 Contrast (Minimum)**     | Design tokens provide AA-compliant color pairs               |
| **2.1.1 Keyboard**               | All components keyboard-operable, no mouse-only interactions |
| **2.4.1 Bypass Blocks**          | Skip-to-content link                                         |
| **2.4.3 Focus Order**            | Logical tab order, focus traps in modals                     |
| **2.4.7 Focus Visible**          | Global `:focus-visible` outline via design tokens            |
| **2.5.3 Label in Name**          | Button labels match accessible names                         |
| **3.3.1 Error Identification**   | Inline error messages with `aria-invalid`                    |
| **3.3.2 Labels or Instructions** | Every input has a `<label>`, required fields marked          |
| **4.1.2 Name, Role, Value**      | ARIA attributes on all custom widgets                        |
