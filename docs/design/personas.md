# User Personas & MVP Scope — Finance

> **Status:** PROPOSED — Pending human review
> **Last Updated:** 2025-07-15
> **Purpose:** Define target users, user journeys, and feature boundaries for MVP and beyond
> **Inspiration:** YNAB (budgeting methodology), Bevel (fitness UX patterns), TickTick (planning workflows), Strava (social/community), Tiimo (disability-inclusive design)

---

## MVP Scope Decision (PROPOSED)

- **MVP target:** Personal finance for a single user (Phases 1–4)
- **V1.1:** Couples/partner shared finances (Phase 7)
- **V2.0:** Family/household with multiple members (Phase 7+)

**Rationale:** Start simple, nail the core experience, then expand social features. The architecture already supports `household_id` on every row (see [roadmap](../architecture/roadmap.md)), so multi-user data isolation is baked in from day one — but the UI, permissions, and invitation flows are deferred until the single-user experience is polished. This mirrors how YNAB launched for individuals before adding multi-user budgets, and how Strava built solo tracking before layering on clubs and social feeds.

---

## Primary Personas

### Persona 1: Alex — The Intentional Spender (Primary MVP user)

| Attribute               | Details                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| **Age / Role**          | 28, software engineer                                                   |
| **Income**              | Earns well but feels money "disappears"                                 |
| **Wants**               | Know exactly where every dollar goes, feel in control                   |
| **Current tools**       | Spreadsheets, occasionally YNAB trial                                   |
| **Pain points**         | Existing apps are overwhelming, not native-feeling, data feels unsafe   |
| **Goal**                | _"I want to see my financial picture clearly without it being a chore"_ |
| **Accessibility needs** | None specific, but wants clean, minimal UI                              |
| **Platforms**           | iPhone (primary), Mac (secondary), Web (occasional)                     |

**Why Alex is the primary MVP persona:** Alex represents the largest addressable segment — employed adults who earn enough to budget but lack the habit. Alex values speed (quick-entry < 30 seconds), privacy (edge-first, encrypted), and native feel (SwiftUI on iOS, not a webview). Every MVP feature must pass the "Alex test": _does this help Alex feel more in control without adding friction?_

---

### Persona 2: Jordan — The Goal Setter

| Attribute               | Details                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| **Age / Role**          | 35, teacher                                                              |
| **Income**              | Modest, but disciplined                                                  |
| **Wants**               | Track progress toward goals, see projections, stay motivated             |
| **Current tools**       | Separate savings accounts, mental math                                   |
| **Pain points**         | Can't see holistic picture, no projections, juggling multiple accounts   |
| **Goal**                | _"I want to see if I'm on track for my goals and what I need to adjust"_ |
| **Accessibility needs** | Uses larger font sizes, prefers dark mode                                |
| **Platforms**           | Android phone (primary), Windows laptop (secondary)                      |

**Design implications:** Jordan validates the goal-tracking feature set. The app must support Dynamic Type / font scaling, dark mode theming via design tokens, and financial projections ("At this pace, you'll reach your goal by March 2028"). Jordan also validates the Android-first strategy — Android is Phase 3, iOS is Phase 4, ensuring Android isn't a second-class citizen.

---

### Persona 3: Sam — The Couple's Coordinator (V1.1)

| Attribute               | Details                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| **Age / Role**          | 30, marketing manager                                             |
| **Relationship**        | Shares finances with partner                                      |
| **Wants**               | Shared budget visibility, split expenses, maintain some privacy   |
| **Current tools**       | Shared spreadsheet, Venmo for splits                              |
| **Pain points**         | No good tool for "shared but not merged" finances                 |
| **Goal**                | _"We want to budget together without losing individual autonomy"_ |
| **Accessibility needs** | Partner has color vision deficiency                               |
| **Platforms**           | Mixed household (one iOS, one Android)                            |

