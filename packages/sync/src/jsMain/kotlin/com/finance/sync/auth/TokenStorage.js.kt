package com.finance.sync.auth

/**
 * JS actual for [TokenStorage].
 *
 * Stub — real implementation should use in-memory storage or
 * HttpOnly cookies. NEVER use localStorage for tokens.
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
