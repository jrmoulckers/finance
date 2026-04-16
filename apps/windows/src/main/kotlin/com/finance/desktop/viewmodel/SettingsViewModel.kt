// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.AppSettings
import com.finance.desktop.data.repository.SettingsRepository
import com.finance.desktop.security.WindowsHelloManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.logging.Level
import java.util.logging.Logger

/**
 * UI state for the Settings screen.
 *
 * Mirrors [AppSettings] with additional transient UI flags (loading state,
 * security re-auth requirement, error messages).
 */
data class SettingsUiState(
    val isLoading: Boolean = true,

    // ── Appearance ──
    val darkMode: Boolean = false,
    val language: String = "English",
    val accentColor: String = "Blue",

    // ── Security ──
    val windowsHelloEnabled: Boolean = true,
    val autoLockEnabled: Boolean = true,
    val autoLockTimeoutMinutes: Int = 5,

    // ── Notifications ──
    val budgetNotificationsEnabled: Boolean = true,
    val goalNotificationsEnabled: Boolean = true,

    // ── Data & Sync ──
    val defaultCurrency: String = "USD",
    val cloudSyncEnabled: Boolean = true,

    // ── Transient UI state ──
    val requiresAuth: Boolean = false,
    val errorMessage: String? = null,
    val lastSavedTimestamp: Long = 0L,
)

/**
 * ViewModel for the Settings screen.
 *
 * Loads persisted settings from [SettingsRepository] on construction and
 * exposes them as a [StateFlow]. Each setter method validates the change,
 * optionally gates on Windows Hello re-authentication for security settings,
 * and persists the updated settings atomically.
 *
 * ## Security-gated settings
 *
 * Changes to `windowsHelloEnabled` and `autoLockEnabled` require the user to
 * re-authenticate via [WindowsHelloManager] before the change is applied.
 * This prevents an attacker with brief physical access from disabling
 * biometric protection.
 */
