# Cross-Platform Feature Parity Matrix

> **Audit Date:** 2025-07-15
> **Auditor:** @architect
> **Issue:** #1146
> **Scope:** Sprint 1–15 features across iOS, Android, Web, and Windows
> **Methodology:** Source-code scan of screens, ViewModels, hooks, navigation routes, and shared KMP packages

## Legend

| Symbol | Meaning                                             |
| ------ | --------------------------------------------------- |
| ✅     | **Implemented** — substantive code with UI + logic  |
| 🟡     | **Partial** — files exist but incomplete or stubbed |
| ❌     | **Missing** — no screen, hook, or ViewModel found   |
| ⬜     | **N/A** — not applicable to this platform           |

**Severity for gaps:**

- **P0** — Blocker for v2.0 release (core feature missing)
- **P1** — Important gap (advanced feature with user-facing impact)
- **P2** — Nice-to-have (feature can ship post-v2.0)

---

## 1. Core Features (Sprint 1–10) — Must Have Parity

These features are foundational. Every platform must implement them before v2.0.

| #   | Feature                | Android | iOS | Web | Windows | Notes                                                                                                                                                 |
| --- | ---------------------- | ------- | --- | --- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Account Management** | ✅      | ✅  | ✅  | ✅      | All platforms have CRUD screens and repositories                                                                                                      |
| 2   | **Transaction Entry**  | ✅      | ✅  | ✅  | ✅      | Quick-entry, categorization, detail views on all                                                                                                      |
| 3   | **Budgeting**          | ✅      | ✅  | ✅  | ✅      | Create/edit/track budgets; rollover toggle on Windows                                                                                                 |
| 4   | **Goal Tracking**      | ✅      | ✅  | ✅  | ✅      | Goals CRUD with progress tracking                                                                                                                     |
| 5   | **Reports / Charts**   | ✅      | ✅  | ✅  | ✅      | Android: AnalyticsScreen; iOS: AnalyticsView; Web: Recharts charts; Windows: FinanceCharts                                                            |
| 6   | **Data Export**        | ✅      | ✅  | ✅  | 🟡      | Android: DataExportManager; iOS: DataExportView + service; Web: DataExport component; Windows: GDPR screen exists but no dedicated export ViewModel   |
| 7   | **Sync**               | ✅      | ✅  | ✅  | ✅      | Android: SyncWorker/AndroidSyncManager; iOS: PowerSyncManager; Web: PowerSync client + mutation queue; Windows: DesktopSyncCoordinator                |
| 8   | **Authentication**     | ✅      | ✅  | ✅  | ✅      | All platforms have login/signup; biometric: Android (BiometricAuthManager), iOS (BiometricAuthManager), Web (WebAuthn), Windows (WindowsHelloManager) |
| 9   | **Settings**           | ✅      | ✅  | ✅  | ✅      | Currency, theme, notifications on all platforms                                                                                                       |

### Core Feature Evidence

<details>
<summary>Account Management</summary>

- **Android:** `ui/screens/AccountsScreen.kt`, `AccountCreateScreen.kt`, `AccountEditScreen.kt`, `ui/viewmodel/AccountsViewModel.kt`, `data/repository/AccountRepository.kt`
- **iOS:** `Screens/AccountsView.swift`, `AccountDetailView.swift`, `AccountEditView.swift`, `ViewModels/AccountsViewModel.swift`, `Repositories/AccountRepository.swift`
- **Web:** `pages/AccountsPage.tsx`, `pages/AccountDetailPage.tsx`, `components/forms/AccountForm.tsx`, `hooks/useAccounts.ts`, `db/repositories/accounts.ts`
- **Windows:** `screens/AccountsScreen.kt`, `viewmodel/AccountsViewModel.kt`, `data/repository/AccountRepository.kt`
</details>

<details>
<summary>Transaction Entry</summary>

- **Android:** `ui/screens/TransactionsScreen.kt`, `TransactionCreateScreen.kt`, `TransactionDetailScreen.kt`, `ui/viewmodel/TransactionsViewModel.kt`, `TransactionCreateViewModel.kt`
- **iOS:** `Screens/TransactionsView.swift`, `TransactionCreateView.swift`, `TransactionDetailView.swift`, `TransactionEditView.swift`, `ViewModels/TransactionsViewModel.swift`, `TransactionCreateViewModel.swift`
- **Web:** `pages/TransactionsPage.tsx`, `pages/TransactionDetailPage.tsx`, `components/forms/TransactionForm.tsx`, `components/forms/QuickEntry.tsx`, `hooks/useTransactions.ts`, `hooks/useQuickEntry.ts`
- **Windows:** `screens/TransactionsScreen.kt`, `screens/QuickAddTransactionDialog.kt`, `viewmodel/TransactionsViewModel.kt`
</details>