**Design implications:** Sam is deferred to V1.1 but informs architectural decisions now. The RBAC role system (Owner, Partner, Member, Viewer) and household key exchange protocol must be designed in Phase 2 even if not exposed in UI until Phase 7. The color vision deficiency requirement validates the IBM CVD-safe palette choice and ensures all charts use pattern + color (never color alone). Cross-platform sync (iOS ↔ Android) is a hard requirement.

---

### Persona 4: Casey — The Accessibility-First User (Tiimo-inspired)

| Attribute               | Details                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------- |
| **Age / Role**          | 24, graduate student                                                                   |
| **Condition**           | Has ADHD                                                                               |
| **Wants**               | Financial tracking that doesn't overwhelm, gentle reminders, routine-friendly          |
| **Current tools**       | Nothing — existing apps are too complex                                                |
| **Pain points**         | Information overload, too many features, judgmental tone about spending                |
| **Goal**                | _"I want a financial app that works with my brain, not against it"_                    |
| **Accessibility needs** | Reduced motion, simplified views, non-judgmental language, routine-based notifications |
| **Platforms**           | iPhone, occasionally iPad                                                              |

**Design implications:** Casey is the conscience of the product. Every feature must have a "simplified view" toggle. Language must be descriptive, not judgmental — "You spent $200 on dining" not "You overspent on dining! 🚨". Notifications must be opt-in, gentle, and routine-aware (Tiimo-inspired). The `prefers-reduced-motion` media query and platform equivalents must be respected everywhere. Casey validates that the app serves users who have been excluded by every existing finance tool.

---

## User Journey Maps

### Journey 1: First-time setup (Alex)

```
Download → Onboarding → First Account → First Transaction → First Budget → Accomplishment
```

1. **Download app** → Onboarding asks _"What matters most to you?"_ (not "Enter all your accounts")
2. **Create first account** (checking) with current balance
3. **Add first transaction** manually
4. **See immediate feedback** — _"You have $X unbudgeted"_
5. **Create first budget category** (Food)
6. **Assign money** to the category
7. **Feel of accomplishment** — _"You're in control of $X"_

**Design notes:** Onboarding must feel like a conversation, not a form. Inspired by Bevel's fitness onboarding where you choose your goals before entering data. The app should be useful within 2 minutes of first launch. No bank connection required — manual entry first, bank sync later.

---

### Journey 2: Daily usage (Alex)

```
Open → Glance → Quick-entry → Budget update → Trend check → Close
```

1. **Open app** — see today's spending at a glance
2. **Record coffee purchase** (quick-entry: amount + category, 3 taps)
3. **See budget category update** in real-time
4. **Glance at weekly trend** — _"You're on pace this week"_
5. **Close app** — total interaction: **< 30 seconds**

**Design notes:** The daily loop must be frictionless. Inspired by Strava's "record activity → see stats → close" flow. Quick-entry is the most critical interaction in the entire app — it must be faster than opening a spreadsheet. Smart defaults (last-used category, common amounts) reduce taps over time.

---

### Journey 3: Monthly review (Jordan)

```
Open → Spending breakdown → Budget comparison → Goal progress → Projection → Adjust → Clarity
```

1. **Open app** at month end
2. **See spending breakdown** by category (visual chart)
3. **Compare to budget** — green/yellow/red indicators
4. **Check goal progress** — _"House fund: 47% ($23,500 / $50,000)"_
5. **See projection** — _"At this pace, you'll hit your goal by March 2028"_
6. **Adjust** next month's budget allocations
7. **Feel clarity and motivation**

**Design notes:** Monthly review should feel rewarding, not punitive. Inspired by TickTick's weekly review where you see accomplishments alongside areas for improvement. Charts must be accessible (color-blind safe palette, screen reader descriptions). Projections use simple linear extrapolation for MVP — ML-based predictions are future scope.

---

## MVP Feature Boundaries

### ✅ IN scope for MVP (Personal, single user)

