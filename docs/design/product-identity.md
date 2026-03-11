# Product Identity

> The single source of truth for what Finance is, who it's for, and what makes it different.

---

## 1. Core Promise

> **"See your money clearly. Keep it private. No expertise required."**

Finance makes financial tracking accessible to everyone — not just people who
understand spreadsheets. It translates financial complexity into human language,
keeps all data private and encrypted, and makes the daily act of tracking money
take **less than 30 seconds**.

---

## 2. What Makes Finance Different

### 2.1 "Works with your brain"

Expertise-tiered UI adapts language and complexity to the user. Cognitive
accessibility (ADHD-friendly) is a **design principle**, not a checkbox.

### 2.2 "Your money never leaves your device"

Offline-first, encrypted at rest (SQLCipher), opt-in sync. Signal-like privacy
values. Your financial data stays on your device unless you explicitly choose
to sync it.

### 2.3 "30 seconds or less"

3-tap transaction entry. Widget-first daily interaction. Frictionless capture,
not tedious data entry.

### 2.4 "No expertise required"

Contextual education on every financial concept. An info tap explains what it
is, how it's calculated, and why it matters.

### 2.5 "Facts, not judgments"

Non-judgmental language throughout. The app observes and informs — it never
shames.

- ✅ _"You've used 110% of your Food plan — want to adjust?"_
- ❌ ~~"You overspent!"~~

---

## 3. Expertise Tier System

Three tiers, selected during onboarding (changeable anytime in Settings):

| Tier | Label           | Behavior                                                                                                                   |
| ---- | --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 🌱   | Getting Started | Plain language, simplified views, guided prompts, proactive tips. Hides advanced features.                                 |
| 📊   | Comfortable     | Standard terminology with plain descriptions available. Full feature set visible. Default for "Just let me in" onboarding. |
| 🧠   | Advanced        | Traditional finance terms, detailed breakdowns, power-user shortcuts, raw data access.                                     |

Each tier changes:

- **Terminology** — plain language vs. standard vs. technical
- **Visible features** — progressive disclosure based on comfort level
- **Default views** — simplified summaries vs. detailed breakdowns
- **Notification style** — gentle nudges vs. data-rich alerts
- **Chart complexity** — simple bar charts vs. multi-axis visualizations

---

## 4. Freemium Model

### Free Tier — Complete Financial Tracker

Everything needed to track finances on a single device:

- All accounts, transactions, budgets, goals, categories, and rules
- Expertise-tiered UI with all three levels
- Contextual info tooltips on every financial concept
- Offline-first operation on a single device
- Data export (JSON/CSV — also a GDPR requirement)
- Basic reports (spending by category, monthly trends)
- "Can I Afford This?" budget check widget
- Streaks and milestone celebrations

### Premium Tier — AI Intelligence Layer

AI-powered insights and multi-device capabilities:

- AI auto-categorization of transactions with trend marking
- Suggested budgets based on spending history
- Holistic portfolio and goal analysis
- Spending forecasts with confidence intervals
- Structured financial learning paths (guided modules)
- Multi-device cloud sync (Supabase + PowerSync)
- Household/partner sharing (shared budgets, role-based access)
- Advanced reports and custom visualizations
- Priority support

### Pricing (Proposed)

| Plan    | Price                           |
| ------- | ------------------------------- |
| Monthly | ~$4.99/mo                       |
| Annual  | ~$39.99/yr                      |
| Family  | Household sharing (pricing TBD) |

---

## 5. Onboarding Philosophy

> **"The app earns the right to ask questions by being useful first."**

### Path A: "Just let me in"

One tap. Currency auto-detected. Drops into Comfortable tier dashboard. Zero
friction. Gentle post-onboarding task cards fill in missing setup over time.

### Path B: "Personalize my experience"

A 30-second emotion-first flow (skippable at any point):

