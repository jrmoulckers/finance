// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.di

import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.GoalRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.android.data.repository.impl.InMemoryAccountRepository
import com.finance.android.ui.screens.bills.BillRemindersViewModel
import com.finance.android.ui.screens.household.HouseholdViewModel
import com.finance.android.ui.screens.investment.InvestmentViewModel
import com.finance.android.ui.screens.nlp.NlpInputViewModel
import com.finance.android.ui.screens.currency.CurrencyViewModel
import com.finance.android.ui.screens.referral.ReferralViewModel
import com.finance.android.ui.screens.report.ReportBuilderViewModel
import com.finance.android.data.repository.impl.InMemoryBudgetRepository
import com.finance.android.data.repository.impl.InMemoryCategoryRepository
import com.finance.android.data.repository.impl.InMemoryGoalRepository
import com.finance.android.data.repository.impl.InMemoryTransactionRepository
import com.finance.android.logging.TimberCrashReporter
import com.finance.android.notifications.NotificationContentBuilder
import com.finance.android.notifications.NotificationDispatcher
import com.finance.android.notifications.NotificationPreferences
import com.finance.android.notifications.NotificationScheduler
import com.finance.android.notifications.NotificationSettingsViewModel
import com.finance.android.ui.screens.BiometricAvailabilityChecker
import com.finance.android.ui.screens.DefaultBiometricAvailabilityChecker
import com.finance.android.ui.screens.SettingsViewModel
import com.finance.android.ui.screens.affordability.AffordabilityViewModel
import com.finance.android.ui.expertise.ExpertiseTierManager
import com.finance.android.ui.expertise.ExpertiseTierViewModel
import com.finance.android.ui.learning.LearningPathViewModel
import com.finance.android.ui.nlp.NlpTransactionViewModel
import com.finance.android.ui.streak.StreakRepository
import com.finance.android.ui.streak.StreakViewModel
import com.finance.android.ui.streak.TransactionBackedStreakRepository
import com.finance.android.ui.accessibility.CognitiveAccessibilityManager
import com.finance.android.ui.theme.ThemeManager
import com.finance.android.ui.theme.ThemePreferenceManager
import com.finance.android.ui.tips.TipsViewModel
import com.finance.android.ui.insights.InsightsViewModel
import com.finance.android.ui.viewmodel.ConflictResolutionViewModel
import com.finance.android.ui.viewmodel.DataExportManager
import com.finance.android.ui.viewmodel.DataImportViewModel
import com.finance.android.sync.SyncNotificationManager
import com.finance.android.sync.SyncScheduler
import com.finance.android.ui.viewmodel.AccountCreateViewModel
import com.finance.android.ui.viewmodel.AccountEditViewModel
import com.finance.android.ui.viewmodel.AnalyticsViewModel
import com.finance.android.ui.viewmodel.AccountsViewModel
import com.finance.android.ui.viewmodel.BudgetCreateViewModel
import com.finance.android.ui.viewmodel.BudgetEditViewModel
import com.finance.android.ui.viewmodel.BudgetsViewModel
import com.finance.android.ui.viewmodel.DashboardViewModel
import com.finance.android.ui.viewmodel.GoalCreateViewModel
import com.finance.android.ui.viewmodel.GoalEditViewModel
import com.finance.android.ui.viewmodel.TransactionCreateViewModel
import com.finance.android.ui.viewmodel.TransactionDetailViewModel
import com.finance.android.ui.viewmodel.GoalsViewModel
import com.finance.android.ui.viewmodel.TransactionsViewModel
import com.finance.core.monitoring.CrashReporter
import com.finance.core.monitoring.MetricsCollector
import org.koin.android.ext.koin.androidContext
import org.koin.core.module.dsl.singleOf
import org.koin.core.module.dsl.viewModelOf
import org.koin.dsl.bind
import org.koin.dsl.module

/**
 * Root Koin module for the Finance Android app.
 *
 * Provides application-scoped singletons for monitoring, logging,
 * repositories, and ViewModels consumed by the UI layer.
 */