| Feature             | Description                                                          | Phase   |
| ------------------- | -------------------------------------------------------------------- | ------- |
| Account management  | Manual accounts with balances (checking, savings, credit card, cash) | Phase 3 |
| Transaction entry   | Manual entry with quick-entry flow (amount + category, 3 taps)       | Phase 3 |
| Category management | Hierarchical, customizable categories with icons                     | Phase 3 |
| Envelope budgeting  | Zero-based / YNAB-inspired envelope method                           | Phase 3 |
| Basic reporting     | Spending by category, trends over time, budget vs actual             | Phase 3 |
| Goal tracking       | Savings goals with progress bars and projections                     | Phase 3 |
| Multi-device sync   | Offline-first via PowerSync, works without internet                  | Phase 2 |
| Android app         | Jetpack Compose, Material Design 3, TalkBack accessible              | Phase 3 |
| iOS app             | SwiftUI, Human Interface Guidelines, VoiceOver accessible            | Phase 4 |
| Web PWA             | Responsive, offline-capable, WCAG 2.2 AA compliant                   | Phase 5 |
| Windows app         | Desktop-optimized, Narrator accessible                               | Phase 6 |

### ❌ OUT of scope for MVP

| Feature                           | Reason                                                             | Target         |
| --------------------------------- | ------------------------------------------------------------------ | -------------- |
| Bank connections (Plaid/MX)       | Adds complexity, cost (~$500+/mo), and third-party data dependency | Future         |
| Partner/family sharing            | Requires RBAC, invitation flows, shared key exchange               | V1.1 (Phase 7) |
| Recurring transaction scheduling  | Nice-to-have, not core to budgeting loop                           | Phase 7        |
| Multi-currency                    | Adds complexity to money arithmetic and reporting                  | Phase 7        |
| Investment tracking               | Different domain (portfolio management vs budgeting)               | Future         |
| Tax categorization                | Requires jurisdiction-specific rules                               | Future         |
| AI-powered categorization         | Use manual rules first; add ML once usage patterns exist           | Future         |
| Social features (Strava-inspired) | Requires multi-user; build community after core is proven          | Future         |
| Natural language input            | "Spent $45 at Target groceries" — requires NLP pipeline            | Phase 7        |
| Gamification                      | Streaks, badges, milestones — layer on after core habit forms      | Phase 7        |

---

## Persona-to-Feature Mapping

| Feature                     | Alex | Jordan | Casey | Sam (V1.1) |
| --------------------------- | :--: | :----: | :---: | :--------: |
| Quick-entry transactions    | ★★★  |   ★★   |  ★★★  |     ★★     |
| Envelope budgeting          | ★★★  |   ★★   |   ★   |    ★★★     |
| Goal tracking & projections |  ★   |  ★★★   |   ★   |     ★★     |
| Simplified views            |  ★   |   ★    |  ★★★  |     ★      |
| Dark mode                   |  ★★  |  ★★★   |  ★★   |     ★★     |
| Reduced motion              |  —   |   —    |  ★★★  |     —      |
| Non-judgmental language     |  ★   |   ★    |  ★★★  |     ★      |
| Shared budgets              |  —   |   —    |   —   |    ★★★     |
| CVD-safe charts             |  ★   |   ★    |   ★   |    ★★★     |
| Multi-device sync           | ★★★  |   ★★   |   ★   |    ★★★     |

_★★★ = critical, ★★ = important, ★ = nice-to-have, — = not applicable_

---

## References

- [System Architecture Roadmap](../architecture/roadmap.md) — Phase definitions and technology decisions
- [README.md](../../README.md) — Project vision and principles
- [YNAB Methodology](https://www.ynab.com/the-four-rules) — Envelope budgeting inspiration
- [Tiimo](https://www.tiimoapp.com/) — Disability-inclusive design patterns
- [Bevel](https://www.bfrnd.com/) — Fitness UX onboarding inspiration
- [Strava](https://www.strava.com/) — Social/community feature patterns
- [TickTick](https://ticktick.com/) — Planning and review workflow inspiration
