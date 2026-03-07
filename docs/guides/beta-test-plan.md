# Beta Test Plan — Detailed Scenarios

> 10 critical user journeys that every beta tester must complete on every
> platform. Each scenario includes preconditions, steps, and expected results.

---

## Scenario 1: Account Creation and Sign-In

### 1a. Email Registration

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| App freshly installed, no existing account             |
| **Steps**       | 1. Tap **Get Started** on the onboarding screen. <br> 2. Select **Sign up with email**. <br> 3. Enter a valid email and a password (≥ 8 chars, 1 uppercase, 1 number). <br> 4. Tap **Create Account**. <br> 5. Verify the confirmation email arrives within 60 s. <br> 6. Tap the verification link. <br> 7. Return to the app — should land on the Dashboard. |
| **Expected**    | Account is created. Dashboard shows empty state with prompts to add a transaction and create a budget. |

### 1b. Social Sign-In (Google / Apple)

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| App freshly installed, Google or Apple account available |
| **Steps**       | 1. Tap **Get Started**. <br> 2. Select **Continue with Google** (or **Continue with Apple** on iOS). <br> 3. Complete the OAuth consent flow. <br> 4. App should land on the Dashboard. |
| **Expected**    | Account is created using the social provider. Display name and avatar are populated from the social profile. |

### 1c. Passkey Sign-In

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| Account already exists, device supports passkeys       |
| **Steps**       | 1. On the sign-in screen, tap **Sign in with Passkey**. <br> 2. Authenticate via biometrics (fingerprint / Face ID / Windows Hello). <br> 3. App should land on the Dashboard. |
| **Expected**    | Sign-in completes without entering a password. Session is established. |

### 1d. Sign-Out and Re-Sign-In

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| User is signed in                                     |
| **Steps**       | 1. Navigate to **Settings** → **Sign Out**. <br> 2. Confirm sign-out. <br> 3. App returns to the onboarding/sign-in screen. <br> 4. Sign back in using any method. |
| **Expected**    | All data is still present after re-sign-in. No data loss. |

---

## Scenario 2: Transaction CRUD

### 2a. Create a Transaction

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| User is signed in, on the Dashboard or Transaction List |
| **Steps**       | 1. Tap the **+** FAB or **Add Transaction** button. <br> 2. Enter amount: `$42.50`. <br> 3. Select category: **Groceries**. <br> 4. Add a note: "Weekly groceries". <br> 5. Set date to today. <br> 6. Tap **Save**. |
| **Expected**    | Transaction appears in the list. Dashboard totals update to reflect the new amount. |

### 2b. Edit a Transaction

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| At least one transaction exists                        |
| **Steps**       | 1. Tap on the transaction created in 2a. <br> 2. Change the amount to `$45.00`. <br> 3. Change the category to **Food & Dining**. <br> 4. Tap **Save**. |
| **Expected**    | Transaction list and detail screen show updated values. Dashboard totals recalculate. |

### 2c. Delete a Transaction

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| At least one transaction exists                        |
| **Steps**       | 1. Swipe left on the transaction (mobile) or click the delete icon (desktop/web). <br> 2. Confirm deletion in the dialog. |
| **Expected**    | Transaction is removed from the list. Dashboard totals recalculate. Undo snackbar appears for 5 s. |

### 2d. Search Transactions

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| At least 5 transactions exist with varied notes        |
| **Steps**       | 1. Tap the **search** icon on the Transaction List. <br> 2. Type a keyword that matches one transaction's note. <br> 3. Verify filtered results. <br> 4. Clear the search. |
| **Expected**    | Only matching transactions are shown. Clearing restores the full list. |

### 2e. Filter Transactions

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| Transactions exist in multiple categories and date ranges |
| **Steps**       | 1. Tap the **filter** icon. <br> 2. Filter by category: **Groceries**. <br> 3. Verify only grocery transactions are shown. <br> 4. Add a date range filter: last 7 days. <br> 5. Verify the intersection of both filters. <br> 6. Remove all filters. |
| **Expected**    | Filters apply correctly. Counts update. Removing filters restores the full list. |

