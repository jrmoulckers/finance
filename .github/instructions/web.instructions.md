---
applyTo: 'apps/web/**'
---

# Web App Coding Standards — Finance PWA

You are working in `apps/web/`, the Progressive Web App (PWA) for Finance.
This app uses React 19, TypeScript, Vite, and SQLite-WASM to deliver an
offline-first financial tracking experience in the browser.

## Architecture Rules

### Offline-First — Data Lives in the Browser

All financial data is stored locally in SQLite-WASM (OPFS with IndexedDB
fallback). The app must work fully without network connectivity. Never
assume a server is available for reads or writes.

### Data Access — Always Through Hooks

Components access data exclusively through custom React hooks (`useAccounts`,
`useTransactions`, `useBudgets`, `useGoals`, `useCategories`,
`useDashboardData`). Components must NEVER:

- Import repository functions directly
- Call `useDatabase()` to run raw SQL
- Import `query()`, `queryOne()`, or `execute()` from `sqlite-wasm.ts`

The only exception is form components that need to resolve a `householdId` —
these may call `queryOne()` for a single lookup query. Even then, prefer
deriving the ID from props (e.g., `selectedAccount.householdId`) when possible.

```tsx
// ✅ Correct — data access via hook
import { useAccounts } from '../hooks';
const { accounts, createAccount } = useAccounts();

// ❌ Wrong — direct repository import in a component
import { getAllAccounts } from '../db/repositories/accounts';
```

### Data Flow

Data always flows through these four layers in order:

```
DatabaseProvider → Repository → Hook → Component
```

Mutations flow the same path in reverse:

```
Component calls hook.create*() → Hook calls repo.create*() → Repo executes SQL → Hook refreshes
```

## React Hook Conventions

### Naming

- Prefix with `use` — e.g., `useAccounts`, `useTransactions`.
- Name the return type interface `Use<Entity>Result` — e.g., `UseAccountsResult`.
- Export the hook and its result type from `hooks/index.ts`.

### Return Shape

Every entity hook returns a consistent shape:

```ts
interface UseEntityResult {
  items: Entity[]; // The data (named per entity: accounts, transactions, etc.)
  loading: boolean; // true during initial load or refresh
  error: string | null; // Human-readable error message, never a thrown Error
  refresh: () => void; // Trigger a re-fetch from the local database
  createEntity: (input: CreateInput) => Entity | null;
  updateEntity: (id: SyncId, updates: UpdateInput) => Entity | null;
  deleteEntity: (id: SyncId) => boolean;
}
```

### Error Handling

Hooks capture errors in state — they never throw. This allows components to
render loading, error, and empty states declaratively.

```ts
// ✅ Correct — error captured in state
try {
  const created = repoCreateAccount(db, input);
  refresh();
  return created;
} catch (err) {
  setError(err instanceof Error ? err.message : 'Failed to create account.');
  setLoading(false);
  return null;
}
```

### Refresh Token Pattern

All hooks use a `refreshToken` state variable (a number) that increments on
`refresh()`. The data-fetching `useEffect` depends on `refreshToken`, which
triggers a re-fetch when any CRUD mutation calls `refresh()`.

```ts
const [refreshToken, setRefreshToken] = useState(0);

const refresh = useCallback(() => {
  setLoading(true);
  setRefreshToken((t) => t + 1);
}, []);

useEffect(() => {
  // Fetch data ...
}, [db, refreshToken]);
```

### Filter Stability

When a hook accepts a filter object (e.g., `useTransactions(filters)`),
callers must pass a memoized reference to avoid re-fetches on every render.
The hook serializes filters via `JSON.stringify` and depends on the resulting
string rather than the object identity.

```tsx
// ✅ Correct — memoized filter
const filters = useMemo(() => ({ accountId, type: 'EXPENSE' }), [accountId]);
const { transactions } = useTransactions(filters);

// ❌ Wrong — new object on every render causes re-fetch loop
const { transactions } = useTransactions({ accountId, type: 'EXPENSE' });
```

## Repository Conventions

