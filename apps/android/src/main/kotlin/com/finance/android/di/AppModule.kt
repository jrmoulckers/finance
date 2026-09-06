// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.di

import com.finance.android.BuildConfig
import com.finance.android.billing.AuthenticatedEntitlementTransport
import com.finance.android.billing.AuthenticatedHouseholdEligibilityProvider
import com.finance.android.billing.EligibleHouseholdProvider
import com.finance.android.billing.FinanceBillingEnvironment
import com.finance.android.billing.RevenueCatEntitlementTransport
import com.finance.android.billing.SubscriptionManager
import com.finance.android.billing.UnavailableRevenueCatPurchaseAdapter
import com.finance.android.entitlement.AuthenticatedEntitlementHouseholdScopeProvider
import com.finance.android.entitlement.AuthenticatedEntitlementUserScopeProvider
import com.finance.android.entitlement.EncryptedEntitlementSnapshotStore
import com.finance.android.entitlement.EntitlementCoordinator
import com.finance.android.entitlement.EntitlementSnapshotStore
import com.finance.android.entitlement.EntitlementsV1Repository
import com.finance.android.entitlement.KtorEntitlementHttpClient
import com.finance.core.entitlement.EntitlementRepository
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
import com.finance.android.ui.screens.business.BusinessSeparationViewModel
import com.finance.android.ui.screens.business.field.RuggedModeManager
import com.finance.android.ui.screens.business.field.RuggedQuickExpenseViewModel
import com.finance.android.ui.screens.business.forecast.CashForecastViewModel
import com.finance.android.ui.screens.business.pnl.ProfitLossViewModel
import com.finance.android.ui.screens.business.receipt.ReceiptExpenseViewModel
import com.finance.android.ui.screens.business.share.ShareWinViewModel
import com.finance.android.ui.screens.report.ReportBuilderViewModel
import com.finance.android.data.repository.impl.InMemoryBudgetRepository
import com.finance.android.data.repository.impl.InMemoryCategoryRepository
import com.finance.android.data.repository.impl.InMemoryGoalRepository
import com.finance.android.data.repository.impl.InMemoryTransactionRepository
import com.finance.android.logging.TimberCrashReporter
import com.finance.android.receipt.AndroidReceiptTextRecognizer
import com.finance.android.receipt.NoOpReceiptImageRetentionStore
import com.finance.android.receipt.ReceiptImageCapture
import com.finance.android.receipt.ReceiptImageRetentionStore
import com.finance.android.receipt.ReceiptTextRecognizer
import com.finance.android.receipt.UnavailableReceiptImageCapture
import com.finance.android.ui.receipt.ReceiptScanViewModel
import com.finance.android.ui.quickcash.QuickCashEntryViewModel
import com.finance.android.ui.gig.GigShiftStore
import com.finance.android.ui.gig.GigToolsViewModel
import com.finance.android.notifications.NotificationContentBuilder
import com.finance.android.notifications.NotificationDispatcher
import com.finance.android.notifications.NotificationPreferences
import com.finance.android.notifications.NotificationScheduler
import com.finance.android.notifications.NotificationSettingsViewModel
import com.finance.android.ui.screens.BiometricAvailabilityChecker
import com.finance.android.ui.screens.DefaultBiometricAvailabilityChecker
import com.finance.android.ui.screens.SettingsViewModel
import com.finance.android.ui.screens.affordability.AffordabilityViewModel
import com.finance.android.ui.components.IconPreferenceManager
import com.finance.android.ui.expertise.ExpertiseTierManager
import com.finance.android.ui.expertise.ExpertiseTierViewModel
import com.finance.android.ui.learning.LearningPathViewModel
import com.finance.android.ui.learning.LearningProgressRepository
import com.finance.android.ui.nlp.NlpTransactionViewModel
import com.finance.android.ui.paywall.PaywallViewModel
import com.finance.android.ui.streak.StreakRepository
import com.finance.android.ui.streak.StreakViewModel
import com.finance.android.ui.streak.TransactionBackedStreakRepository
import com.finance.android.ui.gamification.GamificationCelebrationStore
import com.finance.android.ui.gamification.GamificationViewModel
import com.finance.android.ui.couple.CoupleProfileRepository
import com.finance.android.ui.couple.CoupleHubViewModel
import com.finance.android.ui.couple.privacy.CouplePrivacyRepository
import com.finance.android.ui.couple.privacy.CouplePrivacyViewModel
import com.finance.android.ui.couple.debt.CoupleDebtRepository
import com.finance.android.ui.couple.debt.DebtPlannerViewModel
import com.finance.android.ui.couple.goals.SharedContributionRepository
import com.finance.android.ui.couple.goals.SharedGoalViewModel
import com.finance.android.ui.couple.wedding.WeddingRepository
import com.finance.android.ui.couple.wedding.WeddingViewModel
import com.finance.android.ui.couple.checkin.CheckInRepository
import com.finance.android.ui.couple.checkin.CheckInViewModel
import com.finance.android.ui.accessibility.CognitiveAccessibilityManager
import com.finance.android.ui.feedback.DefaultHapticAvailabilityChecker
import com.finance.android.ui.feedback.HapticAvailabilityChecker
import com.finance.android.ui.theme.ThemeManager
import com.finance.android.ui.theme.ThemePreferenceManager
import com.finance.android.ui.tips.TipsViewModel
import com.finance.android.ui.voice.InMemoryVoiceDraftStore
import com.finance.android.ui.voice.LocalUtteranceParser
import com.finance.android.ui.voice.UtteranceParser
import com.finance.android.ui.voice.VoiceDraftStore
import com.finance.android.ui.voice.VoiceTransactionInstrumentation
import com.finance.android.ui.voice.VoiceTransactionViewModel
import com.finance.android.ui.insights.InsightsViewModel
import com.finance.android.ui.quickactions.DeterministicQuickActionRanker
import com.finance.android.ui.quickactions.QuickActionPreferences
import com.finance.android.ui.quickactions.QuickActionRanker
import com.finance.android.ui.quickactions.QuickActionTelemetry
import com.finance.android.ui.quickactions.QuickActionsViewModel
import com.finance.android.ui.quickactions.TimberQuickActionTelemetry
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
import com.finance.android.ui.viewmodel.GoalPlannerViewModel
import com.finance.android.ui.viewmodel.TransactionCreateViewModel
import com.finance.android.ui.viewmodel.TransactionDetailViewModel
import com.finance.android.ui.viewmodel.GoalsViewModel
import com.finance.android.ui.viewmodel.TransactionsViewModel
import com.finance.core.monitoring.CrashReporter
import com.finance.core.monitoring.MetricsCollector
import org.koin.android.ext.koin.androidContext
import org.koin.androidx.viewmodel.dsl.viewModel
import org.koin.core.module.dsl.singleOf
import org.koin.core.module.dsl.viewModelOf
import org.koin.core.qualifier.named
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

    // ── Entitlement projection (display-only, #4403) ───────────────

    /**
     * Reads the authenticated caller's minimized entitlement from
     * `entitlements-v1`. It is the only entitlement source the UI consults;
     * store SDK state never substitutes for it, and nothing it returns
     * authorizes a paid server action.
     */
    single<EntitlementRepository> {
        EntitlementsV1Repository(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            accessTokenProvider = {
                get<com.finance.sync.auth.AuthManager>().currentSession.value?.accessToken
            },
            httpClient = KtorEntitlementHttpClient(get(named("auth"))),
        )
    }
    single<EntitlementSnapshotStore> {
        EncryptedEntitlementSnapshotStore(
            com.finance.android.security.EncryptedPrefsProvider.get(
                androidContext(),
                "finance_entitlement_cache",
            ),
        )
    }
    single {
        EntitlementCoordinator(
            repository = get(),
            snapshotStore = get(),
            householdScopeProvider = AuthenticatedEntitlementHouseholdScopeProvider(get()),
            userScopeProvider = AuthenticatedEntitlementUserScopeProvider(get()),
        )
    }

    // ── Billing entitlement confirmation ───────────────────────────

    single<EligibleHouseholdProvider> {
        AuthenticatedHouseholdEligibilityProvider(get())
    }
    single<AuthenticatedEntitlementTransport> {
        RevenueCatEntitlementTransport(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            authManager = get(),
            httpClient = get(named("auth")),
        )
    }
    single {
        SubscriptionManager(
            purchaseAdapter = UnavailableRevenueCatPurchaseAdapter,
            transport = get(),
            eligibleHouseholdProvider = get(),
            entitlementCoordinator = get(),
            appId = BuildConfig.REVENUECAT_APP_ID,
            environment =
                if (BuildConfig.DEBUG) {
                    FinanceBillingEnvironment.SANDBOX
                } else {
                    FinanceBillingEnvironment.PRODUCTION
                },
        )
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

    /** Haptic availability check — controls the default Accessibility haptic toggle. */
    single<HapticAvailabilityChecker> {
        DefaultHapticAvailabilityChecker(androidContext())
    }

    /** Theme preference manager — provides reactive theme state for the whole app. */
    single { ThemePreferenceManager(get()) }

    /** Icon preference manager — provides reactive icon pack state for the whole app. */
    single { IconPreferenceManager(get()) }

    // ── Expertise tier ──────────────────────────────────────────────────

    /** Expertise tier manager — persists and provides the user's skill level (#379). */
    single { ExpertiseTierManager(get()) }

    /** Learning progress repository — persists lessons, streak and rewards (#2208). */
    single { LearningProgressRepository(get()) }

    // ── Streak tracking ───────────────────────────────────────────────

    /** Streak repository — derives logging dates from the transaction repository. */
    single<StreakRepository> { TransactionBackedStreakRepository(get()) }

    // ── Gamification (#242, #2211) ──────────────────────────────────
    // Teen achievements: real streaks, near-win feedback, celebration moments.

    /** Remembers which achievements were already celebrated (one-time celebration). */
    single { GamificationCelebrationStore(get()) }

    /** Achievements + real streaks + near-win + celebration ViewModel. */
    viewModelOf(::GamificationViewModel)

    // ── Couple money (engaged couples batch: #2142/#2145/#2147/#2150/#2153) ──
    // All persistence uses the shared encrypted SharedPreferences singleton via org.json.

    /** Shared partner profile (names + shared label) used across couple features. */
    single { CoupleProfileRepository(get()) }

    /** "Yours, mine, ours" privacy classification store (#2142). */
    single { CouplePrivacyRepository(get()) }

    /** Joint debt store for the payoff planner (#2153). */
    single { CoupleDebtRepository(get()) }

    /** Shared goal contribution store — house down payment (#2147). */
    single { SharedContributionRepository(get()) }

    /** Shared wedding-budget workspace store (#2145). */
    single { WeddingRepository(get()) }

    /** Supportive money check-in preferences and history (#2150). */
    single { CheckInRepository(get()) }

    viewModelOf(::CoupleHubViewModel)
    viewModelOf(::CouplePrivacyViewModel)
    viewModelOf(::DebtPlannerViewModel)
    viewModelOf(::SharedGoalViewModel)
    viewModelOf(::WeddingViewModel)
    viewModelOf(::CheckInViewModel)

    // ── Notifications ───────────────────────────────────────────────

    /** Notification preferences — opt-in toggles backed by SharedPreferences. */
    single { NotificationPreferences(get()) }

    /** Notification content builder — generates safe, lock-screen-friendly text. */
    single { NotificationContentBuilder() }

    /** Notification dispatcher — shows Android system notifications. */
    single { NotificationDispatcher(androidContext()) }

    /** Notification scheduler — syncs WorkManager jobs with user preferences. */
    single { NotificationScheduler(androidContext(), get()) }

    // ── Receipt scanning (#2388) ────────────────────────────────────
    // On-device only: ML Kit OCR + a deterministic parser. CameraX capture is
    // pending device wiring, so the default capture reports unavailable and the
    // UI degrades to manual entry. Image retention is opt-in (no-op by default).

    /** Camera capture — TODO(human): swap to a CameraX-backed implementation. */
    single<ReceiptImageCapture> { UnavailableReceiptImageCapture() }

    /** On-device OCR via ML Kit Text Recognition v2 — no image upload. */
    single<ReceiptTextRecognizer> { AndroidReceiptTextRecognizer() }

    /** Opt-in-only image retention — discards by default for privacy. */
    single<ReceiptImageRetentionStore> { NoOpReceiptImageRetentionStore() }

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
    // Explicit definition so the default system Clock is used (not resolved from DI).
    viewModel { GoalPlannerViewModel(get(), get()) }
    viewModelOf(::SettingsViewModel)
    viewModelOf(::StreakViewModel)
    viewModelOf(::NotificationSettingsViewModel)
    viewModelOf(::AffordabilityViewModel)
    viewModelOf(::ExpertiseTierViewModel)
    viewModel { LearningPathViewModel(get(), get()) }
    viewModelOf(::NlpTransactionViewModel)

    /** On-device receipt scanning to transaction draft (#2388). */
    viewModelOf(::ReceiptScanViewModel)

    /** True quick cash entry — 1–2 tap cash expense capture (#2180). */
    // Explicit definition so the default system Clock is used (not resolved from DI).
    viewModel {
        QuickCashEntryViewModel(
            householdIdProvider = get(),
            transactionRepository = get(),
            accountRepository = get(),
            categoryRepository = get(),
            prefs = get(),
        )
    }

    // ── Tips ─────────────────────────────────────────────────────────
    viewModelOf(::TipsViewModel)

    // ── Gig / delivery driver tools (#2141, #2137, #2133) ────────────

    /** On-device (encrypted) persistence for shift-based mileage tracking. */
    single<com.finance.android.ui.gig.GigShiftRepository> { GigShiftStore(get()) }

    /** Unifies payouts-by-platform, shift mileage, and Schedule C quick-add. */
    // Explicit definition so the default system Clock is used (not resolved from DI).
    viewModel {
        GigToolsViewModel(
            householdIdProvider = get(),
            transactionRepository = get(),
            shiftStore = get(),
        )
    }

    // ── Insights ─────────────────────────────────────────────────────
    viewModelOf(::InsightsViewModel)

    // ── Predictive Quick-Actions (#2396) ────────────────────────────

    /** Deterministic on-device ranking model for quick-actions. */
    single<QuickActionRanker> { DeterministicQuickActionRanker() }

    /** On-device pin / disable / usage persistence (encrypted prefs). */
    single { QuickActionPreferences(get()) }

    /** Aggregate, non-PII usefulness telemetry. */
    single<QuickActionTelemetry> { TimberQuickActionTelemetry() }

    /** Predictive quick-actions ViewModel. */
    viewModelOf(::QuickActionsViewModel)

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
    viewModelOf(::PaywallViewModel)

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

    // ── Voice transaction entry (#2383) ─────────────────────────────

    /** Deterministic, offline-capable utterance parser (ML Kit decoupled). */
    single<UtteranceParser> { LocalUtteranceParser() }

    /** Privacy-safe voice entry instrumentation — no transaction content. */
    single { VoiceTransactionInstrumentation(get()) }

    /** Offline-safe draft store for failed Assistant handoffs. */
    single<VoiceDraftStore> { InMemoryVoiceDraftStore() }

    /** Voice transaction review/confirmation ViewModel (#2383). */
    viewModelOf(::VoiceTransactionViewModel)

    // ── Batch 15: business / food-truck + teen sharing (apps/android) ─

    /** Rugged field mode preference — large targets, high contrast (#2186). */
    single { RuggedModeManager(get()) }

    /** Business vs personal money separation (#2182). */
    viewModelOf(::BusinessSeparationViewModel)

    /** Weekly/monthly food-truck P&L with COGS/labor/margins (#2184). */
    viewModelOf(::ProfitLossViewModel)

    /** Forward-looking operating cash forecast (#2185). */
    viewModelOf(::CashForecastViewModel)

    /** Receipt capture → saved expense + COGS workflow (#2183). */
    viewModelOf(::ReceiptExpenseViewModel)

    /** Rugged one-handed quick-expense entry (#2186). */
    viewModelOf(::RuggedQuickExpenseViewModel)

    /** Teen privacy-safe sharing of savings wins (#2210). */
    viewModelOf(::ShareWinViewModel)
}
