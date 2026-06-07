// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.di

import com.finance.core.currency.CurrencyConverter
import com.finance.core.currency.ExchangeRateProvider
import com.finance.db.EncryptionKeyProvider
import com.finance.db.FinanceDatabase
import com.finance.desktop.data.database.DesktopDatabaseManager
import com.finance.desktop.data.repository.*
import com.finance.desktop.notifications.DesktopNotificationManager
import com.finance.desktop.notifications.EnhancedNotificationManager
import com.finance.desktop.navigation.DeepLinkHandler
import com.finance.desktop.security.*
import com.finance.desktop.sync.DesktopSyncCoordinator
import com.finance.desktop.tray.FinanceSystemTray
import com.finance.desktop.tray.QuickAddTransactionManager
import com.finance.desktop.viewmodel.*
import com.finance.desktop.voice.VoiceCommandManager
import com.finance.desktop.voice.VoiceCommandParser
import com.finance.desktop.widgets.WidgetContentRenderer
import com.finance.desktop.widgets.WidgetDataProvider
import com.finance.desktop.widgets.WidgetRegistrationManager
import com.finance.sync.DefaultSyncEngine
import com.finance.sync.SyncConfig
import com.finance.sync.SyncProvider
import com.finance.sync.auth.TokenManager
import com.finance.sync.auth.TokenStorage
import com.finance.sync.delta.DeltaSyncManager
import com.finance.sync.delta.SequenceTracker
import com.finance.sync.queue.MutationQueue
import io.ktor.client.HttpClient
import org.koin.core.Koin
import org.koin.core.context.startKoin
import org.koin.core.context.stopKoin
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.fail

class KoinGraphSmokeTest {
    @AfterTest
    fun tearDown() {
        stopKoin()
    }

    @Test
    fun `windows Koin graph resolves registered singletons`() {
        val testAuthModule = createAuthModule {
            SupabaseConfig(
                url = "https://example.supabase.co",
                anonKey = "anon-key",
            )
        }
        val modules = appModules.map { module ->
            if (module === authModule) testAuthModule else module
        }
        val koin = startKoin { modules(modules) }.koin

        val resolutions = listOf<Pair<String, Koin.() -> Any>>(
            "EncryptionKeyProvider" to { get<EncryptionKeyProvider>() },
            "DesktopDatabaseManager" to { get<DesktopDatabaseManager>() },
            "FinanceDatabase" to { get<FinanceDatabase>() },
            "AccountRepository" to { get<AccountRepository>() },
            "TransactionRepository" to { get<TransactionRepository>() },
            "BudgetRepository" to { get<BudgetRepository>() },
            "CategoryRepository" to { get<CategoryRepository>() },
            "GoalRepository" to { get<GoalRepository>() },
            "SettingsRepository" to { get<SettingsRepository>() },
            "ExchangeRateProvider" to { get<ExchangeRateProvider>() },
            "CurrencyConverter" to { get<CurrencyConverter>() },
            "CurrencyRepository" to { get<CurrencyRepository>() },
            "HttpClient" to { get<HttpClient>() },
            "TokenStorage" to { get<TokenStorage>() },
            "TokenManager" to { get<TokenManager>() },
            "AuthRepository" to { get<AuthRepository>() },
            "SyncConfig" to { get<SyncConfig>() },
            "SyncProvider" to { get<SyncProvider>() },
            "MutationQueue" to { get<MutationQueue>() },
            "SequenceTracker" to { get<SequenceTracker>() },
            "DeltaSyncManager" to { get<DeltaSyncManager>() },
            "DefaultSyncEngine" to { get<DefaultSyncEngine>() },
            "DesktopSyncCoordinator" to { get<DesktopSyncCoordinator>() },
            "WindowsHelloManager" to { get<WindowsHelloManager>() },
            "DpapiManager" to { get<DpapiManager>() },
            "SecureTokenStorage" to { get<SecureTokenStorage>() },
            "CredentialManager" to { get<CredentialManager>() },
            "AutoLockManager" to { get<AutoLockManager>() },
            "SessionManager" to { get<SessionManager>() },
            "CertificatePinningManager" to { get<CertificatePinningManager>() },
            "DesktopNotificationManager" to { get<DesktopNotificationManager>() },
            "WidgetDataProvider" to { get<WidgetDataProvider>() },
            "WidgetContentRenderer" to { get<WidgetContentRenderer>() },
            "WidgetRegistrationManager" to { get<WidgetRegistrationManager>() },
            "VoiceCommandManager" to { get<VoiceCommandManager>() },
            "VoiceCommandParser" to { get<VoiceCommandParser>() },
            "FinanceSystemTray" to { get<FinanceSystemTray>() },
            "QuickAddTransactionManager" to { get<QuickAddTransactionManager>() },
            "EnhancedNotificationManager" to { get<EnhancedNotificationManager>() },
            "DeepLinkHandler" to { get<DeepLinkHandler>() },
            "DashboardViewModel" to { get<DashboardViewModel>() },
            "AccountsViewModel" to { get<AccountsViewModel>() },
            "TransactionsViewModel" to { get<TransactionsViewModel>() },
            "BudgetsViewModel" to { get<BudgetsViewModel>() },
            "GoalsViewModel" to { get<GoalsViewModel>() },
            "SyncViewModel" to { get<SyncViewModel>() },
            "SettingsViewModel" to { get<SettingsViewModel>() },
            "AuthViewModel" to { get<AuthViewModel>() },
            "LoginViewModel" to { get<LoginViewModel>() },
            "GdprConsentViewModel" to { get<GdprConsentViewModel>() },
            "WidgetViewModel" to { get<WidgetViewModel>() },
            "VoiceTransactionViewModel" to { get<VoiceTransactionViewModel>() },
            "DiagnosticsViewModel" to { get<DiagnosticsViewModel>() },
            "WidgetBoardViewModel" to { get<WidgetBoardViewModel>() },
            "HealthScoreViewModel" to { get<HealthScoreViewModel>() },
            "ReportBuilderViewModel" to { get<ReportBuilderViewModel>() },
            "BudgetNegotiationViewModel" to { get<BudgetNegotiationViewModel>() },
            "EntitlementViewModel" to { get<EntitlementViewModel>() },
            "TipsViewModel" to { get<TipsViewModel>() },
            "GamificationViewModel" to { get<GamificationViewModel>() },
            "CurrencyViewModel" to { get<CurrencyViewModel>() },
            "NaturalLanguageViewModel" to { get<NaturalLanguageViewModel>() },
        )

        resolutions.forEach { (name, resolve) ->
            try {
                koin.resolve()
            } catch (exception: Throwable) {
                fail("Failed to resolve $name", exception)
            }
        }
    }
}
