// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository.impl

import com.finance.desktop.data.repository.AuthAccount
import com.finance.desktop.data.repository.AuthException
import com.finance.desktop.data.repository.AuthRepository
import com.finance.desktop.security.SecureTokenStorage
import com.finance.sync.auth.AuthSession
import com.finance.sync.auth.TokenManager
import com.finance.sync.auth.TokenStorage
import io.ktor.client.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.serialization.json.*
import java.util.Base64
import java.util.logging.Level
import java.util.logging.Logger

/**
 * Desktop implementation of [AuthRepository] using Supabase Auth REST API.
 *
 * Communicates with Supabase Auth via Ktor HTTP client and stores tokens
 * in DPAPI-encrypted storage via [SecureTokenStorage]. Tokens are also
 * persisted through the KMP [TokenManager] for cross-package compatibility.
 *
 * @param httpClient Ktor HTTP client configured with OkHttp engine.
 * @param supabaseUrl Base URL for the Supabase project (e.g., "https://xxx.supabase.co").
 * @param supabaseAnonKey Supabase anonymous/public API key.
 * @param secureTokenStorage DPAPI-encrypted token persistence.
 * @param tokenManager KMP token manager for session lifecycle.
 */
class DesktopAuthRepository(
    private val httpClient: HttpClient,
    private val supabaseUrl: String,
    private val supabaseAnonKey: String,
    private val secureTokenStorage: SecureTokenStorage,
    private val tokenManager: TokenManager,
) : AuthRepository {

    companion object {
        private val logger: Logger = Logger.getLogger(DesktopAuthRepository::class.java.name)
        private val json = Json { ignoreUnknownKeys = true }
    }

    private data class ParsedAuthResponse(
        val session: AuthSession,
        val account: AuthAccount,
    )

    private val _currentSession = MutableStateFlow<AuthSession?>(null)
    override val currentSession: StateFlow<AuthSession?> = _currentSession.asStateFlow()

    private val _currentAccount = MutableStateFlow<AuthAccount?>(null)
    override val currentAccount: StateFlow<AuthAccount?> = _currentAccount.asStateFlow()

    private val _isAuthenticated = MutableStateFlow(false)
    override val isAuthenticated: StateFlow<Boolean> = _isAuthenticated.asStateFlow()

    override suspend fun signInWithEmail(email: String, password: String): Result<AuthSession> {
        @Suppress("TooGenericExceptionCaught") // Auth error boundary — catch-all for security
        return try {
            val response = httpClient.post("$supabaseUrl/auth/v1/token?grant_type=password") {
                header("apikey", supabaseAnonKey)
                contentType(ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("email", email)
                    put("password", password)
                }.toString())
            }

            if (!response.status.isSuccess()) {
                val body = response.bodyAsText()
                return Result.failure(AuthException("Sign-in failed (${response.status}): $body"))
            }

            val parsed = parseAuthResponse(response.bodyAsText())
            storeSession(parsed.session, parsed.account)
            Result.success(parsed.session)
        } catch (e: Exception) {
            logger.log(Level.SEVERE, "Sign-in failed", e)
            Result.failure(AuthException("Sign-in failed: ${e.message}", e))
        }
    }

    override suspend fun signUpWithEmail(email: String, password: String): Result<AuthSession> {
        @Suppress("TooGenericExceptionCaught") // Auth error boundary — catch-all for security
        return try {
            val response = httpClient.post("$supabaseUrl/auth/v1/signup") {
                header("apikey", supabaseAnonKey)
                contentType(ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("email", email)
                    put("password", password)
                }.toString())
            }

            if (!response.status.isSuccess()) {
                val body = response.bodyAsText()
                return Result.failure(AuthException("Sign-up failed (${response.status}): $body"))
            }

            val parsed = parseAuthResponse(response.bodyAsText())
            storeSession(parsed.session, parsed.account)
            Result.success(parsed.session)
        } catch (e: Exception) {
            logger.log(Level.SEVERE, "Sign-up failed", e)
            Result.failure(AuthException("Sign-up failed: ${e.message}", e))
        }
    }

    override suspend fun signOut() {
        @Suppress("TooGenericExceptionCaught") // Auth error boundary — catch-all for security
        try {
            val session = _currentSession.value
            if (session != null) {
                httpClient.post("$supabaseUrl/auth/v1/logout") {
                    header("apikey", supabaseAnonKey)
                    header("Authorization", "Bearer ${session.accessToken}")
                }
            }
        } catch (e: Exception) {
            logger.log(Level.WARNING, "Server-side sign-out failed (proceeding with local cleanup)", e)
        } finally {
            clearSession()
        }
    }

    @Suppress("ReturnCount") // Auth flow with multiple validation steps
    override suspend fun refreshToken(): Result<AuthSession> {
        val currentRefreshToken = _currentSession.value?.refreshToken
            ?: secureTokenStorage.loadToken(SecureTokenStorage.KEY_REFRESH_TOKEN)
            ?: return Result.failure(AuthException("No refresh token available"))

        @Suppress("TooGenericExceptionCaught") // Auth error boundary — catch-all for security
        return try {
            val response = httpClient.post("$supabaseUrl/auth/v1/token?grant_type=refresh_token") {
                header("apikey", supabaseAnonKey)
                contentType(ContentType.Application.Json)
                setBody(buildJsonObject {
                    put("refresh_token", currentRefreshToken)
                }.toString())
            }

            if (!response.status.isSuccess()) {
                clearSession()
                return Result.failure(AuthException("Token refresh failed (${response.status})"))
            }

            val parsed = parseAuthResponse(response.bodyAsText())
            storeSession(parsed.session, parsed.account)
            Result.success(parsed.session)
        } catch (e: Exception) {
            logger.log(Level.SEVERE, "Token refresh failed", e)
            Result.failure(AuthException("Token refresh failed: ${e.message}", e))
        }
    }

    @Suppress("ReturnCount") // Auth flow with multiple validation steps
    override suspend fun deleteAccount(): Result<Unit> {
        val session = _currentSession.value
            ?: return Result.failure(AuthException("Not authenticated"))

        @Suppress("TooGenericExceptionCaught") // Auth error boundary — catch-all for security
        return try {
            val response = httpClient.delete("$supabaseUrl/auth/v1/user") {
                header("apikey", supabaseAnonKey)
                header("Authorization", "Bearer ${session.accessToken}")
            }

            if (!response.status.isSuccess()) {
                return Result.failure(AuthException("Account deletion failed (${response.status})"))
            }

            clearSession()
            Result.success(Unit)
        } catch (e: Exception) {
            logger.log(Level.SEVERE, "Account deletion failed", e)
            Result.failure(AuthException("Account deletion failed: ${e.message}", e))
        }
    }

    @Suppress("ReturnCount") // Auth flow with multiple validation steps
    override suspend fun restoreSession(): Result<AuthSession> {
        val stored = tokenManager.retrieveTokens()
            ?: return Result.failure(AuthException("No stored session"))

        if (tokenManager.isTokenExpired(stored)) {
            // Try to refresh
            return refreshToken()
        }

        _currentSession.value = stored
        _currentAccount.value = accountFromSession(stored)
        _isAuthenticated.value = true
        return Result.success(stored)
    }

    @Suppress("ThrowsCount") // Auth operations may throw distinct security exceptions
    private fun parseAuthResponse(body: String): ParsedAuthResponse {
        val obj = json.parseToJsonElement(body).jsonObject
        val accessToken = obj["access_token"]?.jsonPrimitive?.content
            ?: throw AuthException("Missing access_token in response")
        val refreshToken = obj["refresh_token"]?.jsonPrimitive?.content
            ?: throw AuthException("Missing refresh_token in response")
        val expiresIn = obj["expires_in"]?.jsonPrimitive?.long ?: 3600L
        val user = obj["user"]?.jsonObject
        val userId = user?.get("id")?.jsonPrimitive?.content
            ?: throw AuthException("Missing user.id in response")

        val now = Clock.System.now()
        val session = AuthSession(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAt = Instant.fromEpochMilliseconds(
                now.toEpochMilliseconds() + (expiresIn * 1000),
            ),
            userId = userId,
            createdAt = now,
        )
        return ParsedAuthResponse(
            session = session,
            account = AuthAccount(
                userId = userId,
                email = user?.get("email")?.jsonPrimitive?.contentOrNull ?: emailFromToken(accessToken),
                provider = user?.get("app_metadata")
                    ?.jsonObject
                    ?.get("provider")
                    ?.jsonPrimitive
                    ?.contentOrNull
                    ?: providerFromToken(accessToken),
            ),
        )
    }

    private fun storeSession(session: AuthSession, account: AuthAccount = accountFromSession(session)) {
        // Store in DPAPI-encrypted storage
        secureTokenStorage.saveToken(SecureTokenStorage.KEY_ACCESS_TOKEN, session.accessToken)
        secureTokenStorage.saveToken(SecureTokenStorage.KEY_REFRESH_TOKEN, session.refreshToken)

        // Store in KMP TokenManager for cross-package access
        tokenManager.storeTokens(session)

        _currentSession.value = session
        _currentAccount.value = account
        _isAuthenticated.value = true
        logger.info("Session stored for user: ${session.userId}")
    }

    private fun clearSession() {
        secureTokenStorage.clearAllTokens()
        tokenManager.clearTokens()
        _currentSession.value = null
        _currentAccount.value = null
        _isAuthenticated.value = false
        logger.info("Session cleared")
    }

    private fun accountFromSession(session: AuthSession): AuthAccount = AuthAccount(
        userId = session.userId,
        email = emailFromToken(session.accessToken),
        provider = providerFromToken(session.accessToken),
    )

    private fun emailFromToken(accessToken: String): String? = jwtPayload(accessToken)
        ?.get("email")
        ?.jsonPrimitive
        ?.contentOrNull

    private fun providerFromToken(accessToken: String): String? {
        val payload = jwtPayload(accessToken) ?: return null
        return payload["app_metadata"]
            ?.jsonObject
            ?.get("provider")
            ?.jsonPrimitive
            ?.contentOrNull
    }

    private fun jwtPayload(accessToken: String): JsonObject? {
        @Suppress("TooGenericExceptionCaught") // Best-effort display metadata only
        return try {
            val payload = accessToken.split('.').getOrNull(1) ?: return null
            val paddedPayload = payload.padEnd(payload.length + ((4 - payload.length % 4) % 4), '=')
            val decoded = String(Base64.getUrlDecoder().decode(paddedPayload), Charsets.UTF_8)
            json.parseToJsonElement(decoded).jsonObject
        } catch (e: Exception) {
            logger.log(Level.FINE, "Unable to decode auth token metadata", e)
            null
        }
    }
}
