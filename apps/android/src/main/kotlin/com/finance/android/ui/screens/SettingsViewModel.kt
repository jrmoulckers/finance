// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.BuildConfig
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.GoalRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.export.CsvExportSerializer
import com.finance.core.export.DataExportService
import com.finance.core.export.ExportData
import com.finance.core.export.ExportOutcome
import com.finance.core.export.JsonExportSerializer
import com.finance.models.types.SyncId
import com.finance.sync.auth.AuthManager
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

/**
 * Supported currencies for the default-currency selector.
 * Mirrors [com.finance.models.types.Currency] companion values.
 */
enum class SupportedCurrency(val code: String, val displayName: String) {
    USD("USD", "US Dollar"),
    EUR("EUR", "Euro"),
    GBP("GBP", "British Pound"),
    CAD("CAD", "Canadian Dollar"),
    JPY("JPY", "Japanese Yen"),
}

/** Timeout durations before the app auto-locks. */
enum class AppLockTimeout(val label: String, val seconds: Long) {
    IMMEDIATE("Immediate", 0),
    ONE_MINUTE("1 minute", 60),
    FIVE_MINUTES("5 minutes", 300),
    NEVER("Never", -1),
}

/** Supported export formats. */
enum class ExportFormat(val label: String) {
    JSON("JSON"),
    CSV("CSV"),
}

/** One-shot events emitted by the view-model. */
sealed interface SettingsEvent {
    data class ShowToast(val message: String) : SettingsEvent
    data object NavigateToLogin : SettingsEvent
    data object ExportStarted : SettingsEvent

    /**
     * Signals that export data is ready and should be shared/saved.
     *
     * The screen layer handles the Android-specific [Intent.ACTION_SEND]
     * or save-to-Downloads flow so the ViewModel stays platform-agnostic.
     */
    data class ExportReady(
        val fileName: String,
        val mimeType: String,
        val content: String,
    ) : SettingsEvent

    /** Signals an export failure with a user-facing message. */
    data class ExportFailed(val message: String) : SettingsEvent
}

/** Complete UI state consumed by [SettingsScreen]. */
data class SettingsUiState(
    // Profile
    val userName: String = "",
    val userEmail: String = "",

    // Preferences
    val defaultCurrency: SupportedCurrency = SupportedCurrency.USD,
    val notificationsEnabled: Boolean = true,
    val billRemindersEnabled: Boolean = true,

    // Security
    val biometricEnabled: Boolean = false,
    val biometricAvailable: Boolean = false,
    val appLockTimeout: AppLockTimeout = AppLockTimeout.ONE_MINUTE,

    // Accessibility
    val simplifiedViewEnabled: Boolean = false,
    val darkModeEnabled: Boolean = false,
    val highContrastEnabled: Boolean = false,

    // About
    val appVersion: String = BuildConfig.VERSION_NAME,

    // Export
    val isExporting: Boolean = false,

    // Dialog visibility
    val showExportDialog: Boolean = false,
    val showDeleteDialog: Boolean = false,
    val deleteConfirmationText: String = "",
    val isDeleteEnabled: Boolean = false,
)

// ---------------------------------------------------------------------------
// Preferences keys
// ---------------------------------------------------------------------------

// TODO(#434): Replace with authenticated user's household ID
private val PLACEHOLDER_HOUSEHOLD_ID = SyncId("household-1")

internal object SettingsPreferences {
    const val FILE_NAME = "finance_settings"
    const val DEFAULT_CURRENCY = "default_currency"
    const val NOTIFICATIONS_ENABLED = "notifications_enabled"
    const val BILL_REMINDERS_ENABLED = "bill_reminders_enabled"
    const val BIOMETRIC_ENABLED = "biometric_enabled"
    const val APP_LOCK_TIMEOUT = "app_lock_timeout"
    const val SIMPLIFIED_VIEW = "simplified_view"
    const val DARK_MODE = "dark_mode"
    const val HIGH_CONTRAST = "high_contrast"
    const val USER_NAME = "user_name"
    const val USER_EMAIL = "user_email"
}

// ---------------------------------------------------------------------------
// ViewModel
// ---------------------------------------------------------------------------

/**
 * Manages the settings screen state and persists user preferences.
 *
 * Uses [SharedPreferences] for local persistence. A future iteration will
 * migrate to Multiplatform Settings (or Jetpack DataStore) once the shared
 * KMP module exposes a settings API.
 *
 * @param prefs Local preferences store for settings persistence.
 * @param biometricChecker Abstraction to query biometric hardware availability.
 * @param accountRepository Source for account data used in data export.
 * @param transactionRepository Source for transaction data used in data export.
 * @param budgetRepository Source for budget data used in data export.
 * @param categoryRepository Source for category data used in data export.
 * @param goalRepository Source for goal data used in data export.
 * @param authManager Shared auth manager for sign-out and session management.
 * @param defaultDarkModeEnabled Whether dark mode should default to the current system theme
 *   when the user has not chosen an explicit preference yet.
 */
