// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.auth

/**
 * iOS actual for [TokenStorage].
 *
 * This keeps token state in memory until the Swift Export bridge can delegate
 * directly to the app's KeychainManager-backed storage. That mirrors the current
 * Android, JVM, and JS development implementations while removing the iOS stub.
 */
actual open class TokenStorage actual constructor() {
    // TODO(#440): Replace this with direct Security.framework Keychain access
    // when the Swift Export bridge is wired to the app's KeychainManager.
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