<details>
<summary>Budgeting</summary>

- **Android:** `ui/screens/BudgetsScreen.kt`, `BudgetCreateScreen.kt`, `BudgetEditScreen.kt`, `ui/viewmodel/BudgetsViewModel.kt`
- **iOS:** `Screens/BudgetsView.swift`, `BudgetCreateView.swift`, `ViewModels/BudgetsViewModel.swift`, `BudgetCreateViewModel.swift`
- **Web:** `pages/BudgetsPage.tsx`, `pages/BudgetDetailPage.tsx`, `components/forms/BudgetForm.tsx`, `hooks/useBudgets.ts`
- **Windows:** `screens/BudgetsScreen.kt`, `viewmodel/BudgetsViewModel.kt`, `components/BudgetRolloverToggle.kt`
</details>

<details>
<summary>Goal Tracking</summary>

- **Android:** `ui/screens/GoalsScreen.kt` (implied from GoalCreate/GoalEdit), `GoalCreateScreen.kt`, `GoalEditScreen.kt`, `ui/viewmodel/GoalsViewModel.kt`
- **iOS:** `Screens/GoalsView.swift`, `GoalCreateView.swift`, `ViewModels/GoalsViewModel.swift`, `GoalCreateViewModel.swift`
- **Web:** `pages/GoalsPage.tsx`, `pages/GoalDetailPage.tsx`, `components/forms/GoalForm.tsx`, `hooks/useGoals.ts`
- **Windows:** `screens/GoalsScreen.kt`, `viewmodel/GoalsViewModel.kt`
</details>

<details>
<summary>Data Export</summary>

- **Android:** `ui/viewmodel/DataExportManager.kt`, `ui/gdpr/PrivacySettingsScreen.kt`
- **iOS:** `Screens/DataExportView.swift`, `ViewModels/DataExportViewModel.swift`, `Services/DataExportService.swift`, `Services/PDFExportService.swift`
- **Web:** `components/DataExport.tsx` (with tests and Storybook), `components/gdpr/` (ConsentDialog, PrivacySettings)
- **Windows:** `screens/gdpr/` (GdprConsentDialog, PrivacySettingsScreen) — export is GDPR-focused but lacks a standalone export ViewModel
- **KMP Shared:** `packages/core/.../export/` (DataExportService, CsvExportSerializer, JsonExportSerializer)
</details>

<details>
<summary>Authentication</summary>

- **Android:** `auth/LoginScreen.kt`, `SignupScreen.kt`, `AuthViewModel.kt`, `SupabaseAuthManager.kt`, `security/BiometricAuthManager.kt`
- **iOS:** `Screens/LoginView.swift`, `Screens/AuthGateView.swift`, `Screens/LockScreenView.swift`, `Security/BiometricAuthManager.swift`, `Services/SupabaseAuthClient.swift`
- **Web:** `auth/auth-context.tsx`, `auth/webauthn.ts`, `auth/token-storage.ts`, `pages/LoginPage.tsx`, `pages/SignupPage.tsx`
- **Windows:** `screens/auth/LoginScreen.kt`, `viewmodel/AuthViewModel.kt`, `viewmodel/LoginViewModel.kt`, `security/WindowsHelloManager.kt`, `security/CredentialManager.kt`
</details>

---

## 2. Advanced Features (Sprint 11–15) — May Have Planned Gaps