class SettingsViewModel(
    private val prefs: SharedPreferences,
    private val biometricChecker: BiometricAvailabilityChecker,
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
    private val budgetRepository: BudgetRepository,
    private val categoryRepository: CategoryRepository,
    private val goalRepository: GoalRepository,
    private val authManager: AuthManager,
    private val defaultDarkModeEnabled: Boolean,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<SettingsEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<SettingsEvent> = _events.asSharedFlow()

    init {
        loadPreferences()
    }

    // -- Preference persistence -----------------------------------------------

    private fun loadPreferences() {
        _uiState.update { current ->
            current.copy(
                userName = prefs.getString(SettingsPreferences.USER_NAME, "") ?: "",
                userEmail = prefs.getString(SettingsPreferences.USER_EMAIL, "") ?: "",
                defaultCurrency = prefs.getString(SettingsPreferences.DEFAULT_CURRENCY, null)
                    ?.let { code -> SupportedCurrency.entries.firstOrNull { it.code == code } }
                    ?: SupportedCurrency.USD,
                notificationsEnabled = prefs.getBoolean(SettingsPreferences.NOTIFICATIONS_ENABLED, true),
                billRemindersEnabled = prefs.getBoolean(SettingsPreferences.BILL_REMINDERS_ENABLED, true),
                biometricEnabled = prefs.getBoolean(SettingsPreferences.BIOMETRIC_ENABLED, false),
                biometricAvailable = biometricChecker.isBiometricAvailable(),
                appLockTimeout = prefs.getString(SettingsPreferences.APP_LOCK_TIMEOUT, null)
                    ?.let { name -> AppLockTimeout.entries.firstOrNull { it.name == name } }
                    ?: AppLockTimeout.ONE_MINUTE,
                simplifiedViewEnabled = prefs.getBoolean(SettingsPreferences.SIMPLIFIED_VIEW, false),
                darkModeEnabled = prefs.getBoolean(SettingsPreferences.DARK_MODE, defaultDarkModeEnabled),
                highContrastEnabled = prefs.getBoolean(SettingsPreferences.HIGH_CONTRAST, false),
            )
        }
    }

    private inline fun updatePref(crossinline block: SharedPreferences.Editor.() -> Unit) {
        prefs.edit().apply { block() }.apply()
    }

    // -- Public actions -------------------------------------------------------

    fun setDefaultCurrency(currency: SupportedCurrency) {
        updatePref { putString(SettingsPreferences.DEFAULT_CURRENCY, currency.code) }
        _uiState.update { it.copy(defaultCurrency = currency) }
    }

    fun setNotificationsEnabled(enabled: Boolean) {
        updatePref { putBoolean(SettingsPreferences.NOTIFICATIONS_ENABLED, enabled) }
        _uiState.update { it.copy(notificationsEnabled = enabled) }
    }

    fun setBillRemindersEnabled(enabled: Boolean) {
        updatePref { putBoolean(SettingsPreferences.BILL_REMINDERS_ENABLED, enabled) }
        _uiState.update { it.copy(billRemindersEnabled = enabled) }
    }

    fun setBiometricEnabled(enabled: Boolean) {
        if (enabled && !_uiState.value.biometricAvailable) {
            viewModelScope.launch {
                _events.emit(
                    SettingsEvent.ShowToast("Biometric authentication is not available on this device"),
                )
            }
            return
        }
        updatePref { putBoolean(SettingsPreferences.BIOMETRIC_ENABLED, enabled) }
        _uiState.update { it.copy(biometricEnabled = enabled) }
    }

    fun setAppLockTimeout(timeout: AppLockTimeout) {
        updatePref { putString(SettingsPreferences.APP_LOCK_TIMEOUT, timeout.name) }
        _uiState.update { it.copy(appLockTimeout = timeout) }
    }

    fun setSimplifiedViewEnabled(enabled: Boolean) {
        updatePref { putBoolean(SettingsPreferences.SIMPLIFIED_VIEW, enabled) }
        _uiState.update { it.copy(simplifiedViewEnabled = enabled) }
    }

    fun setDarkModeEnabled(enabled: Boolean) {
        updatePref { putBoolean(SettingsPreferences.DARK_MODE, enabled) }
        _uiState.update { it.copy(darkModeEnabled = enabled) }
    }

    fun setHighContrastEnabled(enabled: Boolean) {
        updatePref { putBoolean(SettingsPreferences.HIGH_CONTRAST, enabled) }
        _uiState.update { it.copy(highContrastEnabled = enabled) }
    }

    // -- Sign out --------------------------------------------------------------

    /**
     * Sign out the current user.
     *
     * Delegates to [AuthManager.signOut] which clears both server-side
     * and local tokens. The auth state change causes [FinanceApp] to
     * automatically show the login screen — no explicit navigation needed.
     */
    fun signOut() {
        viewModelScope.launch {
            authManager.signOut()
        }
    }

    // -- Export ----------------------------------------------------------------

    fun showExportDialog() {
        _uiState.update { it.copy(showExportDialog = true) }
    }

    fun dismissExportDialog() {
        _uiState.update { it.copy(showExportDialog = false) }
    }

    fun exportData(format: ExportFormat) {
        dismissExportDialog()
        viewModelScope.launch {
            _uiState.update { it.copy(isExporting = true) }
            _events.emit(SettingsEvent.ExportStarted)

            try {
                when (val outcome = buildExport(format)) {
                    is ExportOutcome.Success -> {
                        val export = outcome.export
                        _events.emit(
                            SettingsEvent.ExportReady(
                                fileName = export.filename,
                                mimeType = export.format.mimeType,
                                content = export.content,
                            ),
                        )
                        _events.emit(SettingsEvent.ShowToast("Export ready — choose where to save"))
                    }

                    is ExportOutcome.Failure -> {
                        _events.emit(SettingsEvent.ExportFailed(outcome.error.message))
                    }
                }
            } catch (_: Exception) {
                _events.emit(SettingsEvent.ExportFailed("Export failed. Please try again."))
            } finally {
                _uiState.update { it.copy(isExporting = false) }
            }
        }
    }

    /**
     * Builds export content from the repository layer using the shared KMP service.
     *
     * Queries all repositories with the placeholder household ID, then delegates
     * serialization to [DataExportService] so Android and other platforms share
     * the same export schema.
     */
    private suspend fun buildExport(format: ExportFormat): ExportOutcome {
        val exportData = ExportData(
            accounts = accountRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first(),
            transactions = transactionRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first(),
            categories = categoryRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first(),
            budgets = budgetRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first(),
            goals = goalRepository.observeAll(PLACEHOLDER_HOUSEHOLD_ID).first(),
        )
        val serializer = when (format) {
            ExportFormat.JSON -> JsonExportSerializer()
            ExportFormat.CSV -> CsvExportSerializer()
        }

        return DataExportService.export(
            data = exportData,
            serializer = serializer,
            userId = PLACEHOLDER_HOUSEHOLD_ID,
            appVersion = BuildConfig.VERSION_NAME,
        )
    }

    // -- Account deletion -----------------------------------------------------

    fun showDeleteDialog() {
        _uiState.update {
            it.copy(
                showDeleteDialog = true,
                deleteConfirmationText = "",
                isDeleteEnabled = false,
            )
        }
    }

    fun dismissDeleteDialog() {
        _uiState.update {
            it.copy(
                showDeleteDialog = false,
                deleteConfirmationText = "",
                isDeleteEnabled = false,
            )
        }
    }

    fun onDeleteConfirmationTextChanged(text: String) {
        _uiState.update {
            it.copy(
                deleteConfirmationText = text,
                isDeleteEnabled = text == "DELETE",
            )
        }
    }

    fun confirmDeleteAccount() {
        if (!_uiState.value.isDeleteEnabled) return
        viewModelScope.launch {
            // Account deletion backend is tracked by a future issue —
            // when implemented, inject KMP AccountService and call:
            //   accountService.deleteCurrentUser()
            // Then clear local state and navigate to login.
            authManager.signOut()
            prefs.edit().clear().apply()
            _events.emit(SettingsEvent.ShowToast("Account deleted"))
            _events.emit(SettingsEvent.NavigateToLogin)
        }
        dismissDeleteDialog()
    }
}

// ---------------------------------------------------------------------------
// Biometric availability abstraction
// ---------------------------------------------------------------------------

/** Thin abstraction so the VM can be unit-tested without a real [Context]. */
fun interface BiometricAvailabilityChecker {
    fun isBiometricAvailable(): Boolean
}

/**
 * Default implementation that delegates to [androidx.biometric.BiometricManager].
 *
 * Links to the app's [BiometricAuthManager] for the actual prompt flow; this
 * checker only answers the *"can we even offer biometric auth?"* question.
 */
class DefaultBiometricAvailabilityChecker(private val context: Context) : BiometricAvailabilityChecker {
    override fun isBiometricAvailable(): Boolean {
        return try {
            val biometricManager = androidx.biometric.BiometricManager.from(context)
            biometricManager.canAuthenticate(
                androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG,
            ) == androidx.biometric.BiometricManager.BIOMETRIC_SUCCESS
        } catch (_: Exception) {
            // Gracefully degrade if the biometric library is not on the classpath
            false
        }
    }
}