### Structure

Each repository module in `db/repositories/` handles a single entity and follows
this pattern:

1. Define column list and base query constants.
2. Define `Create*Input` and `Update*Input` interfaces.
3. Implement a `map*` function that converts a raw `Row` to a typed interface.
4. Export CRUD functions: `getAll*`, `get*ById`, `create*`, `update*`, `delete*`.
5. Export specialty query functions as needed (e.g., `getTransactionsByAccount`).

### SQL Rules

- Always use **parameterized queries** — no string interpolation for values.
- Use `SQLITE_NOW_EXPRESSION` (`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`) for
  timestamps.
- Use `crypto.randomUUID()` for primary keys — IDs are generated on the client.
- Always include `WHERE deleted_at IS NULL` in reads (soft deletes).
- Writes must set `is_synced = 0` and `sync_version = 1` to flag records for
  future sync.

### Soft Deletes

Never use SQL `DELETE`. All deletions are soft deletes:

```ts
execute(
  db,
  `UPDATE account
      SET deleted_at = ${SQLITE_NOW_EXPRESSION},
          updated_at = ${SQLITE_NOW_EXPRESSION},
          sync_version = 1,
          is_synced = 0
    WHERE id = ?
      AND deleted_at IS NULL`,
  [accountId],
);
```

### Money as Cents

Monetary values are stored as integers (cents) to avoid floating-point errors.
Use the `cents()` helper from the KMP bridge to create `Cents` objects. Convert
user-entered dollar amounts with `Math.round(parseFloat(value) * 100)`.

## Form Component Conventions

### Structure

All forms render as accessible modal dialogs using a consistent pattern:

1. **Conditional rendering** — return `null` when `isOpen` is `false`.
2. **Backdrop** — clickable overlay that closes the form.
3. **Dialog panel** — `role="dialog"`, `aria-modal="true"`,
   `aria-labelledby="<form>-form-title"`.
4. **Focus trap** — `useFocusTrap(panelRef, { active: isOpen })`.
5. **Autofocus** — first input focused via `requestAnimationFrame`.
6. **State reset** — all fields reset in a `useEffect` keyed on `isOpen`.
7. **Keyboard support** — Escape closes, Enter submits.

### Props

Every form accepts `isOpen`, `onCancel`, and `onSubmit`. Additional props
supply domain data (accounts, categories) when the form needs them. The
`onSubmit` callback receives a fully validated repository input type.

### Validation

- Define a local `validate()` function that returns a `FormErrors` object.
- Run validation on submit, not on change.
- Surface errors with `aria-invalid` and `aria-describedby` linking to
  error message elements with `role="alert"`.
- Required fields use `aria-required="true"` and a visual indicator
  (`.form-group__label--required` appends `*`).

### Submission States

Track `submitting` (boolean) and `submitError` (string | null):

- Disable both Cancel and Submit buttons while `submitting` is true.
- Set `aria-busy="true"` on the Submit button.
- Change Submit button text to a progressive indicator (e.g., "Creating…").
- Display `submitError` in a `form-banner-error` element with `role="alert"`.

## CSS and Styling Conventions

### Design Tokens

All visual values (colors, spacing, typography, shadows, radii) come from CSS
custom properties defined in `src/theme/tokens.css`. Use token variables
instead of hardcoded values:

```css
/* ✅ Correct */
padding: var(--spacing-4);
color: var(--semantic-text-primary);

/* ❌ Wrong */
padding: 16px;
color: #111;
```

### CSS Files

- Form styles live in `components/forms/forms.css` — shared across all forms.
- Global layout styles live in `src/styles/`.
- Prefer plain CSS files imported alongside components over CSS modules.
- The codebase does not use CSS-in-JS or utility-class frameworks.

### Responsive Design

- Mobile-first: default styles target small screens.
- Use `@media (max-width: 480px)` for mobile-specific overrides (e.g., form
  dialogs go full-screen, buttons stack vertically).
- The app shell switches between sidebar navigation (desktop) and bottom
  navigation (mobile) — handled by `AppLayout`.

