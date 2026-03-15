// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens

import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
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
    val highContrastEnabled: Boolean = false,

    // About
    val appVersion: String = "1.0.0",

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

private object PrefKeys {
    const val FILE_NAME = "finance_settings"
    const val DEFAULT_CURRENCY = "default_currency"
    const val NOTIFICATIONS_ENABLED = "notifications_enabled"
    const val BILL_REMINDERS_ENABLED = "bill_reminders_enabled"
    const val BIOMETRIC_ENABLED = "biometric_enabled"
    const val APP_LOCK_TIMEOUT = "app_lock_timeout"
    const val SIMPLIFIED_VIEW = "simplified_view"
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
 */
class SettingsViewModel(
    private val prefs: SharedPreferences,
    private val biometricChecker: BiometricAvailabilityChecker,
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
                userName = prefs.getString(PrefKeys.USER_NAME, "") ?: "",
                userEmail = prefs.getString(PrefKeys.USER_EMAIL, "") ?: "",
                defaultCurrency = prefs.getString(PrefKeys.DEFAULT_CURRENCY, null)
                    ?.let { code -> SupportedCurrency.entries.firstOrNull { it.code == code } }
                    ?: SupportedCurrency.USD,
                notificationsEnabled = prefs.getBoolean(PrefKeys.NOTIFICATIONS_ENABLED, true),
                billRemindersEnabled = prefs.getBoolean(PrefKeys.BILL_REMINDERS_ENABLED, true),
                biometricEnabled = prefs.getBoolean(PrefKeys.BIOMETRIC_ENABLED, false),
                biometricAvailable = biometricChecker.isBiometricAvailable(),
                appLockTimeout = prefs.getString(PrefKeys.APP_LOCK_TIMEOUT, null)
                    ?.let { name -> AppLockTimeout.entries.firstOrNull { it.name == name } }
                    ?: AppLockTimeout.ONE_MINUTE,
                simplifiedViewEnabled = prefs.getBoolean(PrefKeys.SIMPLIFIED_VIEW, false),
                highContrastEnabled = prefs.getBoolean(PrefKeys.HIGH_CONTRAST, false),
            )
        }
    }

    private inline fun updatePref(crossinline block: SharedPreferences.Editor.() -> Unit) {
        prefs.edit().apply { block() }.apply()
    }

    // -- Public actions -------------------------------------------------------

    fun setDefaultCurrency(currency: SupportedCurrency) {
        updatePref { putString(PrefKeys.DEFAULT_CURRENCY, currency.code) }
        _uiState.update { it.copy(defaultCurrency = currency) }
    }

    fun setNotificationsEnabled(enabled: Boolean) {
        updatePref { putBoolean(PrefKeys.NOTIFICATIONS_ENABLED, enabled) }
        _uiState.update { it.copy(notificationsEnabled = enabled) }
    }

    fun setBillRemindersEnabled(enabled: Boolean) {
        updatePref { putBoolean(PrefKeys.BILL_REMINDERS_ENABLED, enabled) }
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
        updatePref { putBoolean(PrefKeys.BIOMETRIC_ENABLED, enabled) }
        _uiState.update { it.copy(biometricEnabled = enabled) }
    }

    fun setAppLockTimeout(timeout: AppLockTimeout) {
        updatePref { putString(PrefKeys.APP_LOCK_TIMEOUT, timeout.name) }
        _uiState.update { it.copy(appLockTimeout = timeout) }
    }

    fun setSimplifiedViewEnabled(enabled: Boolean) {
        updatePref { putBoolean(PrefKeys.SIMPLIFIED_VIEW, enabled) }
        _uiState.update { it.copy(simplifiedViewEnabled = enabled) }
    }

    fun setHighContrastEnabled(enabled: Boolean) {
        updatePref { putBoolean(PrefKeys.HIGH_CONTRAST, enabled) }
        _uiState.update { it.copy(highContrastEnabled = enabled) }
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
                // TODO(#239): Replace mock data with real database query once the
                // KMP DataExportService (packages/core/export) is available.
                // Example future integration:
                //   val exportData = dataExportService.gatherExportData()
                //   val serialized = when (format) {
                //       ExportFormat.JSON -> JsonExportSerializer().serialize(exportData)
                //       ExportFormat.CSV  -> CsvExportSerializer().serialize(exportData)
                //   }
                val serialized = buildMockExportContent(format)

                val timestamp = java.text.SimpleDateFormat(
                    "yyyy-MM-dd",
                    java.util.Locale.US,
                ).format(java.util.Date())
                val extension = format.label.lowercase()
                val fileName = "finance-export-$timestamp.$extension"
                val mimeType = when (format) {
                    ExportFormat.JSON -> "application/json"
                    ExportFormat.CSV -> "text/csv"
                }

                _events.emit(SettingsEvent.ExportReady(fileName, mimeType, serialized))
                _events.emit(SettingsEvent.ShowToast("Export ready — choose where to save"))
            } catch (_: Exception) {
                _events.emit(SettingsEvent.ExportFailed("Export failed. Please try again."))
            } finally {
                _uiState.update { it.copy(isExporting = false) }
            }
        }
    }

    /**
     * Builds mock export content using sample data structures.
     *
     * This is a temporary implementation until the KMP DataExportService is
     * integrated. It intentionally does NOT log the content to avoid leaking
     * financial data.
     */
    private fun buildMockExportContent(format: ExportFormat): String {
        // Minimal representative data for export testing
        data class ExportRow(
            val id: String,
            val date: String,
            val payee: String,
            val category: String,
            val amount: String,
        )

        val rows = listOf(
            ExportRow("txn-1", "2024-03-06", "Grocery Store", "Food", "-67.42"),
            ExportRow("txn-2", "2024-03-06", "Monthly Salary", "Income", "4500.00"),
            ExportRow("txn-3", "2024-03-05", "Electric Bill", "Utilities", "-124.00"),
        )

        return when (format) {
            ExportFormat.JSON -> buildString {
                appendLine("{")
                appendLine("""  "exportedAt": "${java.time.Instant.now()}",""")
                appendLine("""  "transactions": [""")
                rows.forEachIndexed { i, row ->
                    val comma = if (i < rows.lastIndex) "," else ""
                    appendLine(
                        """    {"id":"${row.id}","date":"${row.date}","payee":"${row.payee}","category":"${row.category}","amount":${row.amount}}$comma""",
                    )
                }
                appendLine("  ]")
                appendLine("}")
            }
            ExportFormat.CSV -> buildString {
                appendLine("id,date,payee,category,amount")
                rows.forEach { row ->
                    appendLine("${row.id},${row.date},${row.payee},${row.category},${row.amount}")
                }
            }
        }
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
            prefs.edit().clear().apply()
            _events.emit(SettingsEvent.ShowToast("Account deleted"))
            _events.emit(SettingsEvent.NavigateToLogin)
        }
        dismissDeleteDialog()
    }

    // -- Factory --------------------------------------------------------------

    companion object {
        /**
         * Convenience factory that resolves dependencies from the given [Context].
         */
        fun provideFactory(
            context: Context,
            biometricChecker: BiometricAvailabilityChecker = DefaultBiometricAvailabilityChecker(context),
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                val prefs = context.getSharedPreferences(PrefKeys.FILE_NAME, Context.MODE_PRIVATE)
                return SettingsViewModel(prefs, biometricChecker) as T
            }
        }
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
