// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.data.repository.impl

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

    private val _currentSession = MutableStateFlow<AuthSession?>(null)
    override val currentSession: StateFlow<AuthSession?> = _currentSession.asStateFlow()

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

            val session = parseAuthResponse(response.bodyAsText())
            storeSession(session)
            Result.success(session)
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

            val session = parseAuthResponse(response.bodyAsText())
            storeSession(session)
            Result.success(session)
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

            val session = parseAuthResponse(response.bodyAsText())
            storeSession(session)
            Result.success(session)
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
        _isAuthenticated.value = true
        return Result.success(stored)
    }

    @Suppress("ThrowsCount") // Auth operations may throw distinct security exceptions
    private fun parseAuthResponse(body: String): AuthSession {
        val obj = json.parseToJsonElement(body).jsonObject
        val accessToken = obj["access_token"]?.jsonPrimitive?.content
            ?: throw AuthException("Missing access_token in response")
        val refreshToken = obj["refresh_token"]?.jsonPrimitive?.content
            ?: throw AuthException("Missing refresh_token in response")
        val expiresIn = obj["expires_in"]?.jsonPrimitive?.long ?: 3600L
        val userId = obj["user"]?.jsonObject?.get("id")?.jsonPrimitive?.content
            ?: throw AuthException("Missing user.id in response")

        val now = Clock.System.now()
        return AuthSession(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAt = Instant.fromEpochMilliseconds(
                now.toEpochMilliseconds() + (expiresIn * 1000),
            ),
            userId = userId,
            createdAt = now,
        )
    }

    private fun storeSession(session: AuthSession) {
        // Store in DPAPI-encrypted storage
        secureTokenStorage.saveToken(SecureTokenStorage.KEY_ACCESS_TOKEN, session.accessToken)
        secureTokenStorage.saveToken(SecureTokenStorage.KEY_REFRESH_TOKEN, session.refreshToken)

        // Store in KMP TokenManager for cross-package access
        tokenManager.storeTokens(session)

        _currentSession.value = session
        _isAuthenticated.value = true
        logger.info("Session stored for user: ${session.userId}")
    }

    private fun clearSession() {
        secureTokenStorage.clearAllTokens()
        tokenManager.clearTokens()
        _currentSession.value = null
        _isAuthenticated.value = false
        logger.info("Session cleared")
    }
}