---

## Scenario 3: Budget Creation and Tracking

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| User is signed in, no budgets exist                    |
| **Steps**       | 1. Navigate to **Budgets** tab. <br> 2. Tap **Create Budget**. <br> 3. Select category: **Groceries**. <br> 4. Set monthly limit: `$400`. <br> 5. Tap **Save**. <br> 6. Add a transaction in the Groceries category for `$50`. <br> 7. Return to the Budgets tab. |
| **Expected**    | Budget card shows `$50 / $400` spent (12.5%). Progress bar updates. Color is green (under budget). |

**Additional checks:**

- When spending reaches 80%, the progress bar turns **amber** and a notification fires.
- When spending exceeds 100%, the progress bar turns **red**.
- Budget resets at the start of the next calendar month.

---

## Scenario 4: Goal Setting and Milestone Celebrations

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| User is signed in                                     |
| **Steps**       | 1. Navigate to **Goals** tab. <br> 2. Tap **Create Goal**. <br> 3. Enter name: "Emergency Fund". <br> 4. Set target amount: `$1,000`. <br> 5. Set target date: 6 months from today. <br> 6. Tap **Save**. <br> 7. Add a contribution of `$250`. <br> 8. Add another contribution of `$250` (now at 50%). |
| **Expected**    | Goal card shows `$500 / $1,000` (50%). At 25% and 50% milestones, a celebration animation plays (confetti or similar). Progress ring updates smoothly. |

**Milestone thresholds:** 25%, 50%, 75%, 100%.

---

## Scenario 5: Offline Usage → Reconnect → Sync

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| User is signed in, at least one transaction exists, device is online |
| **Steps**       | 1. Enable airplane mode (or disconnect Wi-Fi / Ethernet). <br> 2. Add a new transaction: `$20` in **Coffee**. <br> 3. Edit an existing transaction's note. <br> 4. Verify the app shows an **offline indicator** (banner or icon). <br> 5. Verify changes appear in the local transaction list. <br> 6. Disable airplane mode (reconnect). <br> 7. Wait for sync to complete (sync indicator spins then disappears). |
| **Expected**    | All offline changes sync to the server. Opening the app on a second device shows the synced data. No duplicate transactions. No data loss. |

---

## Scenario 6: Multi-Device Sync

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| Same account signed in on two different devices/platforms |
| **Steps**       | 1. On **Device A**, add a transaction: `$15` in **Transport**. <br> 2. On **Device B**, pull-to-refresh or wait for real-time sync. <br> 3. Verify the transaction appears on Device B. <br> 4. On **Device B**, edit the transaction amount to `$18`. <br> 5. On **Device A**, verify the updated amount. |
| **Expected**    | Data is consistent across both devices within 5 seconds (real-time) or on next refresh. No conflicts or duplicates. |

---

## Scenario 7: Data Export

### 7a. JSON Export

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| At least 10 transactions exist                         |
| **Steps**       | 1. Navigate to **Settings** → **Export Data**. <br> 2. Select format: **JSON**. <br> 3. Select date range: **All time**. <br> 4. Tap **Export**. <br> 5. Open the downloaded file. |
| **Expected**    | A valid JSON file is downloaded. It contains all transactions with correct amounts, categories, dates, and notes. File size is reasonable. |

### 7b. CSV Export

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| At least 10 transactions exist                         |
| **Steps**       | 1. Navigate to **Settings** → **Export Data**. <br> 2. Select format: **CSV**. <br> 3. Select date range: **Last 30 days**. <br> 4. Tap **Export**. <br> 5. Open the file in a spreadsheet application. |
| **Expected**    | A valid CSV file with headers: `date, amount, category, note`. All transactions within the date range are included. Special characters in notes are properly escaped. |

---