| #   | Feature                     | Android | iOS | Web | Windows | Severity | Notes                                                                                                                                                                                                                                                                              |
| --- | --------------------------- | ------- | --- | --- | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | **Bank Connection (Plaid)** | ❌      | ❌  | ❌  | ❌      | P2       | No Plaid SDK integration on any platform; references in dashboards are future-flagged. Intentionally deferred.                                                                                                                                                                     |
| 11  | **Family/Partner Sharing**  | ✅      | ✅  | ✅  | ✅      | —        | All platforms: Android `screens/household/`, iOS `HouseholdView.swift`, Web `HouseholdPage.tsx` + `useHousehold.ts`, Windows `HouseholdScreen.kt`. KMP: `core/household/` (RBAC, invitations, data partitioning)                                                                   |
| 12  | **Investment Tracking**     | ✅      | ❌  | ❌  | ✅      | **P1**   | Android: `InvestmentPortfolioScreen.kt` + ViewModel; Windows: `InvestmentScreen.kt` + ViewModel. **iOS and Web are missing.** KMP: `core/investment/InvestmentEngine.kt` exists                                                                                                    |
| 13  | **Bill Reminders**          | ✅      | ❌  | ❌  | 🟡      | **P1**   | Android: `screens/bills/BillRemindersScreen.kt` + ViewModel + Worker. Windows: notification manager references reminders but no dedicated screen. **iOS and Web are missing.** KMP: `core/recurring/Reminder.kt`                                                                   |
| 14  | **Multi-Currency**          | 🟡      | 🟡  | ✅  | 🟡      | **P1**   | Web: `useMultiCurrency.ts` hook with full conversion/formatting. iOS: `CurrencyLabel.swift` component. Android + Windows: currency formatting exists but no dedicated multi-currency conversion screen. KMP: `core/multicurrency/MultiCurrencyEngine.kt`                           |
| 15  | **Data Import (CSV)**       | ✅      | ❌  | ✅  | ✅      | **P1**   | Android: `DataImportScreen.kt` + ViewModel; Web: `ImportPage.tsx`, `DataImportWizardPage.tsx`, `useImport.ts`, `lib/csv-parser.ts` + full pipeline; Windows: `ImportWizardScreen.kt` + ViewModel. **iOS is missing.** KMP: `core/dataimport/` (CsvParser, DataImportService)       |
| 16  | **NLP Transaction Input**   | ✅      | ❌  | ✅  | ✅      | **P1**   | Android: `screens/nlp/NlpInputScreen.kt` + ViewModel; Web: `NaturalLanguageInput.tsx` + `useNaturalLanguageInput.ts` + `nlParser.ts`; Windows: `NaturalLanguageScreen.kt` + ViewModel + `VoiceTransactionOverlay.kt`. **iOS is missing.** KMP: `core/nlp/NaturalLanguageParser.kt` |

### Advanced Feature Evidence

<details>
<summary>Family/Partner Sharing (Feature 11)</summary>

- **Android:** `ui/screens/household/HouseholdScreen.kt`, `HouseholdViewModel.kt`; nav route `Route.Household`
- **iOS:** `Screens/HouseholdView.swift`, `ViewModels/HouseholdViewModel.swift`, `Models/HouseholdModels.swift`, `Repositories/HouseholdRepository.swift`
- **Web:** `pages/HouseholdPage.tsx` (with CSS + tests), `hooks/useHousehold.ts`
- **Windows:** `screens/HouseholdScreen.kt`, `viewmodel/HouseholdViewModel.kt`; sidebar nav entry `Screen.Household`
- **KMP Shared:** `packages/core/.../household/` — HouseholdManager, RbacPermissions, InvitationStateMachine, DataPartitioning, HouseholdRole
</details>

<details>
<summary>Investment Tracking (Feature 12) — GAPS on iOS, Web</summary>

- **Android:** `ui/screens/investment/InvestmentPortfolioScreen.kt`, `InvestmentViewModel.kt`; nav route `Route.InvestmentPortfolio`
- **iOS:** ❌ No investment screen, ViewModel, or model found
- **Web:** ❌ No investment page, hook, or component found. `WatchlistsPage.tsx` exists but is spending watchlists, not investment tracking
- **Windows:** `screens/InvestmentScreen.kt`, `viewmodel/InvestmentViewModel.kt`; sidebar nav entry `Screen.Investments`
- **KMP Shared:** `packages/core/.../investment/InvestmentEngine.kt`
</details>

<details>
<summary>Bill Reminders (Feature 13) — GAPS on iOS, Web, partial Windows</summary>

- **Android:** `ui/screens/bills/BillRemindersScreen.kt`, `BillRemindersViewModel.kt`, `BillReminderWorker.kt`; nav route `Route.BillReminders`; `sync/BillReminderWorker.kt` for background scheduling
- **iOS:** ❌ No bill reminders screen. `NotificationModels.swift` exists but no bill-specific views or ViewModels
- **Web:** ❌ No bill reminders page or hook. Transaction recurring support exists but no dedicated bill tracker
- **Windows:** 🟡 `notifications/EnhancedNotificationManager.kt` and `components/RecurringPreviewPanel.kt` reference reminders, but no dedicated `BillRemindersScreen`
- **KMP Shared:** `packages/core/.../recurring/Reminder.kt`, `RecurringTransactionEngine.kt`
</details>

