package com.finance.sync.auth

/**
 * Android actual for [TokenStorage].
 *
 * In-memory implementation for initial development.
 * Production builds should migrate to EncryptedSharedPreferences
 * backed by Android Keystore for hardware-backed key protection.
 */
actual open class TokenStorage actual constructor() {
    private var stored: StoredTokenData? = null

    actual open fun save(
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

    actual open fun load(): StoredTokenData? = stored

    actual open fun clear() {
        stored = null
    }
}