val appModule = module {

    // ── Monitoring ───────────────────────────────────────────────────

    /** Crash reporting — backed by Timber for on-device logging. */
    single<CrashReporter> {
        TimberCrashReporter(consentProvider = { false })
    }

    /**
     * Anonymous usage metrics — consent defaults to off.
     * When consent UI is implemented, wire [consentProvider]
     * to the user's preference in Settings.
     */
    single {
        MetricsCollector(consentProvider = { false })
    }

    // ── Repositories ────────────────────────────────────────────────
    // Temporary in-memory implementations.
    // Swap these to real SQLDelight-backed implementations later.

    singleOf(::InMemoryAccountRepository) bind AccountRepository::class
    singleOf(::InMemoryTransactionRepository) bind TransactionRepository::class
    singleOf(::InMemoryBudgetRepository) bind BudgetRepository::class
    singleOf(::InMemoryGoalRepository) bind GoalRepository::class
    singleOf(::InMemoryCategoryRepository) bind CategoryRepository::class

    // ── Settings dependencies ───────────────────────────────────────

    /**
     * [android.content.SharedPreferences] used by [SettingsViewModel] for local persistence.
     *
     * Backed by [androidx.security.crypto.EncryptedSharedPreferences] to protect
     * PII (user name, email) at rest. On first launch after the migration,
     * [EncryptedPrefsProvider] transparently copies entries from the legacy
     * plain-text file and clears it (#1314).
     */
    single<android.content.SharedPreferences> {
        com.finance.android.security.EncryptedPrefsProvider.get(
            androidContext(),
            "finance_settings",
        )
    }

    /** Biometric availability check — delegates to [androidx.biometric.BiometricManager]. */
    single<BiometricAvailabilityChecker> {
        DefaultBiometricAvailabilityChecker(androidContext())
    }

    /** Theme preference manager — provides reactive theme state for the whole app. */
    single { ThemePreferenceManager(get()) }

    // ── Expertise tier ──────────────────────────────────────────────────

    /** Expertise tier manager — persists and provides the user's skill level (#379). */
    single { ExpertiseTierManager(get()) }

    // ── Streak tracking ───────────────────────────────────────────────

    /** Streak repository — derives logging dates from the transaction repository. */
    single<StreakRepository> { TransactionBackedStreakRepository(get()) }

    // ── Notifications ───────────────────────────────────────────────

    /** Notification preferences — opt-in toggles backed by SharedPreferences. */
    single { NotificationPreferences(get()) }

    /** Notification content builder — generates safe, lock-screen-friendly text. */
    single { NotificationContentBuilder() }

    /** Notification dispatcher — shows Android system notifications. */
    single { NotificationDispatcher(androidContext()) }

    /** Notification scheduler — syncs WorkManager jobs with user preferences. */
    single { NotificationScheduler(androidContext(), get()) }

    // ── ViewModels ──────────────────────────────────────────────────

    viewModelOf(::DashboardViewModel)
    viewModelOf(::AnalyticsViewModel)
    viewModelOf(::AccountsViewModel)
    viewModelOf(::AccountCreateViewModel)
    viewModelOf(::AccountEditViewModel)
    viewModelOf(::BudgetsViewModel)
    viewModelOf(::BudgetCreateViewModel)
    viewModelOf(::BudgetEditViewModel)
    viewModelOf(::TransactionsViewModel)
    viewModelOf(::TransactionCreateViewModel)
    viewModelOf(::TransactionDetailViewModel)
    viewModelOf(::GoalsViewModel)
    viewModelOf(::GoalCreateViewModel)
    viewModelOf(::GoalEditViewModel)
    viewModelOf(::SettingsViewModel)
    viewModelOf(::StreakViewModel)
    viewModelOf(::NotificationSettingsViewModel)
    viewModelOf(::AffordabilityViewModel)
    viewModelOf(::ExpertiseTierViewModel)
    viewModelOf(::LearningPathViewModel)
    viewModelOf(::NlpTransactionViewModel)

    // ── Tips ─────────────────────────────────────────────────────────
    viewModelOf(::TipsViewModel)

    // ── Insights ─────────────────────────────────────────────────────
    viewModelOf(::InsightsViewModel)

    // ── Wave 5 ViewModels (Sprints 18-23) ───────────────────────────

    /** Household/Family Plan management (#1114). */
    viewModelOf(::HouseholdViewModel)

    /** Referral Program (#1116). */
    viewModelOf(::ReferralViewModel)

    /** Custom Report Builder (#1117). */
    viewModelOf(::ReportBuilderViewModel)

    /** Natural Language Transaction Input (#1118). */
    viewModelOf(::NlpInputViewModel)

    /** Investment Portfolio View (#1119). */
    viewModelOf(::InvestmentViewModel)

    /** Bill Reminders (#1125). */
    viewModelOf(::BillRemindersViewModel)

    /** Multi-currency picker, conversion, and transaction currency support (#1130). */
    viewModelOf(::CurrencyViewModel)

    // ── Wave 6 (Sprints 24-33) ──────────────────────────────────────

    /** Cognitive accessibility manager — simplified UI preferences (#Sprint28). */
    single { CognitiveAccessibilityManager(get()) }

    /** Theme manager — custom accent colors, font scaling (#Sprint29). */
    single { ThemeManager(get()) }

    /** Data export manager — CSV/PDF export (#Sprint26). */
    single { DataExportManager(androidContext(), get(), get()) }

    /** Sync scheduler — configurable sync intervals (#Sprint32). */
    single { SyncScheduler(androidContext(), get()) }

    /** Sync notification manager — sync status notifications (#Sprint32). */
    single { SyncNotificationManager(androidContext()) }

    /** Data import ViewModel (#Sprint26). */
    viewModelOf(::DataImportViewModel)

    /** Conflict resolution ViewModel (#Sprint27). */
    viewModelOf(::ConflictResolutionViewModel)
}
