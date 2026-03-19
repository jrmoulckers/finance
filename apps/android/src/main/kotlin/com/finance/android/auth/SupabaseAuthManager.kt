// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.auth

import com.finance.sync.auth.AuthCredentials
import com.finance.sync.auth.AuthManager
import com.finance.sync.auth.AuthSession
import com.finance.sync.auth.PKCEHelper
import com.finance.sync.auth.TokenManager
import io.ktor.client.HttpClient
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import timber.log.Timber

/**
 * Android implementation of [AuthManager] backed by Supabase Auth.
 *
 * Handles OAuth 2.0 + PKCE (Google via Custom Tabs), passkey (via Android
 * Credential Manager), and email/password sign-in flows. Tokens are
 * persisted via [TokenManager] in platform-secure storage.
 *
 * **Security notes:**
 * - Tokens and credentials are NEVER logged.
 * - OAuth uses PKCE (RFC 7636) to prevent authorization code interception.
 * - The PKCE code verifier is held in memory; if the process dies during
 *   the OAuth redirect the user must retry.
 *
 * @property tokenManager  Secure token storage and lifecycle management.
 * @property supabaseUrl   Base URL of the Supabase project (from BuildConfig).
 * @property httpClient    Ktor [HttpClient] for Supabase Auth API calls.
 */
