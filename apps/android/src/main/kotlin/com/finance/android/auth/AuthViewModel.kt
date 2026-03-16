// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.auth

import android.app.Activity
import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.sync.auth.AuthCredentials
import com.finance.sync.auth.AuthManager
import com.finance.sync.auth.OAuthProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * Authentication state exposed to the UI layer.
 *
 * Composables observe [AuthViewModel.authState] to decide whether
 * to render the login screen or the main application content.
 */
sealed interface AuthState {
    /** Initial state while restoring a persisted session. */
    data object Loading : AuthState

    /** User is authenticated. */
    data class Authenticated(val userId: String) : AuthState

    /** No active session — show the login screen. */
    data object Unauthenticated : AuthState

    /** An error occurred during authentication. */
    data class Error(val message: String) : AuthState
}

/**
 * ViewModel that bridges the shared [AuthManager] with Android UI.
 *
 * Observes [AuthManager.currentSession] and maps it to [AuthState].
 * Provides actions for OAuth (Google via Custom Tabs), passkey
 * (Android Credential Manager), and sign-out flows.
 *
 * **Security:** Tokens and credentials are NEVER logged. Only
 * non-sensitive metadata (provider name, error class) appears in logs.
 *
 * @property authManager Android [SupabaseAuthManager] for auth operations.
 */
class AuthViewModel(
    private val authManager: SupabaseAuthManager,
) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.Loading)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    /** Convenience accessor for gating UI. */
    val isAuthenticated: Boolean
        get() = _authState.value is AuthState.Authenticated

    init {
        // Map the shared AuthManager's session flow to AuthState.
        viewModelScope.launch {
            authManager.currentSession.collect { session ->
                _authState.value = if (session != null) {
                    AuthState.Authenticated(session.userId)
                } else {
                    AuthState.Unauthenticated
                }
            }
        }
    }

    // ── Google OAuth (Custom Tabs + PKCE) ───────────────────────────────

    /**
     * Launch the Google OAuth flow via Custom Tabs.
     *
     * Builds a PKCE-protected authorization URL and opens it in
     * Chrome Custom Tabs. The redirect back to the app is handled
     * by [handleOAuthCallback].
     *
     * @param context Android context for launching Custom Tabs.
     */
    fun signInWithGoogle(context: Context) {
        Timber.d("Starting Google OAuth flow")
        try {
            val url = authManager.buildOAuthUrl("google")
            val customTabsIntent = CustomTabsIntent.Builder()
                .setShowTitle(true)
                .build()
            customTabsIntent.launchUrl(context, Uri.parse(url))
        } catch (e: Exception) {
            Timber.e(e, "Failed to launch Google sign-in")
            _authState.value = AuthState.Error(
                "Could not open sign-in page. Please try again.",
            )
        }
    }

    /**
     * Handle the OAuth redirect callback from Custom Tabs.
     *
     * Extracts the authorization code from the deep link, retrieves
     * the stored PKCE code verifier, and exchanges them for tokens
     * via the Supabase Auth API.
     *
     * @param code The authorization code from the OAuth redirect URI.
     */
    fun handleOAuthCallback(code: String) {
        Timber.d("Processing OAuth callback")
        viewModelScope.launch {
            val verifier = authManager.consumePendingCodeVerifier()
            if (verifier == null) {
                Timber.w("No pending code verifier — OAuth flow may have been interrupted")
                _authState.value = AuthState.Error(
                    "Sign-in was interrupted. Please try again.",
                )
                return@launch
            }

            _authState.value = AuthState.Loading

            val result = authManager.signIn(
                AuthCredentials.OAuth(
                    provider = OAuthProvider.GOOGLE,
                    authCode = code,
                    codeVerifier = verifier,
                ),
            )

            result.onFailure { error ->
                Timber.e(error, "OAuth code exchange failed")
                _authState.value = AuthState.Error(
                    error.message ?: "Sign-in failed. Please try again.",
                )
            }
            // Success is handled by the currentSession collector in init.
        }
    }

    // ── Passkey (Android Credential Manager) ────────────────────────────

    /**
     * Launch the passkey sign-in flow via Android Credential Manager.
     *
     * 1. Requests a WebAuthn challenge from the server.
     * 2. Presents the Credential Manager bottom sheet to the user.
     * 3. Sends the signed assertion to the server for verification.
     *
     * Requires an [Activity] context for the Credential Manager UI.
     *
     * @param activity The current Activity for Credential Manager interaction.
     */
    fun signInWithPasskey(activity: Activity) {
        Timber.d("Starting passkey sign-in flow")
        viewModelScope.launch {
            _authState.value = AuthState.Loading

            try {
                // Step 1: Get WebAuthn challenge from server.
                val challengeJson = authManager.requestPasskeyChallenge().getOrThrow()

                // Step 2: Present Credential Manager to the user.
                val credentialManager = CredentialManager.create(activity)
                val request = GetCredentialRequest(
                    listOf(GetPublicKeyCredentialOption(challengeJson)),
                )
                val credentialResponse = credentialManager.getCredential(
                    activity,
                    request,
                )

                // Step 3: Extract the public key credential.
                val credential = credentialResponse.credential
                if (credential !is PublicKeyCredential) {
                    throw IllegalStateException("Unexpected credential type received")
                }

                // Step 4: Exchange assertion with server for tokens.
                val result = authManager.signIn(
                    AuthCredentials.Passkey(
                        credentialId = credential.authenticationResponseJson,
                        assertion = credential.authenticationResponseJson,
                    ),
                )

                result.onFailure { error ->
                    Timber.e(error, "Passkey verification failed")
                    _authState.value = AuthState.Error(
                        error.message ?: "Passkey sign-in failed. Please try again.",
                    )
                }
                // Success handled by currentSession collector.
            } catch (e: GetCredentialCancellationException) {
                Timber.d("Passkey sign-in cancelled by user")
                _authState.value = AuthState.Unauthenticated
            } catch (e: NoCredentialException) {
                Timber.w("No passkeys available on this device")
                _authState.value = AuthState.Error(
                    "No passkeys found. Sign in with Google or set up a passkey first.",
                )
            } catch (e: Exception) {
                Timber.e(e, "Passkey sign-in failed")
                _authState.value = AuthState.Error(
                    "Passkey sign-in failed. Please try again.",
                )
            }
        }
    }

    // ── Sign out ────────────────────────────────────────────────────────

    /**
     * Sign out the current user.
     *
     * Clears both server-side and local tokens. The [authState] will
     * transition to [AuthState.Unauthenticated], causing the UI to
     * show the login screen.
     */
    fun signOut() {
        viewModelScope.launch {
            authManager.signOut()
        }
    }
}