<details>
<summary>Multi-Currency (Feature 14)</summary>

- **Android:** 🟡 Currency formatting in settings; no dedicated multi-currency conversion UI
- **iOS:** 🟡 `Components/CurrencyLabel.swift` for display formatting; no conversion screen or exchange rate management
- **Web:** ✅ `hooks/useMultiCurrency.ts` — full hook with ExchangeRate types, conversion, formatting, currency totals. `components/dashboard/CurrencyDisplay.tsx`
- **Windows:** 🟡 Settings include currency selection; no dedicated conversion UI
- **KMP Shared:** `packages/core/.../multicurrency/MultiCurrencyEngine.kt`
</details>

<details>
<summary>Data Import / CSV (Feature 15) — GAP on iOS</summary>

- **Android:** `ui/screens/DataImportScreen.kt`, `ui/viewmodel/DataImportViewModel.kt`; nav route `Route.DataImport`
- **iOS:** ❌ No import screen, ViewModel, or file picker integration found
- **Web:** ✅ Full pipeline — `pages/ImportPage.tsx`, `pages/DataImportWizardPage.tsx`, `hooks/useImport.ts`, `hooks/useDataImportWizard.ts`, `components/import/` (FileDropZone, ColumnMapper, ImportPreview, ImportProgress, ImportComplete), `lib/csv-parser.ts`, `lib/csv-column-mapper.ts`, `lib/csv-import-validator.ts`, `lib/csv-duplicate-detector.ts`
- **Windows:** `screens/ImportWizardScreen.kt`, `viewmodel/ImportWizardViewModel.kt`, `data/CsvEncodingDetector.kt`; sidebar nav entry `Screen.Import`
- **KMP Shared:** `packages/core/.../dataimport/` — CsvParser, CsvImportParser, DataImportService, ImportData, ImportTypes
</details>

<details>
<summary>NLP Transaction Input (Feature 16) — GAP on iOS</summary>

- **Android:** `ui/screens/nlp/NlpInputScreen.kt`, `NlpInputViewModel.kt`; nav routes `Route.NlpInput`, `Route.NlpTransaction`; also `ui/nlp/NlpTransactionScreen.kt`
- **iOS:** ❌ No NLP input screen or ViewModel found
- **Web:** ✅ `components/forms/NaturalLanguageInput.tsx` (with CSS + tests), `hooks/useNaturalLanguageInput.ts`, `lib/nlParser.ts` (with tests)
- **Windows:** `screens/NaturalLanguageScreen.kt`, `viewmodel/NaturalLanguageViewModel.kt`, `voice/VoiceCommandManager.kt`, `VoiceCommandParser.kt`, `screens/VoiceTransactionOverlay.kt`; sidebar nav entry `Screen.QuickAdd`
- **KMP Shared:** `packages/core/.../nlp/NaturalLanguageParser.kt`
</details>

---

## 3. Cross-Cutting Concerns

| #   | Concern                | Android | iOS | Web | Windows | Severity | Notes                                                                                                                                                                                                                                                                                 |
| --- | ---------------------- | ------- | --- | --- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17  | **Accessibility**      | ✅      | ✅  | ✅  | ✅      | —        | Android: `ui/accessibility/` (WCAG, HighContrast, CognitiveAccessibility); iOS: `Accessibility/` (modifiers, DynamicType, haptics); Web: `accessibility/aria.ts`, semantic HTML, ARIA throughout; Windows: `accessibility/` (NarratorSupport, KeyboardNavigation, AccessibilityAudit) |
| 18  | **Offline Support**    | ✅      | ✅  | ✅  | ✅      | —        | All platforms use local SQLite + sync engine. Web: service worker + OfflineBanner + mutation queue                                                                                                                                                                                    |
| 19  | **Error Handling**     | ✅      | ✅  | ✅  | ✅      | —        | Android: ConflictResolutionScreen; iOS: ErrorStateView component; Web: consistent error states in hooks; Windows: ConflictResolutionScreen                                                                                                                                            |
| 20  | **Design Consistency** | ✅      | ✅  | ✅  | ✅      | —        | Design tokens in `packages/design-tokens/`; Android: Material 3 theme; iOS: SwiftUI theme; Web: CSS custom properties in `theme/tokens.css`; Windows: Compose Desktop theme                                                                                                           |

