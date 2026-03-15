# Accessibility Guide

Finance is designed to be usable by everyone, regardless of ability. Accessibility isn't an afterthought — it's a design principle woven into every screen, feature, and interaction.

This guide covers the accessibility features available in Finance and how to use them.

---

## Table of Contents

- [Screen reader support](#screen-reader-support)
- [Dynamic type and font scaling](#dynamic-type-and-font-scaling)
- [High contrast mode](#high-contrast-mode)
- [Reduced motion](#reduced-motion)
- [Keyboard navigation](#keyboard-navigation)
- [Color-blind friendly design](#color-blind-friendly-design)
- [Cognitive accessibility](#cognitive-accessibility)
- [Simplified view mode](#simplified-view-mode)
- [How to enable accessibility features](#how-to-enable-accessibility-features)

---

## Screen reader support

Finance works with the screen reader on every platform:

| Platform    | Screen reader                                |
| ----------- | -------------------------------------------- |
| **iOS**     | VoiceOver                                    |
| **Android** | TalkBack                                     |
| **Windows** | Narrator                                     |
| **Web**     | Any screen reader (ARIA landmarks and roles) |

### What's announced

Finance provides meaningful announcements for all financial data:

- **Account balances** are announced with the currency (e.g., "Chase Checking: two thousand four hundred fifty dollars")
- **Transaction rows** include full context: date, payee, category, and amount
- **Budget progress** is announced as a percentage (e.g., "Food budget: seventy-five percent used, one hundred fifty dollars remaining")
- **Goal milestones** are announced with progress
- **Sync status** is announced when it changes (synced, syncing, pending, offline)

### Charts and reports

All charts have an **accessible table alternative**. Screen reader users can switch from a visual chart to a data table that conveys the same information in a linear, readable format.

- Pie/donut charts → category list with amounts and percentages
- Line/bar charts → monthly data table with trend indicators
- Progress bars → percentage and absolute values

### Navigation

- All interactive elements have descriptive labels
- Heading hierarchy is consistent (H1 for screen title, H2 for sections, H3 for items)
- Focus order follows logical reading order
- Dialogs trap focus appropriately and can be dismissed with Escape

---

## Dynamic type and font scaling

Finance respects your system font size preferences on all platforms.

### How it works

- **iOS**: Finance follows your Dynamic Type setting. Text scales from the smallest to the largest accessibility sizes, including AX sizes.
- **Android**: Finance follows your system font scale. Go to device Settings → Display → Font size.
- **Windows**: Finance follows your system text scaling. Go to Settings → Accessibility → Text size.
- **Web**: Finance uses relative font units (rem) that scale with your browser's font size setting.

### What scales

- All text content — labels, amounts, descriptions, buttons
- Spacing adjusts proportionally so content doesn't overlap
- Touch targets grow to maintain usability at larger sizes

> 💡 Finance is tested at 200% font scale to ensure everything remains usable and readable.

---

## High contrast mode

For users who need stronger visual distinction between elements, Finance supports high contrast display.

### How to enable

- **iOS**: Go to device Settings → Accessibility → Display & Text Size → Increase Contrast
- **Android**: Go to device Settings → Accessibility → High contrast text
- **Windows**: Go to Settings → Accessibility → Contrast themes → select a high contrast theme
- **Web**: Finance respects the `prefers-contrast: high` CSS media query. Enable high contrast in your operating system or browser settings.

### What changes

- Borders become more visible around buttons, cards, and input fields
- Text contrast increases to meet and exceed WCAG AAA contrast ratios
- Budget progress bars use solid, high-contrast fills
- Icons gain stronger outlines
- Focus indicators become more prominent

---

## Reduced motion

If animations and transitions cause discomfort, Finance can minimize or eliminate them.

### How to enable

- **iOS**: Go to device Settings → Accessibility → Motion → Reduce Motion
- **Android**: Go to device Settings → Accessibility → Remove animations
- **Windows**: Go to Settings → Accessibility → Visual effects → Animation effects → Off
- **Web**: Finance respects the `prefers-reduced-motion` CSS media query

### What changes

When reduced motion is enabled:

- Screen transitions switch from animated slides to simple fades or instant swaps
- Progress bars don't animate when they fill — they appear at the correct position
- The sync status indicator doesn't animate — it changes state directly
- Celebration effects (goal milestones) use a simple text acknowledgment instead of confetti or motion
- Haptic feedback continues to work (it's tactile, not visual motion)

---

## Keyboard navigation

Finance is fully keyboard-accessible, especially on web and Windows where keyboard use is most common.

### General keyboard shortcuts

| Shortcut           | Action                                               |
| ------------------ | ---------------------------------------------------- |
| `Tab`              | Move to the next interactive element                 |
| `Shift+Tab`        | Move to the previous interactive element             |
| `Enter` or `Space` | Activate a button or select an option                |
| `Escape`           | Close a dialog, cancel an action, or dismiss a popup |
| `Arrow keys`       | Navigate within lists, menus, and date pickers       |

### App shortcuts (Web and Windows)

| Shortcut            | Action          |
| ------------------- | --------------- |
| `Ctrl+N` (or `⌘+N`) | New transaction |
| `/`                 | Open search     |
| `Ctrl+E`            | Export data     |

### Focus indicators

When navigating with a keyboard, a clear **focus ring** shows which element is currently selected. The ring is:

- High contrast and visible on all backgrounds
- Consistent in style across the app
- Visible on buttons, links, form fields, and all interactive elements

### Category reordering

In the category management screen, drag-and-drop has a keyboard alternative:

1. Focus on a category item.
2. Press `Space` to pick it up.
3. Use `Arrow Up` / `Arrow Down` to move it.
4. Press `Space` to drop it in the new position.

---

## Color-blind friendly design

Finance uses the **IBM Carbon CVD-safe color palette** — a set of colors designed to be distinguishable by people with all types of color vision deficiency (CVD), including protanopia, deuteranopia, and tritanopia.

### Where this matters most

- **Charts and reports**: Each category in a pie chart or bar chart uses a distinct CVD-safe color. No two adjacent categories share colors that could be confused.
- **Budget status**: Progress indicators don't rely on color alone — they also use labels and icons:
  - Under 80%: labeled "On track"
  - 80–100%: labeled "Getting close"
  - Over 100%: labeled with the percentage
- **Transaction types**: Income and expenses are distinguished by direction indicators (↑ / ↓) and labels, not just green and red.

### Design principle

Finance follows the WCAG 2.2 guideline of **never relying on color alone** to convey information. Every piece of color-coded information also has a text label, icon, or pattern that communicates the same meaning.

---

## Cognitive accessibility

Finance is designed with cognitive accessibility in mind, inspired by apps like Tiimo that support users with ADHD, anxiety, and other cognitive differences.

### Non-judgmental language

The app never shames or criticizes. All language is factual and encouraging:

- ✅ _"You've used 110% of your Food plan — want to adjust?"_
- ❌ ~~"You overspent on food!"~~
- ✅ _"Welcome back! Pick up where you left off."_
- ❌ ~~"You broke your streak!"~~

### Reduced cognitive load

- **3-tap transaction entry** — the most common action is simple and fast
- **Progressive disclosure** — advanced options are hidden behind "More details" so the default view isn't overwhelming
- **Experience levels** — the 🌱 Getting Started tier hides complexity until you're ready
- **Gentle nudges** — task cards are non-nagging and easily dismissed
- **Consistent layout** — screens follow the same structure so you always know where things are

### Contextual education

Every financial concept in the app has an **info button** (ℹ️) that explains:

- What it is (in plain language)
- How it's calculated
- Why it matters

This means you never need to leave the app to understand what you're looking at.

### Streaks without guilt

Finance tracks consecutive days of logging, but treats breaks with grace:

- Positive framing for active streaks
- No guilt, no loss aversion, no "you lost your streak" messaging
- Just a warm welcome back when you return

---

## Simplified view mode

For times when the full interface is too much, Finance offers a **Simplified View Mode** that shows only the essentials.

### What it shows

- Your total balance
- Today's spending
- Top 3 budget categories
- Next goal milestone

### What it hides

- Detailed charts and analytics
- Transaction history (still accessible via menu)
- Advanced settings and options

### Additional simplifications

- Larger text with more whitespace
- Fewer numbers on screen at once
- Reduced motion (no animations)

### How to enable

1. Go to **Settings → Accessibility → Simplified View**.
2. Toggle it on.

Finance also respects your system accessibility settings — if your device is set to larger text or reduced motion, Finance adapts automatically.

---

## How to enable accessibility features

Most accessibility features in Finance activate automatically based on your device settings. Here's a quick reference:

### iOS

| Feature           | Where to enable                                                    |
| ----------------- | ------------------------------------------------------------------ |
| VoiceOver         | Settings → Accessibility → VoiceOver                               |
| Dynamic Type      | Settings → Accessibility → Display & Text Size → Larger Text       |
| Reduce Motion     | Settings → Accessibility → Motion → Reduce Motion                  |
| Increase Contrast | Settings → Accessibility → Display & Text Size → Increase Contrast |
| Bold Text         | Settings → Accessibility → Display & Text Size → Bold Text         |

### Android

| Feature            | Where to enable                               |
| ------------------ | --------------------------------------------- |
| TalkBack           | Settings → Accessibility → TalkBack           |
| Font size          | Settings → Display → Font size                |
| Remove animations  | Settings → Accessibility → Remove animations  |
| High contrast text | Settings → Accessibility → High contrast text |
| Color correction   | Settings → Accessibility → Color correction   |

### Windows

| Feature           | Where to enable                                               |
| ----------------- | ------------------------------------------------------------- |
| Narrator          | Settings → Accessibility → Narrator                           |
| Text size         | Settings → Accessibility → Text size                          |
| Contrast themes   | Settings → Accessibility → Contrast themes                    |
| Animation effects | Settings → Accessibility → Visual effects → Animation effects |

### Web

| Feature        | How to enable                                                               |
| -------------- | --------------------------------------------------------------------------- |
| Screen reader  | Use your operating system's screen reader (VoiceOver, NVDA, JAWS, Narrator) |
| Font size      | Browser settings → Font size (Finance uses relative units)                  |
| High contrast  | OS-level high contrast settings or browser extension                        |
| Reduced motion | OS-level reduced motion setting (Finance reads `prefers-reduced-motion`)    |

### In Finance

| Feature          | Where to find it                                                   |
| ---------------- | ------------------------------------------------------------------ |
| Experience level | Settings → Experience Level (🌱 Getting Started for simplified UI) |
| Simplified view  | Settings → Accessibility → Simplified View                         |
| Biometric lock   | Settings → Security → Biometric Lock                               |

---

## Accessibility standards

Finance targets **WCAG 2.2 Level AA** compliance across all platforms. This includes:

- Minimum 4.5:1 contrast ratio for normal text
- Minimum 3:1 contrast ratio for large text and UI components
- All functionality available via keyboard
- No content that flashes more than 3 times per second
- Clear focus indicators on all interactive elements
- Meaningful labels for all form fields and buttons
- Consistent navigation structure across the app

---

_If you encounter an accessibility barrier in Finance, please report it. Go to **Settings → Help → Report a Bug** and describe the issue. Accessibility bugs are treated as high-priority._

_For general help, see the [FAQ](./faq.md). For platform-specific features, see the [Platform Guides](./platforms.md)._
