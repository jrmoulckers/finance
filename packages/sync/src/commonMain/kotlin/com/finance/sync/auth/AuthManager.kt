// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

import kotlinx.coroutines.flow.StateFlow

/**
 * Core authentication manager interface (#68, #70).
 *
 * Platform-specific implementations coordinate with Supabase Auth to
 * handle sign-in, sign-out, and token refresh. The current session is
 * exposed as a [StateFlow] so UI layers can reactively observe auth state.
 *
 * Implementations must:
 * - Persist tokens via [TokenManager] in platform-secure storage
 * - Automatically refresh tokens before expiry (< 2 min remaining)
 * - Clear all tokens and cached state on [signOut]
 * - Never log or expose raw tokens in error messages
 *
 * Usage:
 * ```kotlin
 * val authManager: AuthManager = // platform DI
 *
 * // Observe auth state
 * authManager.currentSession.collect { session ->
 *     if (session != null) showHome() else showLogin()
 * }
 *
 * // Sign in
 * val result = authManager.signIn(AuthCredentials.EmailPassword(email, password))
 * result.onSuccess { session -> /* signed in */ }
 * result.onFailure { error -> /* handle error */ }
 * ```
 */
interface AuthManager {

    /**
     * Observable stream of the current authentication session.
     *
     * Emits `null` when the user is signed out or tokens have been
     * irrecoverably invalidated. Emits a new [AuthSession] on
     * successful sign-in or token refresh.
     */
    val currentSession: StateFlow<AuthSession?>

    /**
     * Authenticate with the given [credentials].
     *
     * Supports email/password, OAuth + PKCE, and passkey flows.
     * On success, stores tokens via [TokenManager] and updates
     * [currentSession].
     *
     * @param credentials The authentication credentials.
     * @return [Result.success] with the new [AuthSession], or
     *         [Result.failure] with the error.
     */
    suspend fun signIn(credentials: AuthCredentials): Result<AuthSession>

    /**
     * Sign out the current user.
     *
     * Invalidates the refresh token server-side, clears local token
     * storage, and sets [currentSession] to `null`.
     */
    suspend fun signOut()

    /**
     * Manually refresh the current access token.
     *
     * This is typically called automatically by [TokenManager]'s
     * auto-refresh logic, but can be invoked manually if needed
     * (e.g. after a 401 response).
     *
     * @return [Result.success] with the refreshed [AuthSession], or
     *         [Result.failure] if the refresh token is invalid.
     */
    suspend fun refreshToken(): Result<AuthSession>
}
