// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.AuthRepository
import com.finance.desktop.data.repository.SettingsRepository
import com.finance.desktop.data.storage.UserDataPaths
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import java.io.File
import java.util.logging.Level
import java.util.logging.Logger

/**
 * GDPR consent preferences stored alongside app settings.
 */
@Serializable
data class GdprConsent(
    val requiredConsent: Boolean = false,
    val analyticsConsent: Boolean = false,
    val crashReportingConsent: Boolean = false,
    val consentTimestamp: Long = 0L,
)

/**
 * UI state for the GDPR consent flow and privacy settings.
 */
data class GdprConsentUiState(
    val showConsentDialog: Boolean = false,
    val consent: GdprConsent = GdprConsent(),
    val isExporting: Boolean = false,
    val isDeletingAccount: Boolean = false,
    val exportPath: String? = null,
    val error: String? = null,
    val showDeleteConfirmation: Boolean = false,
)

/**
 * ViewModel managing GDPR consent, privacy settings, data export, and account deletion.
 *
 * On first run (no consent recorded), shows a consent dialog. The user can:
 * - Accept all data processing
 * - Accept only required data processing
 * - Customize analytics and crash reporting consent
 *
 * Privacy settings are persisted via [SettingsRepository] (DPAPI-encrypted).
 * Data export writes a JSON file to the user's chosen directory.
 * Account deletion triggers server-side deletion via [AuthRepository].
 */
