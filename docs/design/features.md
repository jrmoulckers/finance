# Feature Specification — Finance

> **Status:** DRAFT — Pending human review
> **Last Updated:** 2026-03-06
> **Purpose:** Source-of-truth for GitHub issue creation

## How to Read This Document

- Each feature has a unique ID (e.g., `ACCT-001`)
- ✅ = MVP scope, 📋 = Future release
- User stories reference personas from `docs/design/personas.md`
- Acceptance criteria are checkboxes suitable for GitHub issues
- All monetary values use integer cents (Long/BIGINT) + ISO 4217 currency code

---

## 1. Account Management

### ACCT-001: Create Account ✅

**Description:** User creates a financial account to track balances and transactions.

**User Story:** As Alex, I want to add my checking account so I can start tracking where my money goes.

**Scenario:**

- Given I am on the accounts screen
- When I tap "Add Account" and enter name "Chase Checking", type "Checking", balance "$2,450.00"
- Then a new account appears in my list with balance $2,450.00

**Acceptance Criteria:**

- [ ] Account types: Checking, Savings, Credit Card, Cash, Investment, Loan, Other
- [ ] Name required, max 50 characters
- [ ] Initial balance stored as integer cents (245000) with ISO 4217 currency code
- [ ] Account icon auto-selected by type, customizable
- [ ] Works fully offline — created in local SQLite first
- [ ] Syncs to other devices when connectivity available

**Components:** packages/models, packages/core, packages/sync

---

### ACCT-002: View Account List ✅

**Description:** User sees all accounts with current balances grouped by type.

**User Story:** As Alex, I want to see all my accounts at a glance so I know my total financial picture.

**Scenario:**

- Given I have 3 accounts (checking, savings, credit card)
- When I open the accounts screen
- Then I see accounts grouped by type with individual and total balances

**Acceptance Criteria:**

- [ ] Accounts grouped by type (Assets, Liabilities)
- [ ] Net worth displayed as total assets minus total liabilities
- [ ] Each account shows name, current balance, and last transaction date
- [ ] Pull-to-refresh triggers manual sync
- [ ] Accessible: all balances announced by screen reader with currency

**Components:** packages/models, packages/core, apps/\*

---

### ACCT-003: Edit Account ✅

**Description:** User edits account name, type, or other metadata.

**User Story:** As Jordan, I want to rename my savings account to "House Down Payment" to reflect its purpose.

**Scenario:**

- Given I have an account named "Savings"
- When I edit it and change the name to "House Down Payment"
- Then the account appears with the new name everywhere

**Acceptance Criteria:**

- [ ] Can edit name, type, icon, and notes
- [ ] Cannot directly edit balance (balance is derived from transactions)
- [ ] Balance adjustment creates an adjustment transaction
- [ ] Changes sync to other devices

**Components:** packages/models, packages/core

---

### ACCT-004: Archive Account ✅

**Description:** User archives an account that is no longer active, preserving history.

**User Story:** As Alex, I want to archive my old credit card account so it's not cluttering my view but I keep the history.

**Scenario:**

- Given I have a closed credit card with zero balance
- When I archive the account
- Then it disappears from the main list but appears under "Archived" and its history remains

**Acceptance Criteria:**

- [ ] Soft-delete (archived flag, not removed)
- [ ] Archived accounts hidden from main list, visible in "Archived" section
- [ ] Historical transactions preserved and searchable
- [ ] Archived account balance excluded from net worth
- [ ] Can be un-archived

**Components:** packages/models, packages/core

---

## 2. Transaction Management

### TXNS-001: Quick-Entry Transaction ✅

**Description:** Record a transaction in 3 taps or fewer — the most frequent action in the app.

**User Story:** As Alex, I want to record my coffee purchase in under 10 seconds so tracking doesn't feel like a chore.

**Scenario:**

- Given I open the app
- When I tap the quick-entry button, type "4.50", and select "Coffee & Tea"
- Then the transaction is saved, my account balance updates, and my budget reflects the spend

**Acceptance Criteria:**

- [ ] Quick-entry accessible from any screen (floating action button or tab)
- [ ] Amount entry with numeric keypad (no currency symbol needed, app knows default)
- [ ] Smart category suggestion based on recent transactions
- [ ] Default account pre-selected (last used or primary)
- [ ] Optional: payee, date, notes (hidden behind "More details")
- [ ] Haptic confirmation on save
- [ ] Transaction saved to local SQLite immediately
- [ ] Budget category balance updates instantly