---

## 4. Bonus Features (Discovered During Audit)

Features found in one or more platforms that extend beyond the Sprint 11–15 scope:

| Feature                         | Android | iOS | Web | Windows | Notes                                                                                  |
| ------------------------------- | ------- | --- | --- | ------- | -------------------------------------------------------------------------------------- |
| **Gamification / Achievements** | ✅      | ✅  | ✅  | ✅      | All platforms; KMP: `core/gamification/`                                               |
| **Financial Tips**              | ✅      | ✅  | ✅  | ✅      | All platforms have tips engines                                                        |
| **Insights / AI Analysis**      | ✅      | ✅  | ✅  | ✅      | Android: InsightsScreen; iOS: InsightsView; Web: InsightsPage; Windows: InsightsScreen |
| **Report Builder**              | ✅      | ❌  | ✅  | ✅      | iOS missing; KMP: `core/report/`                                                       |
| **Referral Program**            | ✅      | ❌  | ✅  | ✅      | iOS missing; KMP: `core/referral/`                                                     |
| **Health Score**                | ❌      | ✅  | ❌  | ✅      | iOS: HealthScoreView; Windows: HealthScoreScreen                                       |
| **Subscription/Paywall**        | ✅      | ✅  | ❌  | ✅      | Android: billing/SubscriptionManager; iOS: SubscriptionView; Windows: UpgradeScreen    |
| **Receipt Scanning**            | ❌      | ✅  | ❌  | ❌      | iOS only: ReceiptScanView + ReceiptScannerService                                      |
| **Voice Input**                 | ❌      | ❌  | ❌  | ✅      | Windows only: VoiceCommandManager, VoiceTransactionOverlay                             |
| **Widget Board**                | ❌      | ❌  | ✅  | ✅      | Web: WidgetContainer + CustomizePanel; Windows: WidgetBoardScreen                      |
| **Predictive Balance**          | ❌      | ❌  | ✅  | ❌      | Web only: PredictiveBalanceCard + usePredictiveBalance                                 |
| **Spending Watchlists**         | ❌      | ❌  | ✅  | ❌      | Web only: WatchlistsPage + useSpendingWatchlists                                       |

---

## 5. Gap Summary — Prioritized Action Items

### P1 — Important (Should fix before v2.0)

| #   | Gap                   | Platform    | Action Required                                                                 | Blocked By                       |
| --- | --------------------- | ----------- | ------------------------------------------------------------------------------- | -------------------------------- |
| 1   | Investment Tracking   | **iOS**     | Create `InvestmentView.swift` + ViewModel consuming `InvestmentEngine` from KMP | —                                |
| 2   | Investment Tracking   | **Web**     | Create `InvestmentPage.tsx` + `useInvestment.ts` hook consuming KMP bridge      | —                                |
| 3   | Bill Reminders        | **iOS**     | Create `BillRemindersView.swift` + ViewModel using `Reminder.kt` from KMP       | —                                |
| 4   | Bill Reminders        | **Web**     | Create `BillRemindersPage.tsx` + `useBillReminders.ts` hook                     | —                                |
| 5   | Bill Reminders        | **Windows** | Promote `RecurringPreviewPanel` to a full `BillRemindersScreen`                 | —                                |
| 6   | Multi-Currency UI     | **Android** | Add multi-currency conversion screen beyond settings                            | KMP MultiCurrencyEngine ready    |
| 7   | Multi-Currency UI     | **iOS**     | Add conversion screen / exchange rate display beyond CurrencyLabel              | KMP MultiCurrencyEngine ready    |
| 8   | Multi-Currency UI     | **Windows** | Add conversion screen beyond settings currency picker                           | KMP MultiCurrencyEngine ready    |
| 9   | Data Import           | **iOS**     | Create `DataImportView.swift` + ViewModel using KMP `DataImportService`         | —                                |
| 10  | NLP Transaction Input | **iOS**     | Create `NlpInputView.swift` + ViewModel using KMP `NaturalLanguageParser`       | —                                |
| 11  | Data Export           | **Windows** | Add dedicated `DataExportViewModel` and export action in settings               | GDPR screen exists; needs wiring |

### P2 — Nice-to-Have (Post-v2.0)