class GdprConsentViewModel(
    private val settingsRepository: SettingsRepository,
    private val authRepository: AuthRepository,
) : DesktopViewModel() {

    companion object {
        private val logger: Logger = Logger.getLogger(GdprConsentViewModel::class.java.name)

        private fun resolveConsentFile(): File {
            // UserDataPaths.consentFile ensures the root directory exists.
            return UserDataPaths.consentFile.toFile()
        }
    }

    private val _uiState = MutableStateFlow(GdprConsentUiState())
    val uiState: StateFlow<GdprConsentUiState> = _uiState.asStateFlow()

    init {
        checkConsent()
    }

    /**
     * Accept all data processing (required + analytics + crash reporting).
     */
    fun acceptAll() {
        saveConsent(GdprConsent(
            requiredConsent = true,
            analyticsConsent = true,
            crashReportingConsent = true,
            consentTimestamp = System.currentTimeMillis(),
        ))
    }

    /**
     * Accept only required data processing.
     */
    fun acceptRequiredOnly() {
        saveConsent(GdprConsent(
            requiredConsent = true,
            analyticsConsent = false,
            crashReportingConsent = false,
            consentTimestamp = System.currentTimeMillis(),
        ))
    }

    /**
     * Customize consent with specific preferences.
     */
    fun customizeConsent(analytics: Boolean, crashReporting: Boolean) {
        saveConsent(GdprConsent(
            requiredConsent = true,
            analyticsConsent = analytics,
            crashReportingConsent = crashReporting,
            consentTimestamp = System.currentTimeMillis(),
        ))
    }

    /**
     * Update analytics consent preference.
     */
    fun setAnalyticsConsent(enabled: Boolean) {
        val current = _uiState.value.consent
        saveConsent(current.copy(
            analyticsConsent = enabled,
            consentTimestamp = System.currentTimeMillis(),
        ))
    }

    /**
     * Update crash reporting consent preference.
     */
    fun setCrashReportingConsent(enabled: Boolean) {
        val current = _uiState.value.consent
        saveConsent(current.copy(
            crashReportingConsent = enabled,
            consentTimestamp = System.currentTimeMillis(),
        ))
    }

    /**
     * Export all user data to a JSON file.
     *
     * @param directory Target directory for the export file.
     */
    fun exportData(directory: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isExporting = true, error = null)
            @Suppress("TooGenericExceptionCaught") // GDPR operation error boundary
            try {
                val settings = settingsRepository.load()
                val exportData = buildString {
                    appendLine("{")
                    appendLine("  \"exportDate\": \"${java.time.Instant.now()}\",")
                    appendLine("  \"settings\": {")
                    appendLine("    \"darkMode\": ${settings.darkMode},")
                    appendLine("    \"language\": \"${settings.language}\",")
                    appendLine("    \"defaultCurrency\": \"${settings.defaultCurrency}\"")
                    appendLine("  },")
                    appendLine("  \"consent\": {")
                    appendLine("    \"analytics\": ${_uiState.value.consent.analyticsConsent},")
                    appendLine("    \"crashReporting\": ${_uiState.value.consent.crashReportingConsent},")
                    appendLine("    \"timestamp\": ${_uiState.value.consent.consentTimestamp}")
                    appendLine("  }")
                    appendLine("}")
                }

                val exportFile = File(directory, "finance_data_export_${System.currentTimeMillis()}.json")
                exportFile.writeText(exportData)

                _uiState.value = _uiState.value.copy(
                    isExporting = false,
                    exportPath = exportFile.absolutePath,
                )
                logger.info("Data exported to: ${exportFile.absolutePath}")
            } catch (e: Exception) {
                logger.log(Level.SEVERE, "Data export failed", e)
                _uiState.value = _uiState.value.copy(
                    isExporting = false,
                    error = "Export failed: ${e.message}",
                )
            }
        }
    }

    /**
     * Show the account deletion confirmation dialog.
     */
    fun requestAccountDeletion() {
        _uiState.value = _uiState.value.copy(showDeleteConfirmation = true)
    }

    /**
     * Cancel the account deletion request.
     */
    fun cancelAccountDeletion() {
        _uiState.value = _uiState.value.copy(showDeleteConfirmation = false)
    }

    /**
     * Confirm and execute account deletion.
     *
     * This is a destructive, irreversible operation that:
     * 1. Deletes the account on the server
     * 2. Clears all local data
     * 3. Removes consent records
     */
    fun confirmAccountDeletion() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isDeletingAccount = true,
                showDeleteConfirmation = false,
                error = null,
            )
            @Suppress("TooGenericExceptionCaught") // GDPR operation error boundary
            try {
                authRepository.deleteAccount()
                    .onSuccess {
                        // Clear local consent and settings
                        resolveConsentFile().delete()
                        settingsRepository.reset()
                        _uiState.value = GdprConsentUiState(showConsentDialog = true)
                        logger.info("Account deleted successfully")
                    }
                    .onFailure { e ->
                        _uiState.value = _uiState.value.copy(
                            isDeletingAccount = false,
                            error = "Account deletion failed: ${e.message}",
                        )
                    }
            } catch (e: Exception) {
                logger.log(Level.SEVERE, "Account deletion failed", e)
                _uiState.value = _uiState.value.copy(
                    isDeletingAccount = false,
                    error = "Account deletion failed: ${e.message}",
                )
            }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    private fun checkConsent() {
        val consentFile = resolveConsentFile()
        if (consentFile.exists()) {
            @Suppress("TooGenericExceptionCaught") // GDPR operation error boundary
            try {
                val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
                val consent = json.decodeFromString<GdprConsent>(consentFile.readText())
                _uiState.value = _uiState.value.copy(
                    showConsentDialog = false,
                    consent = consent,
                )
            } catch (e: Exception) {
                logger.log(Level.WARNING, "Failed to load consent — showing dialog", e)
                _uiState.value = _uiState.value.copy(showConsentDialog = true)
            }
        } else {
            _uiState.value = _uiState.value.copy(showConsentDialog = true)
        }
    }

    private fun saveConsent(consent: GdprConsent) {
        @Suppress("TooGenericExceptionCaught") // GDPR operation error boundary
        try {
            val json = kotlinx.serialization.json.Json { prettyPrint = true }
            val consentJson = json.encodeToString(GdprConsent.serializer(), consent)
            resolveConsentFile().writeText(consentJson)
            _uiState.value = _uiState.value.copy(
                showConsentDialog = false,
                consent = consent,
            )
            logger.info("GDPR consent saved (analytics=${consent.analyticsConsent}, crash=${consent.crashReportingConsent})")
        } catch (e: Exception) {
            logger.log(Level.SEVERE, "Failed to save consent", e)
            _uiState.value = _uiState.value.copy(
                error = "Failed to save consent: ${e.message}",
            )
        }
    }
}
