// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository

import com.finance.sync.auth.AuthSession
import kotlinx.coroutines.flow.StateFlow

/**
 * Repository interface for authentication operations.
 *
 * Abstracts the Supabase Auth API for desktop use, coordinating
 * email/password authentication with DPAPI-backed token storage.
 */
data class AuthAccount(
    val userId: String,
    val email: String?,
    val provider: String?,
)

interface AuthRepository {

    /** Observable authentication session — `null` when signed out. */
    val currentSession: StateFlow<AuthSession?>

    /** Observable signed-in account metadata — `null` when signed out. */
    val currentAccount: StateFlow<AuthAccount?>

    /** Observable authentication state. */
    val isAuthenticated: StateFlow<Boolean>

    /**
     * Sign in with email and password.
     *
     * @return [AuthSession] on success.
     * @throws AuthException on failure.
     */
    suspend fun signInWithEmail(email: String, password: String): Result<AuthSession>

    /**
     * Create a new account with email and password.
     *
     * @return [AuthSession] on success.
     * @throws AuthException on failure.
     */
    suspend fun signUpWithEmail(email: String, password: String): Result<AuthSession>

    /**
     * Sign out the current user, clearing all tokens.
     */
    suspend fun signOut()

    /**
     * Refresh the current access token.
     */
    suspend fun refreshToken(): Result<AuthSession>

    /**
     * Delete the current user's account and all associated data.
     */
    suspend fun deleteAccount(): Result<Unit>

    /**
     * Attempt to restore a previous session from stored tokens.
     */
    suspend fun restoreSession(): Result<AuthSession>
}

class AuthException(message: String, cause: Throwable? = null) : Exception(message, cause)
