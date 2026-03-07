package com.finance.android.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys

/**
 * Encrypted token storage backed by [EncryptedSharedPreferences].
 *
 * All values are encrypted at rest using an AES-256-GCM key managed by
 * the Android Keystore via the AndroidX Security library. This is the
 * recommended mechanism for persisting small secrets such as auth tokens.
 *
 * @param context Application context used to open the encrypted prefs file.
 */
class SecureTokenStorage(context: Context) {

    private val prefs: SharedPreferences

    init {
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)

        prefs = EncryptedSharedPreferences.create(
            PREFS_FILE_NAME,
            masterKeyAlias,
            context.applicationContext,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    // ── Access token ────────────────────────────────────────────────────

    /** Persists the current access (bearer) token. */
    fun saveAccessToken(token: String) {
        prefs.edit().putString(KEY_ACCESS_TOKEN, token).apply()
    }

    /** Returns the stored access token, or `null` if none exists. */
    fun getAccessToken(): String? = prefs.getString(KEY_ACCESS_TOKEN, null)

    // ── Refresh token ───────────────────────────────────────────────────

    /** Persists the refresh token used to obtain a new access token. */
    fun saveRefreshToken(token: String) {
        prefs.edit().putString(KEY_REFRESH_TOKEN, token).apply()
    }

    /** Returns the stored refresh token, or `null` if none exists. */
    fun getRefreshToken(): String? = prefs.getString(KEY_REFRESH_TOKEN, null)

    // ── Token expiry ────────────────────────────────────────────────────

    /**
     * Stores the access-token expiry as a Unix epoch millisecond timestamp.
     *
     * @param expiryMillis Milliseconds since epoch when the token expires.
     */
    fun saveTokenExpiry(expiryMillis: Long) {
        prefs.edit().putLong(KEY_TOKEN_EXPIRY, expiryMillis).apply()
    }

    /**
     * Returns the stored token expiry timestamp, or `0L` if not set.
     */
    fun getTokenExpiry(): Long = prefs.getLong(KEY_TOKEN_EXPIRY, 0L)

    // ── Convenience ─────────────────────────────────────────────────────

    /** Returns `true` when a non-expired access token is available. */
    fun hasValidToken(): Boolean {
        val token = getAccessToken() ?: return false
        if (token.isBlank()) return false
        val expiry = getTokenExpiry()
        return expiry == 0L || System.currentTimeMillis() < expiry
    }

    /**
     * Persists all token fields in a single transaction.
     *
     * @param accessToken  The bearer token.
     * @param refreshToken The refresh token.
     * @param expiryMillis Unix-epoch millis when [accessToken] expires.
     */
    fun saveTokens(accessToken: String, refreshToken: String, expiryMillis: Long) {
        prefs.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putLong(KEY_TOKEN_EXPIRY, expiryMillis)
            .apply()
    }

    /** Removes all stored tokens (e.g. on logout). */
    fun clearTokens() {
        prefs.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_TOKEN_EXPIRY)
            .apply()
    }

    companion object {
        private const val PREFS_FILE_NAME = "finance_secure_tokens"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_TOKEN_EXPIRY = "token_expiry"
    }
}