class SupabaseAuthManager(
    private val tokenManager: TokenManager,
    private val supabaseUrl: String,
    private val httpClient: HttpClient,
) : AuthManager {

    private val _currentSession = MutableStateFlow<AuthSession?>(null)
    override val currentSession: StateFlow<AuthSession?> = _currentSession.asStateFlow()

    private val _isAuthenticated = MutableStateFlow(false)
    override val isAuthenticated: StateFlow<Boolean> = _isAuthenticated.asStateFlow()

    /**
     * In-flight PKCE code verifier for an active OAuth redirect.
     *
     * Stored in memory only — if the process is killed during the OAuth
     * redirect, the verifier is lost and the user must restart sign-in.
     * This is acceptable per PKCE security guidelines; the verifier is
     * single-use and short-lived.
     */
    @Volatile
    private var pendingCodeVerifier: String? = null

    private val json = Json { ignoreUnknownKeys = true }

    init {
        // Restore any previously persisted session on startup.
        val stored = tokenManager.retrieveTokens()
        _currentSession.value = stored
        _isAuthenticated.value = stored != null
        if (stored != null) {
            Timber.i("Restored existing auth session for user")
        }
    }

    // ── AuthManager interface ───────────────────────────────────────────

    override suspend fun signIn(credentials: AuthCredentials): Result<AuthSession> {
        Timber.d("Sign-in requested: %s", credentials::class.simpleName)
        return when (credentials) {
            is AuthCredentials.EmailPassword -> signInWithEmail(credentials)
            is AuthCredentials.OAuth -> exchangeOAuthCode(credentials)
            is AuthCredentials.Passkey -> signInWithPasskey(credentials)
            is AuthCredentials.RefreshToken -> refreshWithToken(credentials)
        }
    }

    override suspend fun signOut() {
        Timber.i("Signing out")
        try {
            val session = _currentSession.value
            if (session != null) {
                httpClient.post("$supabaseUrl/auth/v1/logout") {
                    header("Authorization", "Bearer ${session.accessToken}")
                    header("apikey", supabaseUrl.extractSupabaseApiKey())
                }
            }
        } catch (e: Exception) {
            Timber.w(e, "Server-side token revocation failed; clearing local session")
        } finally {
            tokenManager.clearTokens()
            pendingCodeVerifier = null
            _currentSession.value = null
            _isAuthenticated.value = false
            Timber.i("Local session cleared")
        }
    }

    override suspend fun refreshToken(): Result<AuthSession> {
        val session = _currentSession.value
            ?: return Result.failure(IllegalStateException("No active session to refresh"))

        Timber.d("Refreshing access token")
        return runCatching {
            val response = httpClient.post("$supabaseUrl/auth/v1/token") {
                parameter("grant_type", "refresh_token")
                contentType(ContentType.Application.Json)
                setBody("""{"refresh_token":"${session.refreshToken}"}""")
            }
            if (!response.status.isSuccess()) {
                throw IllegalStateException(
                    "Token refresh failed with status ${response.status.value}",
                )
            }
            parseAuthResponse(response.bodyAsText())
        }.onSuccess { newSession ->
            tokenManager.storeTokens(newSession)
            _currentSession.value = newSession
            _isAuthenticated.value = true
            Timber.i("Access token refreshed successfully")
        }.onFailure { error ->
            Timber.e(error, "Token refresh failed — clearing session")
            tokenManager.clearTokens()
            _currentSession.value = null
            _isAuthenticated.value = false
        }
    }

    override suspend fun deleteAccount(): Result<Unit> {
        Timber.i("Deleting account")
        val session = _currentSession.value
            ?: return Result.failure(IllegalStateException("No active session — cannot delete account"))

        return runCatching {
            val response = httpClient.post("$supabaseUrl/auth/v1/admin/users/${session.userId}") {
                header("Authorization", "Bearer ${session.accessToken}")
                header("apikey", supabaseUrl.extractSupabaseApiKey())
                contentType(ContentType.Application.Json)
                setBody("""{"should_soft_delete":false}""")
            }
            if (!response.status.isSuccess()) {
                throw IllegalStateException(
                    "Account deletion failed with status ${response.status.value}",
                )
            }
        }.onSuccess {
            tokenManager.clearTokens()
            pendingCodeVerifier = null
            _currentSession.value = null
            _isAuthenticated.value = false
            Timber.i("Account deleted and local session cleared")
        }.onFailure { error ->
            Timber.e(error, "Account deletion failed")
        }
    }

    // ── OAuth helpers (used by AuthViewModel) ───────────────────────────

    /**
     * Build the Supabase OAuth authorization URL with PKCE protection.
     *
     * Generates a fresh code verifier, derives the challenge, and returns
     * the fully-formed URL to open in Custom Tabs. The verifier is stored
     * internally and consumed via [consumePendingCodeVerifier].
     *
     * @param provider OAuth provider identifier (e.g. `"google"`, `"apple"`).
     * @return The authorization URL to open in the browser.
     */
    fun buildOAuthUrl(provider: String): String {
        val verifier = PKCEHelper.generateCodeVerifier()
        val challenge = PKCEHelper.generateCodeChallenge(verifier)
        pendingCodeVerifier = verifier

        val redirectUri = "https://finance.app/auth/callback"
        return "$supabaseUrl/auth/v1/authorize" +
            "?provider=$provider" +
            "&redirect_to=$redirectUri" +
            "&code_challenge=$challenge" +
            "&code_challenge_method=S256"
    }

    /**
     * Retrieve and clear the pending PKCE code verifier.
     *
     * Returns `null` if no OAuth flow is in progress or the verifier
     * was already consumed.
     */
    fun consumePendingCodeVerifier(): String? {
        return pendingCodeVerifier?.also { pendingCodeVerifier = null }
    }

    /**
     * Request a WebAuthn passkey challenge from Supabase.
     *
     * @return The WebAuthn request options JSON to pass to Android
     *         Credential Manager's [GetPublicKeyCredentialOption].
     */
    suspend fun requestPasskeyChallenge(): Result<String> {
        Timber.d("Requesting passkey challenge from server")
        return runCatching {
            val response = httpClient.post("$supabaseUrl/auth/v1/passkey/challenge") {
                contentType(ContentType.Application.Json)
                setBody("{}")
            }
            if (!response.status.isSuccess()) {
                throw IllegalStateException(
                    "Passkey challenge request failed: ${response.status.value}",
                )
            }
            response.bodyAsText()
        }
    }

    // ── Private sign-in implementations ─────────────────────────────────

    private suspend fun signInWithEmail(
        credentials: AuthCredentials.EmailPassword,
    ): Result<AuthSession> {
        return runCatching {
            val response = httpClient.post("$supabaseUrl/auth/v1/token") {
                parameter("grant_type", "password")
                contentType(ContentType.Application.Json)
                setBody(
                    """{"email":"${credentials.email}","password":"${credentials.password}"}""",
                )
            }
            if (!response.status.isSuccess()) {
                throw IllegalStateException(
                    "Email sign-in failed with status ${response.status.value}",
                )
            }
            parseAuthResponse(response.bodyAsText())
        }.onSuccess { session ->
            tokenManager.storeTokens(session)
            _currentSession.value = session
            _isAuthenticated.value = true
            Timber.i("Email sign-in successful")
        }.onFailure { error ->
            Timber.e(error, "Email sign-in failed")
        }
    }

    private suspend fun exchangeOAuthCode(
        credentials: AuthCredentials.OAuth,
    ): Result<AuthSession> {
        return runCatching {
            val response = httpClient.post("$supabaseUrl/auth/v1/token") {
                parameter("grant_type", "pkce")
                contentType(ContentType.Application.Json)
                setBody(
                    """{"auth_code":"${credentials.authCode}","code_verifier":"${credentials.codeVerifier}"}""",
                )
            }
            if (!response.status.isSuccess()) {
                throw IllegalStateException(
                    "OAuth code exchange failed with status ${response.status.value}",
                )
            }
            parseAuthResponse(response.bodyAsText())
        }.onSuccess { session ->
            tokenManager.storeTokens(session)
            _currentSession.value = session
            _isAuthenticated.value = true
            Timber.i("OAuth sign-in successful (provider=%s)", credentials.provider)
        }.onFailure { error ->
            Timber.e(error, "OAuth code exchange failed")
        }
    }

    private suspend fun signInWithPasskey(
        credentials: AuthCredentials.Passkey,
    ): Result<AuthSession> {
        return runCatching {
            val response = httpClient.post("$supabaseUrl/auth/v1/passkey/verify") {
                contentType(ContentType.Application.Json)
                setBody(
                    """{"credential_id":"${credentials.credentialId}","assertion":"${credentials.assertion}"}""",
                )
            }
            if (!response.status.isSuccess()) {
                throw IllegalStateException(
                    "Passkey sign-in failed with status ${response.status.value}",
                )
            }
            parseAuthResponse(response.bodyAsText())
        }.onSuccess { session ->
            tokenManager.storeTokens(session)
            _currentSession.value = session
            _isAuthenticated.value = true
            Timber.i("Passkey sign-in successful")
        }.onFailure { error ->
            Timber.e(error, "Passkey sign-in failed")
        }
    }

    private suspend fun refreshWithToken(
        credentials: AuthCredentials.RefreshToken,
    ): Result<AuthSession> {
        Timber.d("Refreshing via RefreshToken credential")
        return runCatching {
            val response = httpClient.post("$supabaseUrl/auth/v1/token") {
                parameter("grant_type", "refresh_token")
                contentType(ContentType.Application.Json)
                setBody("""{"refresh_token":"${credentials.token}"}""")
            }
            if (!response.status.isSuccess()) {
                throw IllegalStateException(
                    "Refresh-token sign-in failed with status ${response.status.value}",
                )
            }
            parseAuthResponse(response.bodyAsText())
        }.onSuccess { session ->
            tokenManager.storeTokens(session)
            _currentSession.value = session
            _isAuthenticated.value = true
            Timber.i("Refresh-token sign-in successful")
        }.onFailure { error ->
            Timber.e(error, "Refresh-token sign-in failed")
        }
    }

    // ── JSON parsing ────────────────────────────────────────────────────

    /**
     * Parse a Supabase Auth token response into an [AuthSession].
     *
     * Expected shape:
     * ```json
     * {
     *   "access_token": "...",
     *   "refresh_token": "...",
     *   "expires_in": 3600,
     *   "expires_at": 1700000000,
     *   "user": { "id": "uuid" }
     * }
     * ```
     */
    private fun parseAuthResponse(body: String): AuthSession {
        val root = json.parseToJsonElement(body).jsonObject

        val accessToken = root["access_token"]?.jsonPrimitive?.content
            ?: throw IllegalStateException("Missing access_token in auth response")
        val refreshToken = root["refresh_token"]?.jsonPrimitive?.content
            ?: throw IllegalStateException("Missing refresh_token in auth response")

        // Prefer expires_at (epoch seconds); fall back to expires_in offset.
        val expiresAt = root["expires_at"]?.jsonPrimitive?.long?.let {
            Instant.fromEpochSeconds(it)
        } ?: run {
            val expiresIn = root["expires_in"]?.jsonPrimitive?.long ?: 3600L
            Instant.fromEpochSeconds(Clock.System.now().epochSeconds + expiresIn)
        }

        val userId = root["user"]?.jsonObject?.get("id")?.jsonPrimitive?.content
            ?: throw IllegalStateException("Missing user.id in auth response")

        return AuthSession(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAt = expiresAt,
            userId = userId,
        )
    }

    companion object {
        /**
         * Extract the Supabase anon key from the project URL for API calls.
         *
         * In production the API key should be provided separately via
         * BuildConfig. This placeholder returns an empty string to avoid
         * blocking development.
         */
        private fun String.extractSupabaseApiKey(): String = ""
    }
}
