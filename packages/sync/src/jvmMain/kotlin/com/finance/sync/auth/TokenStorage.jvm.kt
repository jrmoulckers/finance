package com.finance.sync.auth

/**
 * JVM actual for [TokenStorage].
 *
 * Simple in-memory implementation for development/testing.
 * Production Android builds should use EncryptedSharedPreferences;
 * Desktop builds should use the OS credential store.
 */
actual class TokenStorage actual constructor() {
    private var stored: StoredTokenData? = null

    actual fun save(
        accessToken: String,
        refreshToken: String,
        expiresAt: Long,
        userId: String,
    ) {
        stored = StoredTokenData(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAtMillis = expiresAt,
            userId = userId,
        )
    }

    actual fun load(): StoredTokenData? = stored

    actual fun clear() {
        stored = null
    }
}
