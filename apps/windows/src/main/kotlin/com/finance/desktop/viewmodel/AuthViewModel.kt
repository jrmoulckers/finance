// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.security.SecureTokenStorage
import com.finance.desktop.security.WindowsHelloManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Authentication state for the Windows desktop application.
 *
 * @property isAuthenticated Whether the user has passed authentication.
 * @property isWindowsHelloAvailable Whether Windows Hello is configured on this device.
 * @property isAuthenticating Whether an authentication attempt is in progress.
 * @property authError Human-readable error message from the last failed attempt, if any.
 * @property requiresAuth Whether the app requires authentication before use.
 */
data class AuthUiState(
    val isAuthenticated: Boolean = false,
    val isWindowsHelloAvailable: Boolean = false,
    val isAuthenticating: Boolean = false,
    val authError: String? = null,
    val requiresAuth: Boolean = true,
)

/**
 * ViewModel managing authentication state for the Finance Windows app.
 *
 * Coordinates Windows Hello biometric/PIN authentication with DPAPI-backed
 * secure token storage. The authentication flow:
 *
 * 1. On startup, checks if Windows Hello is available via [WindowsHelloManager]
 * 2. If available and auth is required, presents the lock screen
 * 3. User authenticates via Windows Hello (biometric → PIN fallback)
 * 4. On success, loads tokens from [SecureTokenStorage] for API access
 * 5. On failure, shows error and allows retry
 *
 * The ViewModel also manages auto-lock state — when the app is inactive
 * for a configured period, [lockApp] is called to require re-authentication.
 *
 * ## Thread Safety
 *
 * All state mutations happen on the [viewModelScope] dispatcher. The
 * [WindowsHelloManager] calls are blocking (PowerShell subprocess) and
 * are dispatched to [Dispatchers.IO] via the coroutine scope.
 */
class AuthViewModel(
    private val windowsHelloManager: WindowsHelloManager,
    private val secureTokenStorage: SecureTokenStorage,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        checkWindowsHelloAvailability()
    }

    /**
     * Checks whether Windows Hello is configured on this device and
     * whether stored credentials exist (indicating auth should be required).
     */
    private fun checkWindowsHelloAvailability() {
        viewModelScope.launch {
            val available = windowsHelloManager.canAuthenticate()
            val hasTokens = secureTokenStorage.hasToken(SecureTokenStorage.KEY_ACCESS_TOKEN)
            _uiState.value = _uiState.value.copy(
                isWindowsHelloAvailable = available,
                requiresAuth = available && hasTokens,
                // If no Windows Hello or no stored tokens, skip auth
                isAuthenticated = !available || !hasTokens,
            )
        }
    }

    /**
     * Initiates a Windows Hello authentication prompt.
     *
     * Displays the system Windows Hello dialog (fingerprint, face, or PIN).
     * On success, sets [AuthUiState.isAuthenticated] to true. On failure
     * or cancellation, sets an error message.
     *
     * @param reason Human-readable reason shown in the Windows Hello dialog.
     */
    fun authenticate(reason: String = "Finance needs to verify your identity") {
        if (_uiState.value.isAuthenticating) return

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isAuthenticating = true,
                authError = null,
            )

            val success = windowsHelloManager.authenticate(reason)

            _uiState.value = _uiState.value.copy(
                isAuthenticated = success,
                isAuthenticating = false,
                authError = if (success) null else "Authentication failed. Please try again.",
            )
        }
    }

    /**
     * Locks the application, requiring re-authentication.
     *
     * Called by the auto-lock timer or manually from the Settings screen.
     */
    fun lockApp() {
        _uiState.value = _uiState.value.copy(
            isAuthenticated = false,
            authError = null,
        )
    }

    /**
     * Marks the app shell as unlocked after a successful non-Windows-Hello auth flow.
     */
    fun markAuthenticated() {
        _uiState.value = _uiState.value.copy(
            isAuthenticated = true,
            authError = null,
        )
    }

    /**
     * Enters local-only mode only when no cloud credential is present to protect.
     */
    fun continueWithoutCloudAuth() {
        if (secureTokenStorage.hasToken(SecureTokenStorage.KEY_ACCESS_TOKEN)) return
        _uiState.value = _uiState.value.copy(
            isAuthenticated = true,
            requiresAuth = false,
            authError = null,
        )
    }

    /**
     * Clears all stored credentials and resets authentication state.
     *
     * Used during sign-out to ensure no sensitive data remains on disk.
     */
    fun signOut() {
        viewModelScope.launch {
            secureTokenStorage.clearAllTokens()
            _uiState.value = AuthUiState(
                isWindowsHelloAvailable = _uiState.value.isWindowsHelloAvailable,
                requiresAuth = false,
                isAuthenticated = false,
            )
        }
    }
}