## Scenario 8: Settings Persistence

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| User is signed in, default settings are active         |
| **Steps**       | 1. Navigate to **Settings**. <br> 2. Change theme to **Dark Mode**. <br> 3. Change currency to **EUR (€)**. <br> 4. Enable **Biometric Lock**. <br> 5. Force-close the app completely. <br> 6. Reopen the app. |
| **Expected**    | Dark mode is still active. Currency displays as EUR. Biometric prompt appears on app launch. All settings are retained. |

**Additional checks:**

- Sign out and sign back in — settings should persist (synced to account).
- Install on a new device and sign in — settings should sync.

---

## Scenario 9: Accessibility — Screen Reader Full Flow

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| Screen reader enabled: TalkBack (Android), VoiceOver (iOS/macOS), NVDA (Windows), browser screen reader (Web) |
| **Steps**       | 1. Navigate through the onboarding and sign-in flow using only the screen reader. <br> 2. Create a transaction using only screen reader navigation. <br> 3. Navigate to the transaction list and read a transaction. <br> 4. Navigate to Budgets and verify budget progress is announced. <br> 5. Navigate to Settings and change a setting. |
| **Expected**    | Every interactive element has an accessible label. Focus order is logical (top-to-bottom, left-to-right). Progress indicators announce their value (e.g., "Budget: 50% spent, $200 of $400"). No focus traps. |

**Checklist:**

- [ ] All buttons and icons have content descriptions / aria-labels.
- [ ] Form fields have associated labels.
- [ ] Error messages are announced when they appear.
- [ ] Dialogs trap focus correctly and can be dismissed.
- [ ] Charts / graphs have text alternatives.
- [ ] Touch target sizes are at least 48 × 48 dp (mobile).

---

## Scenario 10: Performance Benchmarks

### 10a. App Startup Time

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| App is installed, account exists, ~100 transactions    |
| **Method**      | Cold start the app (after force-stop). Measure time from tap to interactive Dashboard. |
| **Target**      | ≤ 2 s cold start on reference devices (Pixel 7, iPhone 15). ≤ 3 s on budget devices. |

### 10b. Scroll 1,000 Transactions

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| Account has 1,000+ transactions loaded                 |
| **Method**      | Scroll the transaction list from top to bottom at a steady pace. Monitor for dropped frames. |
| **Target**      | ≤ 2 dropped frames per 1,000-row scroll. 60 fps sustained on reference devices. No visible jank. |

### 10c. Sync After Long Offline Period

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| 50 offline changes pending sync                        |
| **Method**      | Reconnect and measure time until all changes are synced and UI updated. |
| **Target**      | ≤ 10 s for 50 changes on a 4G connection.             |

### 10d. Memory Usage

| Item            | Detail                                                |
|-----------------|-------------------------------------------------------|
| **Precondition**| App running with 1,000 transactions loaded             |
| **Method**      | Capture memory snapshot after 5 minutes of idle usage. |
| **Target**      | ≤ 150 MB RSS on mobile. No memory leaks over 30 min.  |

---

## Appendix: Tester Checklist Template

Copy this checklist for each tester to fill out:

```markdown
### Beta Tester Checklist — {Name} — {Platform} — {Date}

- [ ] Scenario 1a: Email registration
- [ ] Scenario 1b: Social sign-in
- [ ] Scenario 1c: Passkey sign-in
- [ ] Scenario 1d: Sign-out and re-sign-in
- [ ] Scenario 2a: Create transaction
- [ ] Scenario 2b: Edit transaction
- [ ] Scenario 2c: Delete transaction
- [ ] Scenario 2d: Search transactions
- [ ] Scenario 2e: Filter transactions
- [ ] Scenario 3: Budget creation and tracking
- [ ] Scenario 4: Goal setting and milestones
- [ ] Scenario 5: Offline → reconnect → sync
- [ ] Scenario 6: Multi-device sync
- [ ] Scenario 7a: JSON export
- [ ] Scenario 7b: CSV export
- [ ] Scenario 8: Settings persistence
- [ ] Scenario 9: Accessibility (screen reader)
- [ ] Scenario 10a: Startup time
- [ ] Scenario 10b: Scroll 1,000 transactions

**Issues found:**
1. …
2. …

**Overall impression:**
…
```
