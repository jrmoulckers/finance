# Accessibility Patterns Library — Finance

> **Status:** Living document · **Issue:** #310
> **WCAG Target:** 2.2 Level AA (AAA where practical)
> **Platforms:** Web (React/PWA) · iOS (SwiftUI) · Android (Compose) · Windows (WinUI/XAML)

This document defines the reusable accessibility patterns used across all
Finance platforms. Each pattern includes a description, code examples from
the actual codebase, and clear do/don't guidance.

Platform-native components consume these patterns — the design token system
and these specifications are the single source of truth. No shared UI
components exist across platforms.

---

## Table of Contents

1. [Focus Management](#1-focus-management)
2. [Keyboard Navigation](#2-keyboard-navigation)
3. [Screen Reader Support](#3-screen-reader-support)
4. [Form Patterns](#4-form-patterns)
5. [Color & Contrast](#5-color--contrast)
6. [Motion & Animation](#6-motion--animation)
7. [Financial Data Accessibility](#7-financial-data-accessibility)
8. [Touch Target Sizing](#8-touch-target-sizing)
9. [Platform-Specific Guidance](#9-platform-specific-guidance)

---

## 1. Focus Management

Focus management ensures keyboard and assistive technology users can always
locate and interact with the active element. Finance implements three
sub-patterns: focus trapping, route-transition focus, and skip-to-content.

### 1.1 Modal Focus Trapping

When a dialog or modal opens, focus **must** be trapped within the dialog
container. Tab / Shift+Tab cycles through focusable descendants without
leaving the container. When the modal closes, focus returns to the
previously focused element.

**Implemented in:**
[`apps/web/src/accessibility/aria.ts` → `useFocusTrap`](../apps/web/src/accessibility/aria.ts)

#### React (Web)

```tsx
// From: apps/web/src/accessibility/aria.ts
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  options: FocusTrapOptions = {},
): void {
  const { active = true, restoreFocus = true, initialFocusRef } = options;
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement;
    const container = containerRef.current;

    const initialTarget =
      initialFocusRef?.current ?? container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    initialTarget?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      if (restoreFocus) previouslyFocusedRef.current?.focus();
    };
  }, [active, containerRef, initialFocusRef, restoreFocus]);
}
```

**Usage — ConfirmDialog:**

```tsx
// From: apps/web/src/components/common/ConfirmDialog.tsx
const panelRef = useRef<HTMLDivElement>(null);
const cancelButtonRef = useRef<HTMLButtonElement>(null);

useFocusTrap(panelRef, {
  active: isOpen,
  restoreFocus: true,
  initialFocusRef: cancelButtonRef, // Focus safe action first
});
```

#### SwiftUI (iOS)

SwiftUI sheets and `.fullScreenCover` handle focus trapping natively via
the system accessibility framework. Ensure `accessibilityAddTraits` and
proper focus targets are set.

#### Compose (Android)

Compose dialogs (`AlertDialog`, `Dialog`) handle focus scoping
automatically. For custom overlays, use `Modifier.focusRequester()` and
`FocusRequester.requestFocus()`.

| ✅ Do                                             | ❌ Don't                                            |
| ------------------------------------------------- | --------------------------------------------------- |
| Trap focus within modal containers                | Allow focus to escape behind modal backdrops        |
| Restore focus to the trigger element on close     | Leave focus stranded on a hidden element            |
| Focus the least destructive action first (Cancel) | Auto-focus the destructive action (Delete)          |
| Lock body scroll when modal is open               | Allow background content to scroll under the dialog |

---

### 1.2 Route Transition Focus

When the user navigates between routes (pages), focus must move to the
main content area and the new page title must be announced.

**Implemented in:**
[`apps/web/src/components/layout/FocusManager.tsx`](../apps/web/src/components/layout/FocusManager.tsx)

#### React (Web)

```tsx
// From: apps/web/src/components/layout/FocusManager.tsx
export const FocusManager: FC<FocusManagerProps> = ({
  targetSelector = '#main-content',
  resolveTitle,
}) => {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(targetSelector);
      moveFocusTo(target);
      const title = resolveTitle?.(pathname) ?? document.title ?? 'Page loaded';
      announce(`Navigated to ${title}`);
    }, 100);
    return () => window.clearTimeout(timer);
  }, [pathname, targetSelector, resolveTitle]);

  return null;
};
```

#### SwiftUI (iOS)

Use `@FocusState` with `NavigationStack` to programmatically direct focus:

```swift
@FocusState private var isScreenTitleFocused: Bool

var body: some View {
    VStack {
        Text("Accounts")
            .financeHeading()
            .focused($isScreenTitleFocused)
    }
    .onAppear { isScreenTitleFocused = true }
}
```

| ✅ Do                                           | ❌ Don't                                           |
| ----------------------------------------------- | -------------------------------------------------- |
| Move focus to `#main-content` on route change   | Leave focus on the previous page's nav link        |
| Announce the new page title via a live region   | Navigate silently without screen reader feedback   |
| Use a short delay (100ms) to let the DOM settle | Move focus synchronously before content has loaded |
| Skip focus management on the initial page load  | Announce "Navigated to…" on first render           |

---

### 1.3 Skip to Content

A skip link allows keyboard users to bypass the navigation and jump
directly to the main content area.

**Implemented in:**
[`apps/web/src/components/layout/SkipToContent.tsx`](../apps/web/src/components/layout/SkipToContent.tsx)
and
[`apps/web/src/components/layout/AppLayout.tsx`](../apps/web/src/components/layout/AppLayout.tsx)

#### React (Web)

```tsx
// From: apps/web/src/components/layout/SkipToContent.tsx
export const SkipToContent: FC<SkipToContentProps> = ({
  targetId = 'main-content',
  label = 'Skip to main content',
}) => {
  const handleClick = useCallback(() => {
    const target = document.getElementById(targetId);
    moveFocusTo(target);
  }, [targetId]);

  return (
    <a
      href={`#${targetId}`}
      className="skip-to-content"
      onClick={(e) => {
        e.preventDefault();
        handleClick();
      }}
    >
      {label}
    </a>
  );
};

// Usage in AppLayout:
<a href="#main-content" className="skip-link">
  Skip to main content
</a>;
{
  /* ... navigation ... */
}
<main id="main-content" className="app-main" aria-label={pageTitle}>
  {children}
</main>;
```

The skip link is visually hidden by default and appears on focus (CSS
`:focus-visible`), becoming the first focusable element on the page.

| ✅ Do                                      | ❌ Don't                                  |
| ------------------------------------------ | ----------------------------------------- |
| Make skip link the first focusable element | Hide skip link with `display: none`       |
| Target the `<main>` landmark               | Skip to a non-interactive wrapper `<div>` |
| Use `moveFocusTo` for programmatic focus   | Rely on hash-link scroll behaviour alone  |

---

## 2. Keyboard Navigation

All interactive elements must be operable with a keyboard. Finance
implements roving tabindex for composite widgets, global keyboard
shortcuts, and consistent Escape handling.

### 2.1 Tab Order & Focus Visibility

Follow the natural DOM order. Never use positive `tabindex` values. Focus
indicators must be visible on all interactive elements.

**Implemented in:**
[`apps/web/src/theme/tokens.css`](../apps/web/src/theme/tokens.css)

```css
/* From: apps/web/src/theme/tokens.css */
:focus-visible {
  outline: 2px solid var(--semantic-border-focus);
  outline-offset: 2px;
}
```

```kotlin
// From: apps/android/.../WcagCompliance.kt
fun Modifier.focusableWithHighlight(
    focusColor: Color = DEFAULT_FOCUS_COLOR,
    borderWidth: Dp = FOCUS_BORDER_WIDTH,
): Modifier = composed {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()
    this
        .focusable(interactionSource = interactionSource)
        .then(
            if (isFocused) Modifier.border(width = borderWidth, color = focusColor)
            else Modifier,
        )
}
```

| ✅ Do                                               | ❌ Don't                                                |
| --------------------------------------------------- | ------------------------------------------------------- |
| Use `:focus-visible` for keyboard-only focus styles | Remove outlines with `outline: none` globally           |
| Use `tabindex="0"` for custom interactive elements  | Use `tabindex` > 0 to force tab order                   |
| Ensure 2px minimum outline with offset              | Use colour alone as a focus indicator                   |
| Style focus-visible in both light and dark themes   | Use the same focus ring colour regardless of background |

---

### 2.2 Arrow Key Navigation (Roving Tabindex)

Composite widgets (tab bars, chart data points, option lists) use the
WAI-ARIA roving tabindex pattern: only one item has `tabindex="0"`, the
rest have `tabindex="-1"`. Arrow keys move focus between items.

**Implemented in:**
[`apps/web/src/accessibility/aria.ts` → `useArrowKeyNavigation`](../apps/web/src/accessibility/aria.ts)

#### React (Web)

```tsx
// From: apps/web/src/accessibility/aria.ts
export function useArrowKeyNavigation(
  containerRef: RefObject<HTMLElement | null>,
  options: ArrowKeyNavigationOptions = {},
): { activeIndex: number; handleKeyDown: (e: ReactKeyboardEvent) => void } {
  const { orientation = 'both', loop = true, onFocus } = options;

  // Arrow keys move the active index; Home/End jump to first/last.
  // Items get tabindex="0" (active) or tabindex="-1" (inactive).
  // ...
}
```

**Usage — SpendingBarChart:**

```tsx
// From: apps/web/src/components/charts/SpendingBarChart.tsx
const containerRef = useRef<HTMLDivElement>(null);
const { handleKeyDown } = useArrowKeyNavigation(containerRef, {
  orientation: 'horizontal',
});

<div ref={containerRef} role="figure" onKeyDown={handleKeyDown}>
  {/* chart content with data-chart-point attributes */}
</div>;
```

**Supported keys:**

| Key                    | Action                                       |
| ---------------------- | -------------------------------------------- |
| `Arrow Left` / `Up`    | Move to previous item                        |
| `Arrow Right` / `Down` | Move to next item                            |
| `Home`                 | Move to first item                           |
| `End`                  | Move to last item                            |
| `Tab`                  | Exit the composite widget to the next widget |

| ✅ Do                                              | ❌ Don't                                            |
| -------------------------------------------------- | --------------------------------------------------- |
| Use roving tabindex for composite widgets          | Make every item in a list individually tabbable     |
| Support Home/End keys for quick navigation         | Only support arrow keys                             |
| Enable looping from last to first (and vice versa) | Dead-end at list boundaries                         |
| Specify `orientation` to match visual layout       | Use both axes when the widget is single-directional |

---

### 2.3 Global Keyboard Shortcuts

Finance provides global shortcuts that work when focus is outside text
fields. Shortcuts are skipped when modifier keys are held or when the
target is an editable field.

**Implemented in:**
[`apps/web/src/hooks/useKeyboardShortcuts.ts`](../apps/web/src/hooks/useKeyboardShortcuts.ts)

```tsx
// From: apps/web/src/hooks/useKeyboardShortcuts.ts
function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
  );
}

export function useKeyboardShortcuts(): UseKeyboardShortcutsResult {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowHelp(false);
        return;
      }
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
        event.preventDefault();
        setShowHelp(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { showHelp, setShowHelp };
}
```

Shortcuts are discoverable via a help modal (`?` key) with an accessible
shortcut table using proper `<th scope>` elements.

| ✅ Do                                                  | ❌ Don't                                           |
| ------------------------------------------------------ | -------------------------------------------------- |
| Skip shortcuts when focus is on editable elements      | Fire shortcuts while typing in an input field      |
| Provide `aria-keyshortcuts` on trigger buttons         | Define shortcuts without documenting them          |
| Use `?` to open a discoverable shortcuts help modal    | Rely on users memorising undocumented shortcuts    |
| Respect modifier keys (don't conflict with browser/OS) | Override Ctrl+C, Ctrl+V, or other system shortcuts |

---

### 2.4 Escape Key Handling

All overlays, modals, dialogs, and dropdown menus **must** close on
Escape. The pattern is consistent across every dialog component:

```tsx
// Pattern used in ConfirmDialog, TransactionForm, KeyboardShortcutsModal:
const handleKeyDown = useCallback(
  (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel(); // or handleClose()
    }
  },
  [handleCancel],
);
```

| ✅ Do                                           | ❌ Don't                                         |
| ----------------------------------------------- | ------------------------------------------------ |
| Close the topmost overlay on Escape             | Close all nested overlays at once                |
| Call `event.preventDefault()` to avoid bubbling | Let Escape propagate and close parent components |
| Treat Escape as equivalent to Cancel            | Treat Escape as equivalent to Confirm            |

---

## 3. Screen Reader Support

Screen reader patterns ensure that all visual information is available
non-visually via ARIA roles, live regions, and semantic markup.

### 3.1 ARIA Roles & Landmarks

Use native HTML semantics first. Apply ARIA only when native elements are
insufficient.

**Landmark structure (AppLayout):**

```tsx
// From: apps/web/src/components/layout/AppLayout.tsx
<a href="#main-content" className="skip-link">Skip to main content</a>
<aside className="app-sidebar" aria-label="Main navigation">
  <nav aria-label="Primary">...</nav>
</aside>
<header className="app-header" aria-label="App header">
  <h1>{pageTitle}</h1>
</header>
<main id="main-content" aria-label={pageTitle}>
  {children}
</main>
<nav className="bottom-nav" aria-label="Main navigation">...</nav>
```

**Dialog roles:**

| Component         | Role          | Attributes                                          |
| ----------------- | ------------- | --------------------------------------------------- |
| ConfirmDialog     | `alertdialog` | `aria-modal`, `aria-labelledby`, `aria-describedby` |
| TransactionForm   | `dialog`      | `aria-modal`, `aria-labelledby`                     |
| KeyboardShortcuts | `dialog`      | `aria-modal`, `aria-labelledby`, `aria-describedby` |

**Navigation current state:**

```tsx
// From: apps/web/src/components/layout/Navigation.tsx
<button
  aria-current={isActive ? "page" : undefined}
  aria-label={item.label}
>
```

#### SwiftUI (iOS)

```swift
// From: apps/ios/Finance/Accessibility/AccessibilityModifiers.swift
Text("Accounts")
    .financeHeading()                           // .accessibilityAddTraits(.isHeader)
    .financeLabel("Accounts section header")    // .accessibilityLabel(...)
```

#### Compose (Android)

```kotlin
// From: apps/android/.../AccessibilityExtensions.kt
Modifier.financeSemantic(label = "Account card", hint = "Double-tap to open")
Modifier.headingLevel(level = 2) // semantics { heading() }
```

| ✅ Do                                                      | ❌ Don't                                             |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| Use `<nav>`, `<main>`, `<header>` landmarks                | Use `<div role="navigation">` when `<nav>` suffices  |
| Provide unique `aria-label` values for duplicate landmarks | Use the same label for sidebar and bottom navigation |
| Use `aria-current="page"` for active navigation            | Style active state with only visual changes          |
| Mark decorative icons with `aria-hidden="true"`            | Leave decorative SVGs without hiding them            |

---

### 3.2 Live Regions & Announcements

Live regions announce dynamic content changes (balance updates, sync
status, navigation) to screen readers without moving focus.

**Implemented in:**
[`apps/web/src/accessibility/aria.ts` → `announce`](../apps/web/src/accessibility/aria.ts)

#### React (Web)

```tsx
// From: apps/web/src/accessibility/aria.ts
export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  // Creates a visually-hidden live region and updates its textContent.
  // Uses requestAnimationFrame to ensure the AT picks up the change.
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', politeness);
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.setAttribute('role', 'status');
    // Visually hidden styles (1px clip technique)
    document.body.appendChild(liveRegion);
  }
  liveRegion.textContent = '';
  requestAnimationFrame(() => {
    if (liveRegion) liveRegion.textContent = message;
  });
}
```

**Component live regions:**

```tsx
// OfflineBanner — polite status updates
<div role="status" aria-live="polite" aria-atomic="true">
  You are offline. Changes will sync when connectivity is restored.
</div>

// LoadingSpinner — polite loading state
<div role="status" aria-label={label} aria-live="polite">

// ConfirmDialog — assertive announcement during loading
announce(`${confirmLabel} in progress.`, 'assertive');

// ErrorBanner — alert role for immediate error notification
<div role="alert">{message}</div>
```

#### SwiftUI (iOS)

```swift
// From: apps/ios/Finance/Accessibility/AccessibilityModifiers.swift
// Live region for dynamic balance displays:
Text(formattedBalance)
    .financeLiveRegion()  // .accessibilityAddTraits(.updatesFrequently)

// Transient announcements:
View.announceForAccessibility("Transaction saved")
// Posts AccessibilityNotification.Announcement
```

#### Compose (Android)

```kotlin
// From: apps/android/.../AccessibilityExtensions.kt
Modifier.liveRegion()  // semantics { liveRegion = LiveRegionMode.Polite }
```

**Politeness levels:**

| Level       | When to Use                            | Example                             |
| ----------- | -------------------------------------- | ----------------------------------- |
| `polite`    | Non-urgent status updates              | "Sync complete", loading states     |
| `assertive` | Time-sensitive or critical information | Errors, destructive action progress |

| ✅ Do                                                         | ❌ Don't                                      |
| ------------------------------------------------------------- | --------------------------------------------- |
| Clear the live region before setting new text                 | Append text to an existing live region        |
| Use `requestAnimationFrame` to ensure AT registers the change | Set text synchronously without clearing       |
| Use `polite` for routine updates                              | Use `assertive` for everything                |
| Use `role="alert"` for error messages                         | Use `role="alert"` for informational messages |

---

### 3.3 Heading Hierarchy

Headings provide document structure for screen reader navigation. Finance
uses heading semantics across all platforms:

- **Web:** Native `<h1>` through `<h6>` elements
- **iOS:** `.accessibilityAddTraits(.isHeader)` via `.financeHeading()`
- **Android:** `Modifier.headingLevel()` → `semantics { heading() }`

| ✅ Do                                            | ❌ Don't                               |
| ------------------------------------------------ | -------------------------------------- |
| Use one `<h1>` per page (the page title)         | Use multiple `<h1>` elements           |
| Maintain a logical heading hierarchy             | Skip heading levels (h1 → h3)          |
| Mark section titles as headings on all platforms | Use bold text as a visual-only heading |

---

## 4. Form Patterns

Forms in Finance follow a consistent pattern for labeling, validation, error
association, and required field indication.

### 4.1 Field Labeling

Every form field must have a programmatically associated label via the
`<label>` element's `htmlFor`/`for` attribute or via `aria-labelledby`.

**Implemented in:**
[`apps/web/src/components/forms/TransactionForm.tsx`](../apps/web/src/components/forms/TransactionForm.tsx)

```tsx
// From: apps/web/src/components/forms/TransactionForm.tsx
<div className="form-group">
  <label htmlFor="txn-amount" className="form-group__label form-group__label--required">
    Amount
  </label>
  <input
    id="txn-amount"
    type="number"
    step="0.01"
    aria-required="true"
    aria-invalid={hasAmountError}
    aria-describedby={hasAmountError ? 'txn-amount-error' : undefined}
  />
  {hasAmountError && (
    <span id="txn-amount-error" className="form-error" role="alert">
      {errors.amount}
    </span>
  )}
</div>
```

---

### 4.2 Required Field Marking

Required fields are indicated both visually and programmatically:

- **Visual:** An asterisk (`*`) appended via CSS `::after` on the label
- **Programmatic:** `aria-required="true"` on the input

```css
/* From: apps/web/src/components/forms/forms.css */
.form-group__label--required::after {
  content: ' *';
  color: var(--semantic-status-negative);
}
```

| ✅ Do                                                    | ❌ Don't                                         |
| -------------------------------------------------------- | ------------------------------------------------ |
| Use both visual (`*`) and programmatic (`aria-required`) | Rely on colour alone to indicate required        |
| Explain the asterisk convention at the top of the form   | Assume users know `*` means required             |
| Set `aria-required="true"` on every required input       | Use `required` attribute without `aria-required` |

---

### 4.3 Error Association & Validation

Validation errors are linked to their fields using `aria-describedby` and
surfaced with `role="alert"` for immediate screen reader announcement.

**Pattern:**

1. Validate on submit (not on each keystroke)
2. Set `aria-invalid="true"` on the field
3. Render error text with a matching `id`
4. Link via `aria-describedby`
5. Use `role="alert"` so the error is announced immediately

```tsx
// From: apps/web/src/components/forms/TransactionForm.tsx
<input
  aria-invalid={hasAmountError}
  aria-describedby={hasAmountError ? 'txn-amount-error' : undefined}
/>;
{
  hasAmountError && (
    <span id="txn-amount-error" className="form-error" role="alert">
      Amount must be greater than zero.
    </span>
  );
}
```

**Form-level errors** use a banner at the top of the form:

```tsx
// From: apps/web/src/components/forms/TransactionForm.tsx
{
  submitError && (
    <div className="form-banner-error" role="alert">
      {submitError}
    </div>
  );
}
```

---

### 4.4 Radio Group Pattern

Radio groups use `<fieldset>` + `<legend>` for semantic grouping and a
`role="radiogroup"` container:

```tsx
// From: apps/web/src/components/forms/TransactionForm.tsx
<fieldset className="form-radio-group">
  <legend className="form-radio-group__legend">Type</legend>
  <div className="form-radio-group__options" role="radiogroup">
    {TRANSACTION_TYPES.map((t) => (
      <label key={t.value} className="form-radio-option">
        <input type="radio" name="txn-type" value={t.value} />
        <span className="form-radio-option__label">{t.label}</span>
      </label>
    ))}
  </div>
</fieldset>
```

| ✅ Do                                                      | ❌ Don't                                      |
| ---------------------------------------------------------- | --------------------------------------------- |
| Wrap radio groups in `<fieldset>` + `<legend>`             | Use a `<div>` with no group semantics         |
| Link errors to their specific field via `aria-describedby` | Show a generic "form has errors" message only |
| Use `role="alert"` for error messages                      | Use `aria-live` on individual error messages  |
| Set `aria-invalid` only when the field has an error        | Pre-set `aria-invalid="false"` on all fields  |
| Validate on submit or blur, not on every keystroke         | Announce errors on each character typed       |

---

### 4.5 Submit State

Buttons indicate loading state with `aria-busy` and the label changes to
reflect the action in progress:

```tsx
<button type="submit" disabled={submitting} aria-busy={submitting}>
  {submitting ? 'Adding…' : 'Add Transaction'}
</button>
```

---

## 5. Color & Contrast

### 5.1 WCAG AA Contrast Requirements

All text and UI components must meet WCAG AA contrast ratios:

| Element Type       | Minimum Ratio | Reference           |
| ------------------ | ------------- | ------------------- |
| Normal text        | 4.5:1         | WCAG 1.4.3          |
| Large text (≥18sp) | 3.0:1         | WCAG 1.4.3          |
| UI components      | 3.0:1         | WCAG 1.4.11         |
| Focus indicators   | 3.0:1         | WCAG 2.4.7 / 2.4.11 |

**Implemented in:**
[`apps/android/.../WcagCompliance.kt`](../apps/android/src/main/kotlin/com/finance/android/ui/accessibility/WcagCompliance.kt)

```kotlin
// From: apps/android/.../WcagCompliance.kt
fun contrastRatio(foreground: Color, background: Color): Double {
    val fgLum = foreground.luminance().toDouble()
    val bgLum = background.luminance().toDouble()
    val lighter = max(fgLum, bgLum) + 0.05
    val darker = min(fgLum, bgLum) + 0.05
    return lighter / darker
}

fun meetsContrastAA(foreground: Color, background: Color): Boolean =
    contrastRatio(foreground, background) >= 4.5

fun meetsLargeTextContrastAA(foreground: Color, background: Color): Boolean =
    contrastRatio(foreground, background) >= 3.0
```

---

### 5.2 Token-Based Color System

All colours come from design tokens. Platform components reference semantic
tokens — never raw hex values. The system provides three theme variants:

**Implemented in:**
[`apps/web/src/theme/tokens.css`](../apps/web/src/theme/tokens.css)

| Theme           | Activation                                            | Token Override Layer             |
| --------------- | ----------------------------------------------------- | -------------------------------- |
| Light (default) | `:root`                                               | `tokens.css`                     |
| Dark            | `[data-theme="dark"]` or `prefers-color-scheme: dark` | `tokens-dark.css`                |
| High Contrast   | `prefers-contrast: more`                              | Inline overrides in `tokens.css` |

```css
/* From: apps/web/src/theme/tokens.css */
/* High contrast: increase border visibility */
@media (prefers-contrast: more) {
  :root {
    --semantic-border-default: var(--color-neutral-900);
    --card-border: var(--color-neutral-900);
    --input-border: var(--color-neutral-900);
  }
}
```

**Android high-contrast theme:**
[`apps/android/.../HighContrastTheme.kt`](../apps/android/src/main/kotlin/com/finance/android/ui/accessibility/HighContrastTheme.kt)

Both light and dark high-contrast variants target WCAG AAA (7:1) ratios
wherever feasible.

---

### 5.3 Never Convey Information by Color Alone

**Rule:** Color must always be accompanied by a secondary indicator — text
label, icon, or pattern.

Examples from the codebase:

- **Currency amounts:** Color-coded green/red amounts always include a
  text label ("Income" / "Expense") or sign (+/−) for screen readers
- **Error states:** Red borders are paired with error text and
  `role="alert"`
- **Charts:** CVD-safe palette is paired with text labels on each data point
- **Navigation:** Active state uses both colour and `aria-current="page"`

| ✅ Do                                            | ❌ Don't                                          |
| ------------------------------------------------ | ------------------------------------------------- |
| Pair status colours with text labels or icons    | Use only red/green to distinguish income/expense  |
| Use patterns + colours in charts                 | Rely on colour alone to differentiate data series |
| Add `aria-label` with context ("Expense $45.00") | Omit semantic labels for colour-coded elements    |

---

## 6. Motion & Animation

### 6.1 Reduced Motion Support

All animations and transitions must respect the user's reduced motion
preference. Finance implements this at three levels:

**Level 1 — CSS global kill-switch:**

```css
/* From: apps/web/src/theme/tokens.css */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Level 2 — Component-level CSS:**

```css
/* From: apps/web/src/components/forms/forms.css */
@media (prefers-reduced-motion: reduce) {
  .form-dialog__panel {
    animation: none;
  }
  .confirm-dialog__spinner {
    display: none;
  }
  .form-input,
  .form-select,
  .form-textarea,
  .form-button {
    transition: none;
  }
}
```

**Level 3 — JavaScript runtime check for charts:**

```tsx
// From: apps/web/src/components/charts/SpendingBarChart.tsx
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Usage:
const disableAnimation = prefersReducedMotion();
<Bar isAnimationActive={!disableAnimation} animationDuration={600} />;
```

#### SwiftUI (iOS)

SwiftUI respects `UIAccessibility.isReduceMotionEnabled` and the
`@Environment(\.accessibilityReduceMotion)` property automatically for
most built-in animations.

| ✅ Do                                                         | ❌ Don't                                                |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| Respect `prefers-reduced-motion` at all three levels          | Disable only CSS animations but leave JS ones running   |
| Use `matchMedia` in JS for chart and complex animations       | Check the preference only at page load (not reactively) |
| Provide instant state changes as a fallback                   | Show a blank screen instead of the animated content     |
| Hide spinners that rely solely on animation in reduced motion | Show a frozen animation frame                           |

---

### 6.2 Meaningful Animation Guidelines

When animations are allowed, they must be purposeful:

| Animation Purpose      | Duration  | Easing        | Example                    |
| ---------------------- | --------- | ------------- | -------------------------- |
| Micro-feedback         | 100–150ms | `ease-out`    | Button press, toggle       |
| Reveal / entry         | 200–300ms | `ease-out`    | Modal open, dropdown       |
| Chart data transitions | 400–600ms | `ease-in-out` | Bar chart render           |
| Exit / dismiss         | 150–200ms | `ease-in`     | Modal close, snackbar fade |

Haptic feedback (iOS) is used as a non-visual animation complement:

```swift
// From: apps/ios/Finance/Accessibility/HapticManager.swift
func transactionSaved() { playNotification(type: .success) }
func budgetThreshold()  { /* custom double-tap + buzz pattern */ }
func goalMilestone()    { /* celebratory pattern */ }
func error()            { playNotification(type: .error) }
```

---

## 7. Financial Data Accessibility

Financial data requires special accessibility consideration: amounts must
be unambiguous, charts must have text alternatives, and formatting must
respect locale.

### 7.1 Currency Formatting for Screen Readers

Monetary amounts must produce unambiguous screen reader output. Negative
amounts must explicitly announce "negative" or "expense" rather than
relying on a minus sign that may be skipped by AT.

#### React (Web)

**Implemented in:**
[`apps/web/src/components/common/CurrencyDisplay.tsx`](../apps/web/src/components/common/CurrencyDisplay.tsx)

```tsx
// From: apps/web/src/components/common/CurrencyDisplay.tsx
const label =
  ariaLabel ?? (amount < 0 ? 'negative ' : '') + formatter.format(Math.abs(amountInMajorUnits));

<span className={`currency-display ${colorClass}`} aria-label={label}>
  {formatted}
</span>;
```

Key details:

- Amounts stored as integers in minor units (cents) → converted for display
- `Intl.NumberFormat` used with locale and currency parameters
- Explicit "negative" prefix for screen readers
- `signDisplay: 'exceptZero'` when `showSign` is true

#### SwiftUI (iOS)

```swift
// From: apps/ios/Finance/Accessibility/AccessibilityModifiers.swift
func financeCurrencyLabel(amount: Int64, currency: String) -> some View {
    let formattedAmount = Self.formatCurrency(amount: amount, currencyCode: currency)
    let label = String(localized: "Balance: \(formattedAmount)")
    return self.accessibilityLabel(Text(label))
}

// Combined label + live region for real-time balance:
func financeLiveBalance(amount: Int64, currency: String) -> some View {
    modifier(FinanceLiveBalanceModifier(amount: amount, currency: currency))
}
```

#### Compose (Android)

```kotlin
// From: apps/android/.../CurrencyText.kt
val semanticLabel = when {
    amountCents > 0L -> "Income $displayText"
    amountCents < 0L -> "Expense $displayText"
    else -> "Zero balance $displayText"
}

Text(
    text = displayText,
    color = color,
    modifier = modifier.semantics { contentDescription = semanticLabel },
)
```

| ✅ Do                                                            | ❌ Don't                                          |
| ---------------------------------------------------------------- | ------------------------------------------------- |
| Prefix negative amounts with "negative" or "expense" for AT      | Rely on the minus sign being announced            |
| Use `Intl.NumberFormat` / `NumberFormatter` for locale-awareness | Hard-code `$` or `.` as decimal separator         |
| Include context: "Balance: $1,234.56", "Income $500.00"          | Announce just the number: "1234.56"               |
| Store amounts in minor units, convert only for display           | Store as floats (floating point precision errors) |

---

### 7.2 Chart Accessibility

Charts must provide text alternatives, keyboard navigation, and
colour-blind safe palettes. Finance implements four complementary
strategies:

#### Strategy 1: IBM CVD-Safe Color Palette

**Implemented in:**
[`apps/web/src/components/charts/chart-palette.ts`](../apps/web/src/components/charts/chart-palette.ts)
and
[`apps/ios/Finance/Charts/ChartColorPalette.swift`](../apps/ios/Finance/Charts/ChartColorPalette.swift)

```tsx
// From: apps/web/src/components/charts/chart-palette.ts
export const CHART_COLORS = [
  '#648FFF', // blue
  '#FE6100', // orange
  '#785EF0', // purple
  '#FFB000', // gold
  '#DC267F', // magenta
  '#009E73', // teal
] as const;
```

```swift
// From: apps/ios/Finance/Charts/ChartColorPalette.swift
enum ChartColorPalette {
    static let blue    = Color(red: 0x64/255.0, green: 0x8F/255.0, blue: 0xFF/255.0)
    static let orange  = Color(red: 0xFE/255.0, green: 0x61/255.0, blue: 0x00/255.0)
    static let purple  = Color(red: 0x78/255.0, green: 0x5E/255.0, blue: 0xF0/255.0)
    static let gold    = Color(red: 0xFF/255.0, green: 0xB0/255.0, blue: 0x00/255.0)
    static let magenta = Color(red: 0xDC/255.0, green: 0x26/255.0, blue: 0x7F/255.0)
    static let teal    = Color(red: 0x00/255.0, green: 0x9E/255.0, blue: 0x73/255.0)

    static let ordered: [Color] = [blue, purple, magenta, orange, gold, teal]
}
```

This palette is distinguishable by users with protanopia, deuteranopia,
and tritanopia.

#### Strategy 2: Descriptive `aria-label` on the Chart Container

```tsx
// From: apps/web/src/components/charts/chart-palette.ts
export function buildChartDescription(
  chartType: string,
  dataPoints: Array<{ label: string; value: number }>,
  currency = "USD",
): string {
  // Produces: "Bar chart showing 6 categories totalling $1,855.
  //            Food: $520, Transport: $310, Entertainment: $180, ..."
}

// Applied to the container:
<div role="figure" aria-label={description} aria-roledescription="bar chart">
```

#### Strategy 3: Per-Data-Point Labels

```tsx
// From: apps/web/src/components/charts/SpendingBarChart.tsx
<Cell
  data-chart-point=""
  tabIndex={-1}
  role="listitem"
  aria-label={`${entry.name}: ${formatChartCurrency(entry.amount, currency)}`}
/>
```

#### Strategy 4: Keyboard Navigable Data Points

Charts use `useArrowKeyNavigation` so keyboard users can traverse
individual data points with arrow keys (see [Section 2.2](#22-arrow-key-navigation-roving-tabindex)).

#### SwiftUI (iOS)

```swift
// From: apps/ios/Finance/Charts/SpendingChart.swift
Chart(data) { item in
    BarMark(
        x: .value("Category", item.category),
        y: .value("Amount", item.amount)
    )
    .foregroundStyle(ChartColorPalette.color(at: item.colorIndex))
    .accessibilityLabel(item.category)
    .accessibilityValue(formattedCurrency(item.amount))
}
.accessibilityElement(children: .contain)
.accessibilityLabel("Spending by category bar chart")
```

| ✅ Do                                                    | ❌ Don't                                             |
| -------------------------------------------------------- | ---------------------------------------------------- |
| Provide a text summary of the chart data as `aria-label` | Render a chart as a flat `<img>` without alt text    |
| Make individual data points keyboard-focusable           | Require mouse hover to see data values               |
| Use `aria-roledescription` to describe the chart type    | Use `role="img"` without a description               |
| Use CVD-safe palette from design tokens on all platforms | Choose arbitrary colours per chart                   |
| Label each data point with name + formatted value        | Rely on colour + position alone for identification   |
| Provide a data table alternative for complex charts      | Offer only the visual chart with no text alternative |

---

### 7.3 Data Table Accessibility

Financial data tables (transactions, accounts) should use proper table
semantics:

```tsx
// Pattern for shortcut help (KeyboardShortcutsModal):
<table>
  <thead>
    <tr>
      <th scope="col">Shortcut</th>
      <th scope="col">Action</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">
        <kbd>?</kbd>
      </th>
      <td>Open shortcuts dialog</td>
    </tr>
  </tbody>
</table>
```

For financial data tables, extend this pattern:

| ✅ Do                                            | ❌ Don't                                       |
| ------------------------------------------------ | ---------------------------------------------- |
| Use `<th scope="col">` for column headers        | Use `<td>` with bold styling as pseudo-headers |
| Use `<th scope="row">` for row identifiers       | Use CSS grid to simulate a table layout        |
| Provide `<caption>` describing the table content | Omit table context for screen readers          |
| Right-align currency columns visually            | Omit column alignment in table CSS             |

---

### 7.4 Android Accessibility Announcement Templates

Centralised announcement strings ensure consistent screen reader output:

```kotlin
// From: apps/android/.../AccessibilityConstants.kt
object AccessibilityConstants {
    const val TOTAL_BALANCE_LABEL = "Total balance"
    const val BUDGET_PROGRESS = "Budget progress"

    fun balanceAnnouncement(formatted: String): String =
        "Balance: $formatted"

    fun budgetUsageAnnouncement(percentUsed: Int): String =
        "Budget: $percentUsed% used"

    fun goalProgressAnnouncement(percentComplete: Int): String =
        "Goal: $percentComplete% complete"

    fun transactionAnnouncement(name: String, amount: String, date: String): String =
        "Transaction: $name, $amount, $date"
}
```

| ✅ Do                                           | ❌ Don't                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| Centralise all announcement strings             | Scatter accessibility text across dozens of composables          |
| Include context in announcements (type + value) | Announce raw numbers without context                             |
| Use templates that are easily localisable       | Concatenate strings that break in RTL or agglutinative languages |

---

## 8. Touch Target Sizing

All interactive elements must meet minimum touch target requirements:

| Platform | Minimum Size | Reference                      |
| -------- | ------------ | ------------------------------ |
| iOS      | 44 × 44 pt   | Apple HIG                      |
| Android  | 48 × 48 dp   | Material 3 / WCAG 2.5.8        |
| Web      | 44 × 44 px   | WCAG 2.5.8                     |
| Windows  | 32 × 32 px   | Fluent Design (44px preferred) |

**Implemented in:**
[`apps/android/.../WcagCompliance.kt`](../apps/android/src/main/kotlin/com/finance/android/ui/accessibility/WcagCompliance.kt)

```kotlin
// From: apps/android/.../WcagCompliance.kt
val MIN_TOUCH_TARGET_DP: Dp = 48.dp

fun Modifier.minTouchTarget(minSize: Dp = MIN_TOUCH_TARGET_DP): Modifier =
    this.defaultMinSize(minWidth = minSize, minHeight = minSize)
```

**iOS — Scaled touch targets:**

```swift
// From: apps/ios/Finance/Accessibility/DynamicTypeSupport.swift
struct DynamicTypeMetrics {
    @ScaledMetric(relativeTo: .body) var minTapTarget: CGFloat = 44
}
```

| ✅ Do                                                | ❌ Don't                                         |
| ---------------------------------------------------- | ------------------------------------------------ |
| Use `minTouchTarget()` modifier on all tap targets   | Use a 24×24dp icon as the full tap target        |
| Expand hit area with padding if visual size is small | Rely solely on the visual bounds for interaction |
| Scale touch targets with Dynamic Type when possible  | Hard-code touch target size in points/dp         |

---

## 9. Platform-Specific Guidance

### 9.1 Web (React/PWA)

| Concern          | Implementation                                    | Reference File                        |
| ---------------- | ------------------------------------------------- | ------------------------------------- |
| Focus trapping   | `useFocusTrap` hook                               | `accessibility/aria.ts`               |
| Route focus      | `FocusManager` component                          | `components/layout/FocusManager.tsx`  |
| Skip link        | `SkipToContent` component                         | `components/layout/SkipToContent.tsx` |
| Keyboard nav     | `useArrowKeyNavigation` hook                      | `accessibility/aria.ts`               |
| Global shortcuts | `useKeyboardShortcuts` hook                       | `hooks/useKeyboardShortcuts.ts`       |
| Announcements    | `announce()` function                             | `accessibility/aria.ts`               |
| Focus visibility | `:focus-visible` CSS                              | `theme/tokens.css`                    |
| Reduced motion   | CSS `prefers-reduced-motion` + JS `matchMedia`    | `theme/tokens.css`, chart components  |
| Dark mode        | `prefers-color-scheme` + `[data-theme]` attribute | `theme/tokens.css`                    |
| High contrast    | `prefers-contrast: more`                          | `theme/tokens.css`, `forms.css`       |

### 9.2 iOS (SwiftUI)

| Concern          | Implementation                                                  | Reference File                               |
| ---------------- | --------------------------------------------------------------- | -------------------------------------------- |
| VoiceOver labels | `.financeLabel()`, `.financeHint()` modifiers                   | `Accessibility/AccessibilityModifiers.swift` |
| Currency a11y    | `.financeCurrencyLabel()`, `.financeLiveBalance()` modifiers    | `Accessibility/AccessibilityModifiers.swift` |
| Live regions     | `.financeLiveRegion()` modifier                                 | `Accessibility/AccessibilityModifiers.swift` |
| Headings         | `.financeHeading()` modifier                                    | `Accessibility/AccessibilityModifiers.swift` |
| Announcements    | `View.announceForAccessibility()` static method                 | `Accessibility/AccessibilityModifiers.swift` |
| Dynamic Type     | `FinanceTextStyle` enum + `.financeFont()` modifier             | `Accessibility/DynamicTypeSupport.swift`     |
| Scaled metrics   | `@ScaledMetric`, `@ClampedScaledMetric`                         | `Accessibility/DynamicTypeSupport.swift`     |
| Adaptive layout  | `AdaptiveFinanceStack` (switches HStack → VStack at a11y sizes) | `Accessibility/DynamicTypeSupport.swift`     |
| Haptic feedback  | `HapticManager` singleton                                       | `Accessibility/HapticManager.swift`          |
| Chart colours    | `ChartColorPalette` enum (IBM CVD-safe)                         | `Charts/ChartColorPalette.swift`             |

### 9.3 Android (Compose)

| Concern              | Implementation                                   | Reference File                                |
| -------------------- | ------------------------------------------------ | --------------------------------------------- |
| Content labels       | `Modifier.financeSemantic()` extension           | `ui/accessibility/AccessibilityExtensions.kt` |
| Headings             | `Modifier.headingLevel()` extension              | `ui/accessibility/AccessibilityExtensions.kt` |
| Live regions         | `Modifier.liveRegion()` extension                | `ui/accessibility/AccessibilityExtensions.kt` |
| Traversal order      | `Modifier.traversalOrder()` extension            | `ui/accessibility/AccessibilityExtensions.kt` |
| Touch targets        | `Modifier.minTouchTarget()` extension            | `ui/accessibility/WcagCompliance.kt`          |
| Focus indicators     | `Modifier.focusableWithHighlight()` extension    | `ui/accessibility/WcagCompliance.kt`          |
| Contrast checks      | `contrastRatio()`, `meetsContrastAA()` functions | `ui/accessibility/WcagCompliance.kt`          |
| High contrast        | `HighContrastTheme` composable                   | `ui/accessibility/HighContrastTheme.kt`       |
| Currency a11y        | `CurrencyText` composable with semantic labels   | `ui/components/CurrencyText.kt`               |
| Announcement strings | `AccessibilityConstants` object                  | `ui/accessibility/AccessibilityConstants.kt`  |

### 9.4 Windows (WinUI/XAML)

Windows support should follow Fluent Design accessibility patterns:

- **Narrator:** Use `AutomationProperties.Name`, `.HelpText`, `.LiveSetting`
- **High contrast:** Detect `AccessibilitySettings.HighContrast` and swap to
  high-contrast token set
- **Keyboard:** Support Tab, Arrow keys, Enter, Escape, and F6 (landmark cycling)
- **UI Automation:** Ensure all custom controls expose proper UIA patterns

---

## Appendix A: Accessibility Checklist for New Components

Before shipping any new component, verify:

- [ ] All interactive elements are keyboard operable (Tab, Enter, Space, Escape)
- [ ] Focus order is logical and follows visual layout
- [ ] Focus indicator is visible with ≥3:1 contrast ratio
- [ ] Screen reader announces the element's role, name, and state
- [ ] Dynamic content changes are announced via live regions
- [ ] Color is never the sole means of conveying information
- [ ] Text contrast meets WCAG AA (4.5:1 normal, 3:1 large)
- [ ] Touch targets meet platform minimum (44pt iOS, 48dp Android)
- [ ] Reduced motion is respected (animations disabled or minimised)
- [ ] Dark mode and high contrast themes are supported
- [ ] Currency/number formatting is locale-aware and screen-reader friendly
- [ ] Form fields have associated labels and error messages
- [ ] Required fields are indicated both visually and programmatically
- [ ] Component works with platform AT (VoiceOver, TalkBack, Narrator, NVDA)

## Appendix B: Testing Strategy

| Test Type            | Tool / Method                           | Frequency            |
| -------------------- | --------------------------------------- | -------------------- |
| Automated audit      | axe-core, Lighthouse a11y               | Every CI build       |
| Keyboard walkthrough | Manual Tab/Arrow/Escape testing         | Every PR             |
| Screen reader        | VoiceOver (iOS/Mac), TalkBack, NVDA     | Every sprint         |
| Colour contrast      | Design token validation (compile-time)  | Every token change   |
| Reduced motion       | `prefers-reduced-motion` emulation      | Every PR with motion |
| High contrast        | OS high-contrast mode                   | Every theme change   |
| Dynamic Type         | iOS/Android font scaling (largest size) | Every UI PR          |

## Appendix C: References

- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [WCAG 2.2 Guidelines](https://www.w3.org/TR/WCAG22/)
- [Apple Human Interface Guidelines — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Material Design — Accessibility](https://m3.material.io/foundations/accessible-design/overview)
- [Fluent Design — Accessibility](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/accessibility)
- [IBM CVD-Safe Palette](https://davidmathlogic.com/colorblind/)
- [Finance UX Principles](./ux-principles.md) — Principle 4: Accessibility as Foundation