1. **"How do you feel about your money?"** → determines expertise tier
2. **Currency + First account** (combined into a single step)
3. **"What matters most?"** → seeds first budget category and goal
4. **"You're ready."** → personalized dashboard

### Post-Onboarding Nudges

Non-nagging, dismissible task cards:

- "Add your first account"
- "Set a spending plan"
- "Complete your setup (3/6 done)"

---

## 6. Daily Habit Loop

The app's retention architecture — why people open it every day.

### Morning: Daily Snapshot

Opt-in push notification:

> _"Yesterday you spent $47. Your week is on track. ✅"_

### During the Day: Frictionless Capture

Widget shows remaining budget. Tap to quick-entry. 3 taps. Haptic
confirmation. Done.

### "Can I Afford This?" Quick Check

Tap a category on the widget to see remaining budget. Standing in a
restaurant? Tap "Dining" → _"$67 left this month."_

### Weekly: Insight Notification

Opt-in weekly summary:

> _"This week: $312 spent. Biggest category: Dining ($89). You're $43 under
> budget."_

### Monthly: Reflection Card

Dashboard card showing: income, spending, savings rate, comparison to last
month, and top changes.

### Streaks (Non-Manipulative)

Track consecutive days of logging. Positive framing only. No guilt on break:

> _"Welcome back! Pick up where you left off."_

---

## 7. Platform-Native Differentiators

### iOS (Launch)

- Lock Screen + Home Screen widgets (budget remaining, goal progress)
- Interactive widgets (iOS 17+) — tap "+" to quick-entry from widget
- Custom Core Haptics (transaction saved, budget threshold, goal milestone)
- Face ID gating on sensitive screens

### Android (Launch)

- Home Screen widgets with Material You dynamic color
- Quick Settings tile for instant quick-entry overlay
- App Shortcuts (long-press icon: "Quick Transaction," "Check Budget")
- Predictive Back gesture with preview

### Web PWA (Launch)

- Keyboard-first workflow (`Ctrl+N`, `/` search, `Tab` through categories)
- Multi-panel layout at desktop widths (1200px+)
- Installable PWA with offline support
- Print-optimized monthly reports

### Windows (Launch)

- Windows Hello biometric unlock
- Snap Layouts integration
- System toast notifications for budget alerts
- Narrator + High Contrast accessibility

### Deferred to Post-Launch

- Voice assistants (Siri, Google Assistant)
- Apple Watch companion
- Wear OS companion
- SharePlay collaborative budgeting

---

## 8. Design Inspiration DNA

| Inspiration  | What We Take                                                  |
| ------------ | ------------------------------------------------------------- |
| **YNAB**     | Envelope budgeting methodology                                |
| **Bevel**    | Bold focused metrics, streak tracking                         |
| **TickTick** | Quick capture, natural language input                         |
| **Strava**   | Milestones, progress visualization (without social pressure)  |
| **Tiimo**    | Cognitive support, non-judgmental tone, visual schedules      |
| **Signal**   | Offline-first, encryption at rest, transparent data practices |

---

## 9. Competitive Positioning

| Feature                     | Finance | YNAB           | Monarch       | Mint (RIP) |
| --------------------------- | ------- | -------------- | ------------- | ---------- |
| Offline-first               | ✅      | ❌             | ❌            | ❌         |
| Encrypted at rest           | ✅      | ❌             | ❌            | ❌         |
| No bank connection required | ✅      | ✅             | ❌            | ❌         |
| Expertise-tiered UI         | ✅      | ❌             | ❌            | ❌         |
| Contextual education        | ✅      | Blog only      | ❌            | ❌         |
| ADHD/cognitive-friendly     | ✅      | ❌             | ❌            | ❌         |
| Native per platform         | ✅      | Web only       | Web only      | Web only   |
| Free complete tracker       | ✅      | ❌ ($14.99/mo) | ❌ ($9.99/mo) | Was free   |
| Open source (BSL)           | ✅      | ❌             | ❌            | ❌         |