| #   | Gap                     | Platform              | Notes                                      |
| --- | ----------------------- | --------------------- | ------------------------------------------ |
| 1   | Bank Connection (Plaid) | All                   | Intentionally deferred; no platform has it |
| 2   | Report Builder          | iOS                   | Android, Web, Windows have it              |
| 3   | Referral Program        | iOS                   | Android, Web, Windows have it              |
| 4   | Health Score            | Android, Web          | iOS, Windows have it                       |
| 5   | Receipt Scanning        | Android, Web, Windows | iOS only currently                         |
| 6   | Voice Input             | Android, iOS, Web     | Windows only currently                     |
| 7   | Subscription/Paywall    | Web                   | Android, iOS, Windows have it              |

---

## 6. Shared KMP Coverage

The following KMP shared modules in `packages/core/src/commonMain/` provide business logic that platforms should consume:

| Module              | Path                                                     | Consuming Platforms                            |
| ------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Budget Calculator   | `core/budget/BudgetCalculator.kt`                        | All ✅                                         |
| Categorization      | `core/categorization/`                                   | All ✅                                         |
| Data Export         | `core/export/` (CSV + JSON serializers)                  | Android ✅, iOS ✅, Web ✅, Windows 🟡         |
| Data Import         | `core/dataimport/` (CSV parser, import service)          | Android ✅, Web ✅, Windows ✅, **iOS ❌**     |
| Gamification        | `core/gamification/`                                     | All ✅                                         |
| Household/RBAC      | `core/household/` (manager, roles, invitations)          | All ✅                                         |
| Insights            | `core/insights/`                                         | All ✅                                         |
| Investment          | `core/investment/InvestmentEngine.kt`                    | Android ✅, Windows ✅, **iOS ❌**, **Web ❌** |
| Multi-Currency      | `core/multicurrency/MultiCurrencyEngine.kt`              | Web ✅, others 🟡 (partial)                    |
| NLP Parser          | `core/nlp/NaturalLanguageParser.kt`                      | Android ✅, Web ✅, Windows ✅, **iOS ❌**     |
| Recurring/Reminders | `core/recurring/` (RecurringTransactionEngine, Reminder) | Android ✅, Windows 🟡, **iOS ❌**, **Web ❌** |
| Report Builder      | `core/report/`                                           | Android ✅, Web ✅, Windows ✅, **iOS ❌**     |
| Savings             | `core/savings/SavingsEngine.kt`                          | All ✅                                         |
| Tips                | `core/tips/`                                             | All ✅                                         |

---

## 7. Recommendations

### Immediate (Pre-v2.0)

1. **iOS is the primary gap platform** — missing 5 advanced features (Investment, Bills, Import, NLP, Report Builder). Prioritize iOS feature implementation sprint.
2. **Multi-Currency needs UI parity** — KMP engine exists; Android, iOS, and Windows need dedicated conversion screens to match Web.
3. **Bill Reminders on Web** — Web users expect bill tracking; create a dedicated page with local notification support via the service worker.
4. **Windows Data Export** — Wire the existing GDPR consent dialog to the KMP `DataExportService` with a proper ViewModel.

### Post-v2.0

5. **Bank Connection (Plaid)** — Evaluate Plaid SDK for all platforms as a v2.1 feature.
6. **Cross-pollinate unique features** — Receipt scanning (iOS), voice input (Windows), predictive balance (Web), and spending watchlists (Web) could benefit all platforms.

### Architecture Notes

- All gap features have KMP shared logic already implemented — platform work is primarily UI + ViewModel wiring.
- The edge-first architecture is consistently applied: all platforms use local SQLite with sync, and business logic lives in `packages/core/`.
- Privacy-first design is consistent: GDPR consent, data export, and privacy settings exist on all platforms.

---

## Appendix: Platform File Counts

| Directory       | Screens/Pages | ViewModels/Hooks | Repositories   | Nav Routes               |
| --------------- | ------------- | ---------------- | -------------- | ------------------------ |
| `apps/android/` | 34+ screens   | 17+ ViewModels   | 6 repositories | 20+ routes               |
| `apps/ios/`     | 34 views      | 25 ViewModels    | 6 repositories | 5 tabs + NavigationStack |
| `apps/web/`     | 25 pages      | 34 hooks         | 5 repositories | 18 routes                |
| `apps/windows/` | 26+ screens   | 27 ViewModels    | 7 repositories | 19 sidebar entries       |
