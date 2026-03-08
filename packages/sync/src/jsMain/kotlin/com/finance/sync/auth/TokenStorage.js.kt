// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

/**
 * JS actual for [TokenStorage].
 *
 * Stub — real implementation should use in-memory storage or
 * HttpOnly cookies. NEVER use localStorage for tokens.
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
