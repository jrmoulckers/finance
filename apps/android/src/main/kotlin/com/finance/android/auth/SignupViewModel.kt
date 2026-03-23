// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * UI state for the sign-up screen.
 *
 * Field-level validation errors are shown inline under each input.
 * [apiError] holds server-side errors (duplicate email, network
 * failure, etc.) displayed as a top-level banner.
 */
data class SignupUiState(
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val emailError: String? = null,
    val passwordError: String? = null,
    val confirmPasswordError: String? = null,
    val apiError: String? = null,
    val isLoading: Boolean = false,
    val isSuccess: Boolean = false,
    val passwordVisible: Boolean = false,
)

/**
 * ViewModel for the sign-up screen.
 *
 * Handles local validation, delegates sign-up to [SupabaseAuthManager],
 * and maps errors to user-facing messages. On success, sets
 * [SignupUiState.isSuccess] so the composable navigates away.
 *
 * **Security:** Passwords and emails are NEVER logged.
 *
 * @property authManager The [SupabaseAuthManager] for sign-up API calls.
 */
class SignupViewModel(
    private val authManager: SupabaseAuthManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SignupUiState())

    /** Observable sign-up UI state. */
    val uiState: StateFlow<SignupUiState> = _uiState.asStateFlow()

    // ── Field updates ───────────────────────────────────────────────────

    /** Update the email field, clearing its validation error. */
    fun onEmailChanged(email: String) {
        _uiState.update { it.copy(email = email, emailError = null, apiError = null) }
    }

    /** Update the password field, clearing its validation error. */
    fun onPasswordChanged(password: String) {
        _uiState.update { it.copy(password = password, passwordError = null, apiError = null) }
    }

    /** Update the confirm-password field, clearing its validation error. */
    fun onConfirmPasswordChanged(confirmPassword: String) {
        _uiState.update {
            it.copy(confirmPassword = confirmPassword, confirmPasswordError = null, apiError = null)
        }
    }

    /** Toggle password visibility (show / hide). */
    fun togglePasswordVisibility() {
        _uiState.update { it.copy(passwordVisible = !it.passwordVisible) }
    }

    /** Dismiss the API error banner. */
    fun clearApiError() {
        _uiState.update { it.copy(apiError = null) }
    }

    // ── Submit ───────────────────────────────────────────────────────────

    /**
     * Validate inputs and submit the sign-up request.
     *
     * Runs local validation first; if all checks pass, calls
     * [SupabaseAuthManager.signUp]. Errors are mapped to
     * user-friendly messages.
     */
    fun onSubmit() {
        val state = _uiState.value
        if (state.isLoading) return

        // ── Local validation ────────────────────────────────────────────
        val emailError = validateEmail(state.email)
        val passwordError = validatePassword(state.password)
        val confirmPasswordError = validateConfirmPassword(state.password, state.confirmPassword)

        if (emailError != null || passwordError != null || confirmPasswordError != null) {
            _uiState.update {
                it.copy(
                    emailError = emailError,
                    passwordError = passwordError,
                    confirmPasswordError = confirmPasswordError,
                )
            }
            return
        }

        // ── API call ────────────────────────────────────────────────────
        Timber.d("Sign-up validation passed — submitting request")
        _uiState.update { it.copy(isLoading = true, apiError = null) }

        viewModelScope.launch {
            val result = authManager.signUp(
                email = state.email.trim(),
                password = state.password,
            )

            result.onSuccess {
                Timber.i("Sign-up completed successfully")
                _uiState.update { it.copy(isLoading = false, isSuccess = true) }
            }.onFailure { error ->
                Timber.e(error, "Sign-up API call failed")
                val message = when (error) {
                    is SupabaseAuthManager.EmailAlreadyExistsException ->
                        "An account with this email already exists"
                    is java.net.UnknownHostException, is java.net.SocketTimeoutException ->
                        "Network error. Please check your connection and try again."
                    else ->
                        error.message ?: "Sign-up failed. Please try again."
                }
                _uiState.update { it.copy(isLoading = false, apiError = message) }
            }
        }
    }

    // ── Validation helpers ──────────────────────────────────────────────

    companion object {
        /** Minimal email format check: non-blank, contains `@` and `.`. */
        internal fun validateEmail(email: String): String? {
            val trimmed = email.trim()
            return when {
                trimmed.isBlank() -> "Email is required"
                !trimmed.contains("@") || !trimmed.contains(".") ->
                    "Enter a valid email address"
                else -> null
            }
        }

        /** Password must be ≥ 8 chars, have at least 1 uppercase and 1 digit. */
        internal fun validatePassword(password: String): String? {
            return when {
                password.length < 8 ->
                    "Password must be at least 8 characters"
                !password.any { it.isUpperCase() } ->
                    "Password must contain at least one uppercase letter"
                !password.any { it.isDigit() } ->
                    "Password must contain at least one digit"
                else -> null
            }
        }

        /** Confirm password must match the original password. */
        internal fun validateConfirmPassword(password: String, confirmPassword: String): String? {
            return when {
                confirmPassword.isBlank() -> "Please confirm your password"
                confirmPassword != password -> "Passwords do not match"
                else -> null
            }
        }
    }
}