**Components:** packages/models, packages/core, apps/\*

---

### TXNS-002: View Transaction List ✅

**Description:** User sees a chronological list of transactions, filterable by account, category, or date range.

**User Story:** As Jordan, I want to see all my recent transactions so I can review my spending.

**Scenario:**

- Given I have 50 transactions this month
- When I open the transactions screen
- Then I see them sorted by date (newest first) with amounts, categories, and payees

**Acceptance Criteria:**

- [ ] Sorted by date descending by default
- [ ] Each row: date, payee/description, category icon, amount (color-coded income/expense)
- [ ] Filter by: account, category, date range, amount range
- [ ] Search by payee name or notes
- [ ] Infinite scroll / pagination for large lists
- [ ] Running balance shown per account view
- [ ] Accessible: each transaction row announced with full context

**Components:** packages/models, packages/core, apps/\*

---

### TXNS-003: Edit Transaction ✅

**Description:** User edits any field of an existing transaction.

**User Story:** As Alex, I want to fix the category on a transaction I miscategorized.

**Scenario:**

- Given I have a transaction categorized as "Dining"
- When I edit it and change the category to "Groceries"
- Then the budgets for both categories update accordingly

**Acceptance Criteria:**

- [ ] All fields editable: amount, category, account, payee, date, notes
- [ ] Budget balances recalculated on save
- [ ] Edit history preserved (last modified timestamp)
- [ ] Syncs update to other devices

**Components:** packages/models, packages/core

---

### TXNS-004: Delete Transaction ✅

**Description:** User deletes a transaction with confirmation.

**User Story:** As Alex, I want to delete a duplicate transaction.

**Scenario:**

- Given I have a duplicate transaction
- When I swipe to delete and confirm
- Then the transaction is removed and account/budget balances update

**Acceptance Criteria:**

- [ ] Confirmation dialog before deletion
- [ ] Soft-delete (deleted_at timestamp, not hard delete)
- [ ] Account balance and budget recalculated
- [ ] Undo available for 10 seconds after deletion

**Components:** packages/models, packages/core

---

### TXNS-005: Transfer Between Accounts ✅

**Description:** User transfers money between two of their accounts.

**User Story:** As Jordan, I want to transfer $500 from checking to my "House Down Payment" savings.

**Scenario:**

- Given I have checking ($3,000) and savings ($20,000)
- When I create a transfer of $500 from checking to savings
- Then checking shows $2,500, savings shows $20,500, and no budget category is affected

**Acceptance Criteria:**

- [ ] Creates two linked transaction records (debit + credit)
- [ ] Does not affect any budget category
- [ ] Both account balances update immediately
- [ ] Transfer shown in both account transaction lists
- [ ] Displayed distinctly from regular transactions (transfer icon)

**Components:** packages/models, packages/core

---

### TXNS-006: Split Transaction ✅

**Description:** User splits a single transaction across multiple categories.

**User Story:** As Alex, I want to split my Costco receipt: $80 groceries, $30 household, $15 personal care.

**Scenario:**

- Given I enter a transaction for $125 at Costco
- When I split it into 3 categories with amounts $80, $30, $15
- Then all 3 budget categories update and the split totals exactly $125

**Acceptance Criteria:**