### Dark Mode

- Respect `prefers-color-scheme: dark` via media queries.
- Also support an explicit `[data-theme='dark']` attribute on `<html>`.
- Use semantic color tokens (`--semantic-background-primary`,
  `--semantic-text-primary`) which adapt automatically.

### Reduced Motion and High Contrast

- Wrap animations in `@media (prefers-reduced-motion: reduce)` and disable
  them.
- Increase border widths under `@media (prefers-contrast: more)`.

## Accessibility Requirements

### Semantics First

Use native HTML elements for their built-in accessibility:

- `<button>` for actions, never `<div onClick>`.
- `<a>` for navigation links.
- `<input>`, `<select>`, `<textarea>` for form controls.
- `<ul>` / `<ol>` with `role="list"` for lists, `role="listitem"` for items.
- `<section>` with `aria-label` for page regions.
- `<article>` for self-contained cards.

### ARIA Rules

- Add ARIA attributes only when native semantics are insufficient.
- Always pair `aria-invalid` with `aria-describedby` pointing to the error
  element.
- Use `aria-live="polite"` for status updates (balance totals, sync status).
- Use `role="alert"` for error messages that need immediate announcement.
- Use `role="status"` for loading spinners.
- Use `role="progressbar"` with `aria-valuenow`, `aria-valuemin`,
  `aria-valuemax` for progress indicators.
- All SVG icons must have `aria-hidden="true"` and `focusable="false"`.

### Keyboard Navigation

- All interactive elements must be reachable via Tab.
- Modals trap focus with `useFocusTrap`.
- Skip-to-content link is provided via `SkipToContent`.
- Route transitions manage focus via `FocusManager`.
- Escape closes dialogs and modals.

### Labels

- Every form control must have an associated `<label>` with `htmlFor`.
- Buttons with icon-only content must have `aria-label`.
- Interactive list items must have `aria-label` for their text content.

## Service Worker Conventions

The service worker lives in `src/sw/` and handles:

- **Offline caching** — static assets are cached for offline use.
- **Background Sync** — when the device comes back online,
  `useOfflineStatus` posts a `REGISTER_SYNC` message to the service worker,
  which replays queued mutations.

The `OfflineBanner` component displays a non-intrusive notification when
`navigator.onLine` is false, using `role="status"` and `aria-live="polite"`.

## Testing Conventions

### File Location

Tests are co-located with source files: `AccountsPage.test.tsx` next to
`AccountsPage.tsx`.

### Mock Strategy

- **Mock hooks, not repositories.** Tests should not depend on SQLite or the
  `DatabaseProvider`.
- **Mock form components** that internally call `useDatabase()` to avoid
  provider dependency.
- Use `vi.mock()` at the module level and `vi.mocked()` for type-safe access.
- Set mock return values in `beforeEach` to ensure test isolation.

```tsx
vi.mock('../hooks', () => ({
  useAccounts: vi.fn(),
}));

vi.mock('../components/forms', () => ({
  AccountForm: () => null,
}));
```

### What to Test

- **Pages** — loading state, error state, empty state, and data-present state.
- **Hooks** — filter logic and CRUD side effects (mock the repository layer).
- **Forms** — validation logic, submission flow, error display.
- **Components** — rendering with various prop combinations.

### Running Tests

```bash
npm run test -w apps/web      # single run
npm run test:watch -w apps/web # watch mode
```

## Dependencies

| Package               | Purpose                                   |
| --------------------- | ----------------------------------------- |
| `react` / `react-dom` | UI framework (v19)                        |
| `react-router-dom`    | Client-side routing (v7)                  |
| `recharts`            | Financial charts (bar, line, pie, donut)  |
| `d3`                  | Data visualization utilities              |
| `sql.js`              | SQLite compiled to WASM                   |
| `wa-sqlite`           | Alternative SQLite-WASM with OPFS support |

Dev dependencies include Vite, Vitest, Testing Library, Storybook, and
TypeScript. See `package.json` for the full list.
