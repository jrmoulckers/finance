# UX Design Principles — Finance

## Core Philosophy

> "Financial clarity without cognitive burden."

The app should make tracking finances feel empowering, not overwhelming. Every interaction should leave the user feeling more in control, never more anxious. Finance is a tool for *understanding*, not surveillance — it illuminates your financial life without casting judgment.

---

## Principle 1: Clarity Over Completeness

Show the most important information first, details on demand.

- Inspired by **Bevel**: bold, focused metrics front and center
- One number per screen should be the hero (today's spending, budget remaining, goal progress)
- Progressive disclosure: simple → detailed → advanced
- Never show more than 5–7 items without grouping
- Use whitespace deliberately — density is the enemy of comprehension
- Default views optimized for the question "How am I doing?" — not "Show me everything"

---

## Principle 2: 3-Tap Transactions

The most frequent action (recording a transaction) must be completable in 3 taps or fewer.

- Inspired by **TickTick**: quick capture without friction
- Quick-entry flow: amount → category (smart suggestion) → done
- Full details (notes, tags, receipt photo, location) available but never required upfront
- Haptic confirmation on save — tactile feedback closes the loop
- Support natural language input: "coffee 4.50" should just work
- Keyboard shortcuts on desktop: one keystroke to open quick entry

---

## Principle 3: Non-Judgmental Finance

Present facts, not judgments — let users draw their own conclusions.

- Inspired by **Tiimo**: supportive, never punishing
- No "you overspent" with red warnings — instead: *"You've used 110% of your Food budget. Want to adjust?"*
- Celebrate positive behavior: *"3-week streak of staying on budget!"*
- Use encouraging language: "making progress," "getting clearer," "taking control"
- Never use shame-based language about spending habits
- Neutral visual indicators for over-budget states (no alarm colors without opt-in)
- Financial terminology always accompanied by plain-language explanation

---

## Principle 4: Accessibility as Foundation

Not an add-on feature — baked into every component from day one.

- Inspired by **Tiimo**: disability-inclusive design philosophy
- WCAG 2.2 AA minimum, AAA where practical
- Ships accessible or it doesn't ship

### Cognitive Accessibility

- Simplified view mode (fewer numbers, bigger text, key info only)
- Routine-based notifications (same time daily, gentle reminders)
- Reduced motion by default (animate only on opt-in)
- Plain language everywhere (no financial jargon without explanation)
- Consistent, predictable navigation across all screens
- Error recovery that is straightforward and non-punishing

### Visual Accessibility

- All color coding has icon/pattern backup — information never conveyed by color alone
- IBM CVD-safe palette for charts and data visualization
- Dynamic Type / font scaling on all platforms (text resizable to 200% without content loss)
- High contrast mode and dark/light theme support
- Color contrast meets WCAG AA (4.5:1 for text, 3:1 for large text/UI components)

### Motor Accessibility

- Large touch targets: 44×44pt minimum (iOS), 48×48dp minimum (Android)
- Full keyboard navigation on all platforms
- Voice control support
- No time-dependent interactions without user control
- Switch control compatible

### Screen Reader Support

- All images have meaningful alt text (or are marked decorative)
- Form fields have associated labels
- Dynamic content changes announced via live regions
- Navigation landmarks properly defined
- Custom components expose correct accessibility roles and states

---

## Principle 5: Offline Reality

Works perfectly without internet. Offline is the default state, not a degraded one.

- Inspired by **Signal**: edge-first architecture
- Never show a loading spinner for local data
- Never block an action because of network state
- Sync is invisible — data appears, never "syncing..."
- Conflict resolution happens silently when possible, gently when user input is needed
- All core functionality (transactions, budgets, reports) works fully offline
- Matches the project's edge-first architecture: most operations happen on-device

---

## Principle 6: Platform Native, Brand Consistent

The app should feel like it "belongs" on every platform. Brand consistency comes through design tokens, not shared components.

- **iOS / macOS**: Follow HIG — NavigationStack, SF Symbols, standard gestures, Dynamic Type, VoiceOver
- **Android / Wear OS**: Follow Material 3 — dynamic color, FAB for quick entry, bottom navigation, TalkBack
- **Web (PWA)**: Standard web patterns — responsive, keyboard-first, semantic HTML, ARIA, CSP-secure
- **Windows**: Follow Fluent Design — acrylic, system theme, Narrator, UI Automation, high contrast

Platform-native components consume design tokens (DTCG spec) — the token system is the single source of truth for all visual properties. Tokens exist at three tiers: primitive → semantic → component.

---

## Principle 7: Financial Wellness Over Financial Management

Make the journey visible and motivating — not just the destination.

- Inspired by **Strava**: activity feed, milestones, progress visualization
- Show trends, not just snapshots — *"Your dining spending is down 15% this month"*
- Celebrate milestones: *"Emergency fund fully funded! 🎉"*
- Weekly insights: *"Your highest spending day was Tuesday"*
- Goal visualization: progress bars, projections, countdowns
- Net worth trend as a motivational long-term metric
- Inspired by **YNAB**: envelope budgeting, "give every dollar a job," age of money — without the steep learning curve
- Optional social: share milestones with partner (V1.1), never spending details

---

## Principle 8: Respectful Data Practice

Transparent, minimal, user-controlled data handling.

- Inspired by **Signal**: privacy by design
- Tell users exactly what data exists and where
- One-tap data export (JSON + CSV)
- Account deletion that actually deletes everything
- No analytics without consent
- No data selling, ever — stated in app and enforced in code
- Encryption at rest — even we can't read your financial data
- Aligned with the project's privacy-by-design principle: transparent data practices, compliant standards

---

## Design Language Summary

| Attribute | Approach |
|-----------|----------|
| Tone | Encouraging, clear, non-judgmental |
| Density | Low — generous whitespace, focused content |
| Color | Functional (not decorative), CVD-safe, theme-aware |
| Typography | Platform-native, scalable, readable |
| Motion | Minimal — meaningful transitions only, reduced motion respected |
| Icons | Platform-native icon sets (SF Symbols, Material Icons, Fluent Icons) |
| Charts | Simple, accessible, color-blind safe, labeled |
| Numbers | Large, bold, locale-aware formatting, integer display preferred |
| Tokens | DTCG spec, three-tier (primitive → semantic → component), Style Dictionary pipeline |

---

## Anti-Patterns (NEVER do these)

- ❌ Red text for overspending (use neutral indicators + context)
- ❌ Popup notifications about spending ("You just spent $45!") without opt-in
- ❌ Comparative leaderboards ("You spend more than 80% of users")
- ❌ Dark patterns to upsell premium features
- ❌ Requiring account connection to use the app
- ❌ Complex onboarding (no "enter all your accounts before you can start")
- ❌ Financial jargon without explanation
- ❌ Animations that can't be disabled
- ❌ Tiny touch targets or mouse-only interactions
- ❌ Color as the sole means of conveying information
- ❌ Approving UI changes that reduce accessibility
- ❌ "We'll add accessibility later"

---

## Inspiration Mapping

| Inspiration | What We Take | What We Skip |
|-------------|-------------|--------------|
| **Bevel** | Bold metric cards, focused daily view, streak tracking | Social comparison features |
| **YNAB** | Envelope budgeting, "give every dollar a job," age of money | Steep learning curve, overwhelming onboarding |
| **TickTick** | Quick capture, natural language input, habit tracking | Task management complexity |
| **Strava** | Activity feed, milestones, progress visualization | Social pressure, public-by-default |
| **Tiimo** | Visual schedules, cognitive support, non-judgmental tone | Schedule-centric focus (we're finance-centric) |
| **Signal** | Offline-first, encryption at rest, transparent data practices | Messaging paradigm |