- [ ] Split into 2-10 categories
- [ ] Split amounts must sum to total (enforced, with remainder allocated to last item using banker's rounding)
- [ ] Each split line has its own category
- [ ] Budget updates for each category
- [ ] Displayed as one transaction with expandable splits

**Components:** packages/models, packages/core

---

### TXNS-007: Transaction Search ✅

**Description:** Full-text search across payees, notes, and amounts.

**User Story:** As Jordan, I want to find all transactions from "Amazon" to see how much I've spent there.

**Scenario:**

- Given I search for "Amazon"
- When results appear
- Then I see all matching transactions with a total sum

**Acceptance Criteria:**

- [ ] Search by payee, notes, amount, category name
- [ ] Results show matching transactions with highlighted terms
- [ ] Aggregate total of search results displayed
- [ ] Search works offline (local SQLite full-text search)

**Components:** packages/models, packages/core

---

### TXNS-008: Recurring Transactions 📋 Phase 7

**Description:** Define recurring transactions (subscriptions, bills, income) that auto-generate.

**User Story:** As Alex, I want to set up my $15/month Netflix subscription so it appears automatically each month.

**Scenario:**

- Given I create a recurring expense: $15, "Netflix", monthly on the 1st
- When the 1st of next month arrives
- Then the transaction appears automatically and my budget updates

**Acceptance Criteria:**

- [ ] Schedule types: daily, weekly, bi-weekly, monthly, yearly, custom
- [ ] Auto-generate upcoming instances for budget forecasting
- [ ] Handle variable amounts (estimated vs actual)
- [ ] Skip, modify single instance, or modify entire series
- [ ] Notification before upcoming bill

**Components:** packages/models, packages/core

---

## 3. Category Management

### CAT-001: Default Categories ✅

**Description:** App ships with sensible default categories in a hierarchy.

**User Story:** As Casey, I want useful categories already set up so I don't have to figure out how to organize everything.

**Scenario:**

- Given I create my first account
- When I go to add a transaction
- Then I see pre-populated categories like Food > Groceries, Food > Dining Out, Transport > Gas, etc.

**Acceptance Criteria:**

- [ ] Default hierarchy: ~10 top-level, ~30 sub-categories
- [ ] Top-level: Food, Transport, Housing, Utilities, Health, Personal, Entertainment, Shopping, Education, Income
- [ ] Each category has a default icon and color
- [ ] Defaults can be edited, reordered, or deleted by user
- [ ] "Uncategorized" exists as a catch-all

**Components:** packages/models, packages/core

---

### CAT-002: Create Custom Category ✅

**Description:** User creates their own categories and sub-categories.

**User Story:** As Alex, I want to add a "Side Hustle" income category for my freelance work.

**Scenario:**

- Given I'm in category management
- When I create a new category "Side Hustle" under "Income" with a briefcase icon
- Then it appears in category pickers when entering transactions

**Acceptance Criteria:**

- [ ] Create at top-level or as sub-category
- [ ] Choose icon from platform-native icon set
- [ ] Choose color (from accessible palette)
- [ ] Max 3 levels of hierarchy
- [ ] Category name unique within its parent

**Components:** packages/models, packages/core

---

### CAT-003: Edit and Reorder Categories ✅

**Description:** User renames, re-colors, or reorders categories.

**User Story:** As Jordan, I want to reorder my categories so the ones I use most are at the top.

**Acceptance Criteria:**

- [ ] Drag-to-reorder with accessible keyboard alternative
- [ ] Edit name, icon, color
- [ ] Move sub-category to different parent
- [ ] Delete category (must reassign existing transactions first)

**Components:** packages/models, packages/core

---

### CAT-004: Auto-Categorization Rules 📋

**Description:** App learns from past categorization to suggest categories for new transactions.

**User Story:** As Alex, I want the app to automatically categorize my Starbucks transactions as "Coffee & Tea."

**Acceptance Criteria:**

- [ ] Rule: if payee matches pattern → suggest category
- [ ] User confirms or overrides suggestion (not silent auto-assign)
- [ ] Rules editable in settings
- [ ] Manual override feeds back into rules

**Components:** packages/models, packages/core

---

## 4. Budgeting

### BUD-001: Create Monthly Budget ✅

**Description:** User creates an envelope-style budget allocating income to categories.

**User Story:** As Alex, I want to give every dollar a job so I know exactly what I can spend.

**Scenario:**

- Given I have $4,000 income this month
- When I allocate $600 to Food, $1,200 to Housing, $400 to Transport, etc.
- Then I see "To Budget: $0" when all money is assigned

**Acceptance Criteria:**

- [ ] Shows total income available to budget
- [ ] "To Budget" counter decreases as money is assigned
- [ ] Goal: $0 remaining (zero-based)
- [ ] Can allocate more than available (shows negative "To Budget")
- [ ] Budget period: monthly (configurable in future)
- [ ] Each category shows: budgeted, spent, remaining

**Components:** packages/models, packages/core

---

### BUD-002: View Budget Progress ✅

**Description:** Visual indicators showing spending progress per category.

**User Story:** As Alex, I want to see at a glance which categories are on track and which are running low.

**Scenario:**

- Given I budgeted $600 for Food and spent $450 (75%)
- When I view my budget
- Then Food shows a progress bar at 75% with $150 remaining

**Acceptance Criteria:**

- [ ] Progress bar per category (budgeted vs spent)
- [ ] Color indicators: green (<80%), yellow (80-100%), neutral at 100%+
- [ ] Non-judgmental language for overspending: "Used 110%" not "Overspent!"
- [ ] Overall budget health summary at top
- [ ] Accessible: progress announced as percentage by screen reader

**Components:** packages/core, apps/\*

---

### BUD-003: Budget Rollover ✅

**Description:** Unspent budget carries forward to the next month.

**User Story:** As Jordan, I only spent $400 of my $600 food budget — I want that $200 to carry forward.

**Scenario:**

- Given I have $200 remaining in Food at month end
- When the new month begins
- Then Food starts with $200 + whatever I assign this month

**Acceptance Criteria:**

- [ ] Rollover enabled/disabled per category
- [ ] Positive rollover: unspent carries forward
- [ ] Negative rollover: overspending carries as debt to next month
- [ ] Rollover amount visible as separate line from new allocation

**Components:** packages/models, packages/core

---

### BUD-004: Cover Overspending ✅

**Description:** Move money between budget categories to cover overspending.

**User Story:** As Alex, I overspent on Dining — I want to move $50 from Entertainment to cover it.

**Scenario:**

- Given Entertainment has $100 remaining and Dining is $50 over
- When I move $50 from Entertainment to Dining
- Then Entertainment shows $50 remaining and Dining shows $0 remaining

**Acceptance Criteria:**

- [ ] Quick "cover" action from overspent category
- [ ] Shows available categories with remaining balances
- [ ] Amount validated against source category balance
- [ ] Both categories update instantly

**Components:** packages/core

---

### BUD-005: Budget Alerts 📋

**Description:** Notifications when approaching or exceeding budget limits.

**User Story:** As Casey, I want a gentle reminder when I've used 80% of my food budget.

**Acceptance Criteria:**

- [ ] Configurable thresholds: 50%, 80%, 100%
- [ ] Non-judgmental tone: "You've used 80% of your Food budget this month"
- [ ] Platform-native notifications (opt-in only)
- [ ] Simplified view: show alerts as card on home screen

**Components:** packages/core, apps/\*

---

## 5. Goal Tracking

### GOAL-001: Create Savings Goal ✅

**Description:** User sets a savings target with optional deadline.

**User Story:** As Jordan, I want to save $50,000 for a house down payment by December 2028.

**Scenario:**

- Given I'm on the goals screen
- When I create a goal: "House Down Payment", target $50,000, deadline Dec 2028
- Then I see the goal with $0 saved, 0% progress, and required monthly contribution

**Acceptance Criteria:**

- [ ] Goal name, target amount (integer cents), optional deadline
- [ ] Target amount in user's default currency
- [ ] If deadline set: calculate required monthly contribution
- [ ] Goal icon and color customizable
- [ ] Multiple goals supported

**Components:** packages/models, packages/core

---

### GOAL-002: Track Goal Progress ✅

**Description:** Visual progress toward savings goals.

**User Story:** As Jordan, I want to see how close I am to my house fund goal.

**Scenario:**

- Given my goal is $50,000 and I've saved $23,500
- When I view the goal
- Then I see 47% progress, $26,500 remaining, and a projection date

**Acceptance Criteria:**

- [ ] Progress bar with percentage
- [ ] Amount saved vs target
- [ ] If deadline: on-track / behind / ahead indicator
- [ ] Projection: "At this pace, you'll reach your goal by [date]"
- [ ] Milestone celebrations (25%, 50%, 75%, 100%)

**Components:** packages/core, apps/\*

---

### GOAL-003: Fund Goal ✅

**Description:** Allocate money toward a goal from income or budget categories.

**User Story:** As Jordan, I want to put $500 from this month's income toward my house fund.

**Scenario:**

- Given I have $500 in "To Budget"
- When I assign $500 to my House Down Payment goal
- Then the goal progress updates and "To Budget" decreases by $500

**Acceptance Criteria:**

- [ ] Fund from unbudgeted income
- [ ] Fund from budget categories (transfer allocation)
- [ ] Goal contributions appear in goal history
- [ ] Budget reflects the allocation

**Components:** packages/models, packages/core

---

## 6. Reporting & Analytics

### RPT-001: Spending by Category ✅

**Description:** Visual breakdown of spending per category for a time period.

**User Story:** As Alex, I want to see where my money goes each month in a clear chart.

**Scenario:**

- Given I have transactions across 8 categories this month
- When I view the spending report
- Then I see a pie/donut chart with amounts and percentages per category

**Acceptance Criteria:**

- [ ] Pie or donut chart (accessible: also show as list)
- [ ] Color-blind safe palette (IBM CVD-safe)
- [ ] Tap category to drill into transactions
- [ ] Time period selectable: this month, last month, custom range
- [ ] Shows total spending for the period

**Components:** packages/core, apps/\*

---

### RPT-002: Spending Trends ✅

**Description:** Monthly spending trends over time.

**User Story:** As Jordan, I want to see if my dining spending is going up or down over the last 6 months.

**Acceptance Criteria:**

- [ ] Line or bar chart showing monthly totals
- [ ] Filter by category or view all
- [ ] 3, 6, 12 month views
- [ ] Trend indicator: up/down percentage vs previous period
- [ ] Accessible: data available as table, not just chart

**Components:** packages/core, apps/\*

---

### RPT-003: Income vs Expenses ✅

**Description:** Compare total income to total expenses.

**User Story:** As Alex, I want to see my savings rate — how much I keep vs spend each month.

**Acceptance Criteria:**

- [ ] Side-by-side or stacked bar: income vs expenses
- [ ] Savings amount and rate (percentage)
- [ ] Monthly trend over time
- [ ] Breakdown by income sources

**Components:** packages/core, apps/\*

---

### RPT-004: Net Worth ✅

**Description:** Track total net worth (assets minus liabilities) over time.

**User Story:** As Jordan, I want to see my net worth growing over time to stay motivated.

**Acceptance Criteria:**

- [ ] Net worth = sum(asset accounts) - sum(liability accounts)
- [ ] Line chart showing trend over months/years
- [ ] Breakdown by account
- [ ] Excludes archived accounts

**Components:** packages/core, apps/\*

---

## 7. Settings & Preferences

### SET-001: Default Currency ✅

**Description:** User sets their primary currency for display and new accounts.

**Acceptance Criteria:**

- [ ] ISO 4217 currency picker
- [ ] Affects display formatting (symbol, decimal places, position)
- [ ] Does not convert existing balances (informational only)

**Components:** packages/models, apps/\*

---

### SET-002: Biometric Auth ✅

**Description:** Lock the app with Face ID, fingerprint, or Windows Hello.

**User Story:** As Alex, I want the app locked with Face ID so nobody can see my finances.

**Acceptance Criteria:**

- [ ] Toggle on/off in settings
- [ ] Platform-native biometric: Face ID/Touch ID (iOS), fingerprint/face (Android), Windows Hello, Web AuthN
- [ ] Fallback to device PIN/passcode
- [ ] Configurable: require on every open vs after 5 min inactivity

**Components:** packages/core, apps/\*

---

### SET-003: Data Export ✅

**Description:** Export all user data in machine-readable formats (GDPR compliance).

**User Story:** As Alex, I want to export all my data so I have a backup and can move to another app if needed.

**Acceptance Criteria:**

- [ ] Export formats: JSON (complete), CSV (transactions)
- [ ] Export includes: accounts, transactions, categories, budgets, goals
- [ ] One-tap export, no waiting for email
- [ ] File saved to device or shared via platform share sheet

**Components:** packages/core, apps/\*

---

### SET-004: Account Deletion ✅

**Description:** Permanently delete user account and all data.

**Acceptance Criteria:**

- [ ] Confirmation with typed phrase ("DELETE MY DATA")
- [ ] Deletes all local data
- [ ] Triggers server-side deletion (crypto-shredding)
- [ ] Confirmation email sent
- [ ] Irreversible after 30-day grace period

**Components:** packages/core, services/api

---

### SET-005: Simplified View Mode ✅

**Description:** Reduced-complexity view for cognitive accessibility (Tiimo-inspired).

**User Story:** As Casey, I want a simpler view that shows just the essentials without overwhelming me.

**Acceptance Criteria:**

- [ ] Toggle in settings (respects system accessibility settings)
- [ ] Shows: total balance, today's spending, top 3 budget categories, next goal milestone
- [ ] Hides: detailed charts, transaction history (still accessible via menu)
- [ ] Larger text, more whitespace, fewer numbers on screen
- [ ] Reduced motion (no animations)

**Components:** apps/\*

---

## 8. Onboarding

### ONB-001: Welcome Flow ✅

**Description:** 3-5 screen onboarding that's encouraging, not overwhelming.

**User Story:** As Casey, I want onboarding that feels inviting and doesn't ask too much of me right away.

**Acceptance Criteria:**

- [ ] Max 5 screens, skippable
- [ ] Screen 1: "Welcome — take control of your finances" (warm, not corporate)
- [ ] Screen 2: "What matters most?" (pick goals: save more, track spending, budget, reduce debt)
- [ ] Screen 3: Create first account (just name + balance)
- [ ] Screen 4: Quick tutorial on adding a transaction
- [ ] No sign-up required to start (auth can happen later for sync)
- [ ] Accessible: all onboarding screens work with screen readers

**Components:** apps/\*

---

### ONB-002: Guided First Budget ✅

**Description:** Walk user through creating their first budget after entering initial income.

**User Story:** As Alex, I want help setting up my first budget because I've never done envelope budgeting before.

**Acceptance Criteria:**

- [ ] Triggered after first income transaction or "Set Up Budget" button
- [ ] Suggest allocations based on 50/30/20 rule as starting point
- [ ] User adjusts allocations
- [ ] Celebrate completion: "You just gave every dollar a job! 🎉"

**Components:** packages/core, apps/\*

---

## 9. Sync & Multi-Device

### SYNC-001: Automatic Background Sync ✅

**Description:** Data syncs automatically in the background when connected.

**User Story:** As Alex, I want my data to appear on my Mac without doing anything on my phone.

**Acceptance Criteria:**

- [ ] Sync triggered on: app open, transaction save, periodic background task
- [ ] Delta sync (only changed records since last sync)
- [ ] No user action required
- [ ] Sync works over WiFi and cellular
- [ ] Battery-friendly background scheduling (WorkManager / BGTaskScheduler)

**Components:** packages/sync, services/api

---

### SYNC-002: Conflict Resolution ✅

**Description:** Handle conflicts when same record edited on two devices offline.

**User Story:** As Alex, I edited a transaction on my phone and Mac while offline — the app should handle it.

**Acceptance Criteria:**

- [ ] Last-write-wins for simple field changes (automatic, silent)
- [ ] User prompt for ambiguous conflicts (both changed amount)
- [ ] Conflict UI shows both versions, user picks
- [ ] No data silently discarded
- [ ] Conflict resolution works offline (queued for next sync)

**Components:** packages/sync, apps/\*

---

### SYNC-003: Sync Status Indicator ✅

**Description:** Subtle indicator showing sync state.

**Acceptance Criteria:**

- [ ] States: synced (green dot), syncing (animated), pending (yellow), offline (grey)
- [ ] Tappable to see last sync time and pending changes count
- [ ] Never blocks UI — purely informational
- [ ] Accessible: state announced by screen reader

**Components:** packages/sync, apps/\*

---

## 10. Shared Finances 📋 (V1.1)

### SHARE-001: Create Household 📋

**Description:** Create a shared space for partner/family financial collaboration.

**User Story:** As Sam, I want to create a shared financial space with my partner.

**Acceptance Criteria:**

- [ ] Household has a name and owner
- [ ] Owner can invite members via email or link
- [ ] Household has its own shared accounts and budgets
- [ ] Members can have personal accounts not visible to others

**Components:** packages/models, packages/core, services/api

---

### SHARE-002: Shared vs Personal Budgets 📋

**Description:** Some budget categories are shared (rent), others personal (hobbies).

**Acceptance Criteria:**

- [ ] Budget categories flagged as "shared" or "personal"
- [ ] Shared: visible to all household members
- [ ] Personal: visible only to the individual
- [ ] Spending in shared categories rolls up to shared reports

**Components:** packages/models, packages/core

---

### SHARE-003: Permission Levels 📋

**Description:** Household members have different access levels.

**Acceptance Criteria:**

- [ ] Roles: Owner (full control), Partner (edit shared, view all), Member (edit own, view shared), Viewer (read-only)
- [ ] Owner can change roles
- [ ] Enforced server-side via PostgreSQL RLS
- [ ] Cannot escalate own permissions

**Components:** packages/models, services/api

---

## Feature Count Summary

| Group        | MVP (✅) | Future (📋) | Total  |
| ------------ | -------- | ----------- | ------ |
| Accounts     | 4        | 0           | 4      |
| Transactions | 7        | 1           | 8      |
| Categories   | 3        | 1           | 4      |
| Budgeting    | 4        | 1           | 5      |
| Goals        | 3        | 0           | 3      |
| Reporting    | 4        | 0           | 4      |
| Settings     | 5        | 0           | 5      |
| Onboarding   | 2        | 0           | 2      |
| Sync         | 3        | 0           | 3      |
| Shared       | 0        | 3           | 3      |
| **Total**    | **35**   | **6**       | **41** |