class SettingsViewModel(
    private val settingsRepository: SettingsRepository,
    private val windowsHelloManager: WindowsHelloManager,
) : DesktopViewModel() {

    companion object {
        private val logger: Logger = Logger.getLogger(SettingsViewModel::class.java.name)
    }

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        loadSettings()
    }

    // ── Appearance ───────────────────────────────────────────────────────────

    fun setDarkMode(enabled: Boolean) = updateAndSave { it.copy(darkMode = enabled) }

    fun setLanguage(language: String) = updateAndSave { it.copy(language = language) }

    fun setAccentColor(color: String) = updateAndSave { it.copy(accentColor = color) }

    // ── Security (Windows Hello gated) ──────────────────────────────────────

    /**
     * Toggles Windows Hello. Requires re-authentication before disabling.
     */
    fun setWindowsHelloEnabled(enabled: Boolean) {
        if (!enabled) {
            // Disabling biometrics requires proof of identity
            executeWithAuth("Confirm your identity to disable Windows Hello") {
                updateAndSave { it.copy(windowsHelloEnabled = false) }
            }
        } else {
            updateAndSave { it.copy(windowsHelloEnabled = true) }
        }
    }

    /**
     * Toggles auto-lock. Requires re-authentication before disabling.
     */
    fun setAutoLockEnabled(enabled: Boolean) {
        if (!enabled) {
            executeWithAuth("Confirm your identity to disable auto-lock") {
                updateAndSave { it.copy(autoLockEnabled = false) }
            }
        } else {
            updateAndSave { it.copy(autoLockEnabled = true) }
        }
    }

    // ── Notifications ───────────────────────────────────────────────────────

    fun setBudgetNotifications(enabled: Boolean) =
        updateAndSave { it.copy(budgetNotificationsEnabled = enabled) }

    fun setGoalNotifications(enabled: Boolean) =
        updateAndSave { it.copy(goalNotificationsEnabled = enabled) }

    // ── Data & Sync ─────────────────────────────────────────────────────────

    fun setDefaultCurrency(currency: String) =
        updateAndSave { it.copy(defaultCurrency = currency) }

    fun setCloudSyncEnabled(enabled: Boolean) =
        updateAndSave { it.copy(cloudSyncEnabled = enabled) }

    // ── Reset ───────────────────────────────────────────────────────────────

    /**
     * Resets all settings to defaults. Requires Windows Hello.
     */
    fun resetToDefaults() {
        executeWithAuth("Confirm your identity to reset all settings") {
            viewModelScope.launch {
                try {
                    settingsRepository.reset()
                    val defaults = settingsRepository.load()
                    _uiState.value = defaults.toUiState().copy(
                        lastSavedTimestamp = System.currentTimeMillis(),
                    )
                } catch (e: Exception) {
                    logger.log(Level.SEVERE, "Failed to reset settings", e)
                    _uiState.value = _uiState.value.copy(
                        errorMessage = "Failed to reset settings: ${e.message}",
                    )
                }
            }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    // ── Internal helpers ────────────────────────────────────────────────────

    private fun loadSettings() {
        viewModelScope.launch {
            try {
                val settings = settingsRepository.load()
                _uiState.value = settings.toUiState().copy(isLoading = false)
            } catch (e: Exception) {
                logger.log(Level.SEVERE, "Failed to load settings", e)
                _uiState.value = SettingsUiState(
                    isLoading = false,
                    errorMessage = "Failed to load settings: ${e.message}",
                )
            }
        }
    }

    /**
     * Applies [transform] to the current UI state, then persists.
     */
    private fun updateAndSave(transform: (SettingsUiState) -> SettingsUiState) {
        viewModelScope.launch {
            try {
                val updated = transform(_uiState.value)
                _uiState.value = updated.copy(
                    errorMessage = null,
                    lastSavedTimestamp = System.currentTimeMillis(),
                )
                settingsRepository.save(updated.toAppSettings())
            } catch (e: Exception) {
                logger.log(Level.SEVERE, "Failed to save settings", e)
                _uiState.value = _uiState.value.copy(
                    errorMessage = "Failed to save settings: ${e.message}",
                )
            }
        }
    }

    /**
     * Executes [action] only if Windows Hello authentication succeeds.
     * If Windows Hello is unavailable, the action proceeds (graceful
     * degradation on devices without biometric hardware).
     */
    private fun executeWithAuth(reason: String, action: () -> Unit) {
        viewModelScope.launch {
            if (!windowsHelloManager.canAuthenticate()) {
                // No Windows Hello available — allow change with warning
                logger.warning("Windows Hello unavailable — bypassing security gate")
                action()
                return@launch
            }

            _uiState.value = _uiState.value.copy(requiresAuth = true)
            val authenticated = windowsHelloManager.authenticate(reason)
            _uiState.value = _uiState.value.copy(requiresAuth = false)

            if (authenticated) {
                action()
            } else {
                _uiState.value = _uiState.value.copy(
                    errorMessage = "Authentication required to change this setting",
                )
            }
        }
    }
}

// ── Mapping helpers ─────────────────────────────────────────────────────────

private fun AppSettings.toUiState(): SettingsUiState = SettingsUiState(
    isLoading = false,
    darkMode = darkMode,
    language = language,
    accentColor = accentColor,
    windowsHelloEnabled = windowsHelloEnabled,
    autoLockEnabled = autoLockEnabled,
    autoLockTimeoutMinutes = autoLockTimeoutMinutes,
    budgetNotificationsEnabled = budgetNotificationsEnabled,
    goalNotificationsEnabled = goalNotificationsEnabled,
    defaultCurrency = defaultCurrency,
    cloudSyncEnabled = cloudSyncEnabled,
)

private fun SettingsUiState.toAppSettings(): AppSettings = AppSettings(
    darkMode = darkMode,
    language = language,
    accentColor = accentColor,
    windowsHelloEnabled = windowsHelloEnabled,
    autoLockEnabled = autoLockEnabled,
    autoLockTimeoutMinutes = autoLockTimeoutMinutes,
    budgetNotificationsEnabled = budgetNotificationsEnabled,
    goalNotificationsEnabled = goalNotificationsEnabled,
    defaultCurrency = defaultCurrency,
    cloudSyncEnabled = cloudSyncEnabled,
)
