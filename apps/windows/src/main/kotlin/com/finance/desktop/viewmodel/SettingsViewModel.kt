// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.security.SecureTokenStorage
import com.finance.desktop.security.WindowsHelloManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * UI state for the Settings screen.
 *
 * All preference values are stored as simple types. Preferences that
 * affect security (Windows Hello, auto-lock) are backed by [SecureTokenStorage]
 * via DPAPI encryption. Display preferences are stored locally.
 *
 * @property darkMode Whether the dark color scheme is active.
 * @property windowsHelloEnabled Whether Windows Hello authentication is enabled.
 * @property windowsHelloAvailable Whether the device supports Windows Hello.
 * @property autoLockEnabled Whether the app auto-locks after inactivity.
 * @property autoLockMinutes Minutes of inactivity before auto-lock triggers.
 * @property budgetNotifications Whether budget alert notifications are enabled.
 * @property goalNotifications Whether goal milestone notifications are enabled.
 * @property syncEnabled Whether cloud sync is active.
 * @property selectedCurrency ISO 4217 currency code for display.
 * @property selectedLanguage Display language name.
 * @property appVersion Application version string.
 */
data class SettingsUiState(
    val darkMode: Boolean = false,
    val windowsHelloEnabled: Boolean = true,
    val windowsHelloAvailable: Boolean = false,
    val autoLockEnabled: Boolean = true,
    val autoLockMinutes: Int = 5,
    val budgetNotifications: Boolean = true,
    val goalNotifications: Boolean = true,
    val syncEnabled: Boolean = true,
    val selectedCurrency: String = "USD",
    val selectedLanguage: String = "English",
    val appVersion: String = "1.0.0",
    val buildDate: String = "2025.06.01",
)

/**
 * ViewModel for the Settings screen.
 *
 * Manages user preferences with persistence for security-related settings
 * via [SecureTokenStorage] and [WindowsHelloManager]. Display preferences
 * are held in memory (to be backed by SharedPreferences/DataStore in a
 * future iteration).
 *
 * Each setter method updates the UI state immediately and persists the
 * value asynchronously. This ensures a responsive UI while maintaining
 * data consistency.
 */
class SettingsViewModel(
    private val windowsHelloManager: WindowsHelloManager,
    private val secureTokenStorage: SecureTokenStorage,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    companion object {
        private const val PREF_WINDOWS_HELLO = "pref_windows_hello"
        private const val PREF_AUTO_LOCK = "pref_auto_lock"
        private const val PREF_DARK_MODE = "pref_dark_mode"
    }

    init {
        loadPreferences()
    }

    private fun loadPreferences() {
        viewModelScope.launch {
            val windowsHelloAvailable = windowsHelloManager.canAuthenticate()

            // Load persisted security preferences from DPAPI-encrypted storage
            val windowsHelloEnabled = loadBooleanPref(PREF_WINDOWS_HELLO, true)
            val autoLockEnabled = loadBooleanPref(PREF_AUTO_LOCK, true)
            val darkMode = loadBooleanPref(PREF_DARK_MODE, false)

            _uiState.value = _uiState.value.copy(
                windowsHelloAvailable = windowsHelloAvailable,
                windowsHelloEnabled = windowsHelloEnabled && windowsHelloAvailable,
                autoLockEnabled = autoLockEnabled,
                darkMode = darkMode,
            )
        }
    }

    fun setDarkMode(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(darkMode = enabled)
        persistBooleanPref(PREF_DARK_MODE, enabled)
    }

    fun setWindowsHelloEnabled(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(windowsHelloEnabled = enabled)
        persistBooleanPref(PREF_WINDOWS_HELLO, enabled)
    }

    fun setAutoLockEnabled(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(autoLockEnabled = enabled)
        persistBooleanPref(PREF_AUTO_LOCK, enabled)
    }

    fun setBudgetNotifications(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(budgetNotifications = enabled)
    }

    fun setGoalNotifications(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(goalNotifications = enabled)
    }

    fun setSyncEnabled(enabled: Boolean) {
        _uiState.value = _uiState.value.copy(syncEnabled = enabled)
    }

    fun setCurrency(currency: String) {
        _uiState.value = _uiState.value.copy(selectedCurrency = currency)
    }

    fun setLanguage(language: String) {
        _uiState.value = _uiState.value.copy(selectedLanguage = language)
    }

    /**
     * Loads a boolean preference from DPAPI-encrypted storage.
     * Returns [default] if the preference is not found or cannot be read.
     */
    private fun loadBooleanPref(key: String, default: Boolean): Boolean {
        return try {
            secureTokenStorage.loadToken(key)?.toBooleanStrictOrNull() ?: default
        } catch (_: Exception) {
            default
        }
    }

    /**
     * Persists a boolean preference to DPAPI-encrypted storage.
     */
    private fun persistBooleanPref(key: String, value: Boolean) {
        viewModelScope.launch {
            try {
                secureTokenStorage.saveToken(key, value.toString())
            } catch (e: Exception) {
                // Log but don't crash — preferences are not critical
                java.util.logging.Logger.getLogger("SettingsViewModel")
                    .warning("Failed to persist preference $key: ${e.message}")
            }
        }
    }
}
