// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.desktop.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * UI state for the Login/Signup screen.
 */
data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isSignUpMode: Boolean = false,
    val isLoading: Boolean = false,
    val isAuthenticated: Boolean = false,
    val error: String? = null,
)

/**
 * ViewModel for the Login/Signup screen.
 *
 * Handles email/password authentication via [AuthRepository] (Supabase Auth).
 * Validates input, manages loading states, and reports errors.
 */
class LoginViewModel(
    private val authRepository: AuthRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    init {
        // Try to restore a previous session on startup
        restoreSession()
    }

    fun setEmail(email: String) {
        _uiState.value = _uiState.value.copy(email = email, error = null)
    }

    fun setPassword(password: String) {
        _uiState.value = _uiState.value.copy(password = password, error = null)
    }

    fun setConfirmPassword(confirmPassword: String) {
        _uiState.value = _uiState.value.copy(confirmPassword = confirmPassword, error = null)
    }

    fun toggleMode() {
        _uiState.value = _uiState.value.copy(
            isSignUpMode = !_uiState.value.isSignUpMode,
            error = null,
            confirmPassword = "",
        )
    }

    fun resetForSignIn() {
        _uiState.value = LoginUiState()
    }

    @Suppress("ReturnCount") // Multi-step auth validation
    fun signIn() {
        val state = _uiState.value
        if (state.isLoading) return

        val emailError = validateEmail(state.email)
        if (emailError != null) {
            _uiState.value = state.copy(error = emailError)
            return
        }
        if (state.password.isBlank()) {
            _uiState.value = state.copy(error = "Password is required")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            authRepository.signInWithEmail(state.email.trim(), state.password)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        isAuthenticated = true,
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = e.message ?: "Sign-in failed",
                    )
                }
        }
    }

    @Suppress("ReturnCount") // Multi-step auth validation
    fun signUp() {
        val state = _uiState.value
        if (state.isLoading) return

        val emailError = validateEmail(state.email)
        if (emailError != null) {
            _uiState.value = state.copy(error = emailError)
            return
        }
        if (state.password.length < 8) {
            _uiState.value = state.copy(error = "Password must be at least 8 characters")
            return
        }
        if (state.password != state.confirmPassword) {
            _uiState.value = state.copy(error = "Passwords do not match")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            authRepository.signUpWithEmail(state.email.trim(), state.password)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        isAuthenticated = true,
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = e.message ?: "Sign-up failed",
                    )
                }
        }
    }

    private fun restoreSession() {
        viewModelScope.launch {
            authRepository.restoreSession()
                .onSuccess {
                    _uiState.value = _uiState.value.copy(isAuthenticated = true)
                }
        }
    }

    @Suppress("ReturnCount") // Multi-step auth validation
    private fun validateEmail(email: String): String? {
        if (email.isBlank()) return "Email is required"
        if (!email.trim().contains("@")) return "Please enter a valid email address"
        return null
    }
}
