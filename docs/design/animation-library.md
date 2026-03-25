# Animation Library — Design Token Reference

> **Status**: Active  
> **Issue**: [#306](https://github.com/nicholasjamieson/finance-management/issues/306)  
> **Package**: `@finance/design-tokens`  
> **Platforms**: Web (CSS), iOS (SwiftUI), Android (Compose), Windows (Compose Desktop)

---

## Overview

The Finance animation system defines motion as **design tokens** following the [DTCG specification](https://design-tokens.github.io/community-group/format/). Tokens flow through three tiers:

```
primitive/motion.json  →  semantic/animation.json  →  component/animation.json
      (raw values)          (UI purpose mapping)       (component bindings)
```

All animations **MUST** respect `prefers-reduced-motion`, and motion **MUST NOT** be the sole means of conveying information.

---

## Token Reference

### Primitive: Duration

| Token              | Value   | CSS Custom Property  | Use Case                             |
| ------------------ | ------- | -------------------- | ------------------------------------ |
| `duration.instant` | `0ms`   | `--duration-instant` | Micro-interactions (toggles, checks) |
| `duration.fast`    | `150ms` | `--duration-fast`    | Hover states, list items, fades      |
| `duration.normal`  | `250ms` | `--duration-normal`  | Page transitions, reveals            |
| `duration.slow`    | `400ms` | `--duration-slow`    | Progress indicators, complex motion  |
| `duration.slower`  | `800ms` | `--duration-slower`  | Celebrations, skeleton shimmer       |

### Primitive: Easing

| Token               | Value                                     | CSS Custom Property   | Curve Character                |
| ------------------- | ----------------------------------------- | --------------------- | ------------------------------ |
| `easing.default`    | `cubic-bezier(0.4, 0, 0.2, 1)`            | `--easing-default`    | Standard Material — balanced   |
| `easing.in`         | `cubic-bezier(0.4, 0, 1, 1)`              | `--easing-in`         | Accelerate — content exiting   |
| `easing.out`        | `cubic-bezier(0, 0, 0.2, 1)`              | `--easing-out`        | Decelerate — content entering  |
| `easing.inOut`      | `cubic-bezier(0.4, 0, 0.2, 1)`            | `--easing-in-out`     | Symmetric — looping motion     |
| `easing.standard`   | `cubic-bezier(0.2, 0, 0, 1)`              | `--easing-standard`   | M3 standard — page transitions |
| `easing.decelerate` | `cubic-bezier(0, 0, 0, 1)`                | `--easing-decelerate` | Soft landing — items appearing |
| `easing.accelerate` | `cubic-bezier(0.3, 0, 1, 1)`              | `--easing-accelerate` | Quick exit — items dismissing  |
| `easing.spring`     | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | `--easing-spring`     | Overshoot — celebrations       |

### Semantic: Animation Presets

Semantic tokens map primitive values to **UI purposes**. These are the recommended starting point for platform engineers.

| Semantic Token                 | Duration         | Easing     | Purpose                                   |
| ------------------------------ | ---------------- | ---------- | ----------------------------------------- |
| `animation.pageTransition.*`   | `250ms` (normal) | standard   | Route changes, full-screen sheets         |
| `animation.listItem.*`         | `150ms` (fast)   | decelerate | List/grid item staggered enters           |
| `animation.progress.*`         | `400ms` (slow)   | default    | Progress rings, bars, loading indicators  |
| `animation.celebrate.*`        | `800ms` (slower) | spring     | Goal reached, payment success, milestones |
| `animation.fadeIn.*`           | `250ms` (normal) | decelerate | Cards, sections, tooltip reveals          |
| `animation.fadeOut.*`          | `150ms` (fast)   | accelerate | Toast dismiss, overlay close              |
| `animation.microInteraction.*` | `0ms` (instant)  | default    | Button press, toggle, checkbox            |
| `animation.loading.*`          | `800ms` (slower) | inOut      | Skeleton shimmer, continuous loading      |

### Component: Animation Bindings

| Component Token                  | Binds To                       | Purpose                       |
| -------------------------------- | ------------------------------ | ----------------------------- |
| `progressRing.animationDuration` | `animation.progress.duration`  | Circular progress spin cycle  |
| `progressRing.animationEasing`   | `animation.progress.easing`    |                               |
| `toast.animationDuration`        | `animation.fadeIn.duration`    | Toast notification enter/exit |
| `toast.animationEasing`          | `animation.fadeIn.easing`      |                               |
| `modal.animationDuration`        | `animation.pageTransition.*`   | Modal/dialog overlay          |
| `modal.animationEasing`          | `animation.pageTransition.*`   |                               |
| `skeleton.animationDuration`     | `animation.loading.duration`   | Skeleton shimmer sweep        |
| `skeleton.animationEasing`       | `animation.loading.easing`     |                               |
| `celebration.animationDuration`  | `animation.celebrate.duration` | Success celebration           |
| `celebration.animationEasing`    | `animation.celebrate.easing`   |                               |

---

## Animation Categories

### 1. Page Transitions

Used when navigating between routes or presenting full-screen content.

**Pattern**: Slide + fade in the direction of navigation flow.

```
Enter: slideInUp / slideInRight  (250ms, standard easing)
Exit:  slideOutDown / fadeOut    (150ms, accelerate easing)
```

### 2. List Item Animations

Used for transaction lists, account lists, and data tables.

**Pattern**: Staggered slideInUp with 30ms delay between items (max 10 items / 300ms total).

```
Each item: slideInUp (150ms, decelerate easing)
Stagger:   30ms incremental delay per item
```

### 3. Progress Indicators

Used for sync progress, import progress, and loading states.

**Pattern**: Continuous rotation or deterministic fill.

```
Indeterminate: spin (400ms per cycle, linear, infinite)
Determinate:   width/stroke transition (400ms, default easing)
Skeleton:      shimmer sweep (800ms, inOut easing, infinite)
```

### 4. Celebration / Success

Used for goal completion, successful payment, budget milestone.

**Pattern**: Scale-up with spring overshoot + checkmark draw.

```
Container: celebrate (800ms, spring easing)
Checkmark: stroke-dashoffset draw (400ms, decelerate, 300ms delay)
Confetti:  burst and fade (800ms, decelerate)
```

### 5. Loading States

Used for initial data fetch, skeleton screens, and pending states.

**Pattern**: Shimmer gradient sweep or pulsing opacity.

```
Skeleton: shimmer (800ms, inOut, infinite)
Pulse:    opacity 1→0.5→1 (800ms, inOut, infinite)
```

---

## Platform Usage Examples

### CSS (Web)

```css
/* Import the animations stylesheet */
@import './styles/animations.css';

/* Use utility classes */
<div class="animate-fade-in">Content appears</div>
<div class="animate-slide-up animate-stagger-2">Second list item</div>

/* Use token custom properties directly */
.my-component {
  transition: transform var(--animation-page-transition-duration)
    var(--animation-page-transition-easing);
}

/* Skeleton loading */
.skeleton-line {
  @extend .animate-shimmer; /* or apply directly */
  height: 16px;
  border-radius: var(--border-radius-sm);
}
```

### SwiftUI (iOS)

```swift
import SwiftUI

// Reference generated constants from FinanceTokens.swift
extension Animation {
    static let pageTransition = Animation
        .easeOut(duration: FinanceTokens.animationPageTransitionDuration)

    static let listItem = Animation
        .easeOut(duration: FinanceTokens.animationListItemDuration)

    static let celebrate = Animation
        .spring(response: 0.8, dampingFraction: 0.6, blendDuration: 0)

    static let microInteraction = Animation
        .easeInOut(duration: FinanceTokens.animationMicroInteractionDuration)
}

// Usage
struct TransactionRow: View {
    var body: some View {
        HStack { /* ... */ }
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .animation(.listItem, value: transactions)
    }
}

// Celebration
struct GoalComplete: View {
    @State private var showCheck = false

    var body: some View {
        Image(systemName: "checkmark.circle.fill")
            .scaleEffect(showCheck ? 1.0 : 0.3)
            .opacity(showCheck ? 1.0 : 0)
            .animation(.celebrate, value: showCheck)
    }
}

// Reduced motion
struct MotionSafeModifier: ViewModifier {
    @Environment(\.accessibilityReduceMotion) var reduceMotion

    func body(content: Content) -> some View {
        content.animation(reduceMotion ? .none : .pageTransition)
    }
}
```

### Jetpack Compose (Android)

```kotlin
import androidx.compose.animation.core.*
import com.finance.tokens.FinanceTokens

// Duration constants from generated tokens
object FinanceMotion {
    val PageTransitionDuration = FinanceTokens.animationPageTransitionDuration.toInt()
    val ListItemDuration = FinanceTokens.animationListItemDuration.toInt()
    val CelebrateDuration = FinanceTokens.animationCelebrateDuration.toInt()

    val StandardEasing = CubicBezierEasing(0.2f, 0f, 0f, 1f)
    val DecelerateEasing = CubicBezierEasing(0f, 0f, 0f, 1f)
    val AccelerateEasing = CubicBezierEasing(0.3f, 0f, 1f, 1f)
    val SpringEasing = CubicBezierEasing(0.175f, 0.885f, 0.32f, 1.275f)
}

// Page transition
@Composable
fun PageTransition(content: @Composable () -> Unit) {
    AnimatedVisibility(
        enter = fadeIn(
            animationSpec = tween(
                durationMillis = FinanceMotion.PageTransitionDuration,
                easing = FinanceMotion.StandardEasing
            )
        ) + slideInVertically(
            initialOffsetY = { 16 },
            animationSpec = tween(
                durationMillis = FinanceMotion.PageTransitionDuration,
                easing = FinanceMotion.StandardEasing
            )
        ),
        exit = fadeOut(
            animationSpec = tween(
                durationMillis = FinanceMotion.ListItemDuration,
                easing = FinanceMotion.AccelerateEasing
            )
        )
    ) {
        content()
    }
}

// Staggered list
@Composable
fun StaggeredList(items: List<Transaction>) {
    LazyColumn {
        itemsIndexed(items) { index, item ->
            val delay = (index * 30).coerceAtMost(300)
            TransactionRow(
                item = item,
                modifier = Modifier.animateItemPlacement(
                    animationSpec = tween(
                        durationMillis = FinanceMotion.ListItemDuration,
                        delayMillis = delay,
                        easing = FinanceMotion.DecelerateEasing
                    )
                )
            )
        }
    }
}

// Reduced motion support
val reduceMotion = LocalAccessibilityManager.current?.isEnabled == true
val animDuration = if (reduceMotion) 0 else FinanceMotion.PageTransitionDuration
```

### Compose Desktop / Multiplatform (Windows)

```kotlin
// Same Compose API as Android — tokens are shared via KMP
import com.finance.tokens.FinanceTokens

// The FinanceMotion object from Android is shared in commonMain
// Platform-specific adjustments only if needed:
object WindowsMotion {
    // Windows may prefer slightly faster animations per Fluent guidelines
    val PageTransitionDuration = FinanceMotion.PageTransitionDuration
    val ListItemDuration = FinanceMotion.ListItemDuration

    // Respect Windows "Show animations" system setting
    fun isReducedMotion(): Boolean {
        return System.getProperty("os.name").contains("Windows") &&
            !WindowsAccessibility.areAnimationsEnabled()
    }
}
```

---

## Reduced Motion Guidelines

### Principles

1. **Never remove information** — if an animation conveys state (e.g., a progress ring), replace it with a static indicator (percentage text, progress bar fill)
2. **Instant state changes are acceptable** — the element should still reach its final state, just without interpolation
3. **Opacity is generally safe** — brief opacity fades (≤100ms) are unlikely to cause vestibular discomfort
4. **Parallax, zoom, and spinning are high-risk** — always disable these for reduced-motion users

### Platform Implementation

| Platform      | Detection API                                                                         | Behavior                                         |
| ------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Web (CSS)** | `@media (prefers-reduced-motion: reduce)`                                             | Animations replaced with `animation: none`       |
| **Web (JS)**  | `window.matchMedia('(prefers-reduced-motion: reduce)')`                               | Skip `requestAnimationFrame` loops               |
| **iOS**       | `UIAccessibility.isReduceMotionEnabled` / `@Environment(\.accessibilityReduceMotion)` | Use `.animation(.none)` or crossfade transitions |
| **Android**   | `Settings.Global.ANIMATOR_DURATION_SCALE`                                             | Check if `== 0f`, skip animated specs            |
| **Windows**   | `SystemParameters.ClientAreaAnimation` / `UISettings.AnimationsEnabled`               | Fall back to instant state changes               |

### CSS Reduced Motion Strategy

The Finance web app uses **two layers** of reduced-motion protection:

1. **Global safety net** (in `tokens.css`): Forces `animation-duration: 0.01ms !important` and `transition-duration: 0.01ms !important` on all elements.
2. **Component-level overrides** (in `animations.css`): Uses `@media (prefers-reduced-motion: reduce)` to set `animation: none`, ensure final visual state (opacity, transform), and reset shimmer backgrounds.

```css
/* Global — tokens.css */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* Component — animations.css */
@media (prefers-reduced-motion: reduce) {
  .animate-slide-up {
    animation: none;
    opacity: 1; /* Show final state */
    transform: none; /* Remove movement */
  }
}
```

---

## Performance Considerations

### General Rules

1. **Prefer `transform` and `opacity`** — these properties are GPU-composited and don't trigger layout or paint
2. **Avoid animating `width`, `height`, `top`, `left`** — these trigger expensive layout recalculations
3. **Use `will-change` sparingly** — only on elements about to animate, and remove after animation completes
4. **Limit simultaneous animations** — stagger list items (max 10 per batch) to avoid frame drops
5. **Prefer CSS animations over JS** — CSS animations run on the compositor thread; JS animations run on the main thread

### Budget per Frame

Target: **60fps = 16.67ms per frame**

| Animation Type      | Recommended Limit | Notes                                  |
| ------------------- | ----------------- | -------------------------------------- |
| Page transitions    | 1 at a time       | Cross-fade old/new, don't overlap      |
| List items          | 10 staggered max  | 300ms total stagger window             |
| Progress indicators | 1–2 concurrent    | SVG stroke animation is lightweight    |
| Celebrations        | 1 at a time       | Complex — use `will-change: transform` |
| Skeletons/shimmer   | Unlimited         | Single GPU-composited gradient sweep   |

### Mobile-Specific

- **iOS**: SwiftUI animations are compositor-level by default. Avoid `.drawingGroup()` unless needed for complex layer merging.
- **Android**: Compose animations run on the render thread. Avoid `drawBehind {}` during animation. Use `graphicsLayer {}` for transform animations.
- **Web**: Add `will-change: transform, opacity` before animation starts. Remove it in the `animationend` event handler.

### Testing Checklist

- [ ] Animations render at 60fps on target devices (Chrome DevTools → Performance)
- [ ] `prefers-reduced-motion: reduce` disables all motion (test via DevTools → Rendering)
- [ ] Skeleton shimmer doesn't cause high CPU usage on battery (check compositor-only)
- [ ] Staggered list doesn't exceed 300ms total delay
- [ ] Celebration animation completes before navigation is possible
- [ ] No layout shift (CLS) caused by animated elements entering/exiting

---

## File Structure

```
packages/design-tokens/
├── tokens/
│   ├── primitive/
│   │   └── motion.json            # Duration + easing primitives
│   ├── semantic/
│   │   └── animation.json         # Purpose-mapped animation presets
│   └── component/
│       └── animation.json         # Component-level animation bindings
├── config/
│   └── style-dictionary.config.mjs  # Build pipeline (updated)
└── build/
    ├── web/tokens.css              # Generated: --duration-*, --easing-*, --animation-*
    ├── ios/FinanceTokens.swift     # Generated: static constants
    └── android/dimens.xml          # Generated: <dimen> resources

apps/web/src/
├── styles/
│   └── animations.css              # @keyframes + utility classes + reduced motion
└── theme/
    └── theme.ts                    # TypeScript animation constants (updated)

docs/design/
└── animation-library.md            # This document
```

---

## Changelog

| Date       | Change                                                           | Author      |
| ---------- | ---------------------------------------------------------------- | ----------- |
| 2025-07-11 | Initial animation token system — primitives, semantic, component | Design Sys. |
|            | CSS animations library with 13 keyframes + utility classes       |             |
|            | Platform reference docs (CSS, SwiftUI, Compose, Compose Desktop) |             |
