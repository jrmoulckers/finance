package com.finance.sync.auth

/**
 * iOS actual for [TokenStorage].
 *
 * Stub — real implementation will use Keychain Services via
 * Security framework when the iOS app module is built.
 */
actual open class TokenStorage actual constructor() {
    actual open fun save(
        accessToken: String,
        refreshToken: String,
        expiresAt: Long,
        userId: String,
    ) {
        throw NotImplementedError("Platform storage not yet implemented — iOS Keychain binding required")
    }

    actual open fun load(): StoredTokenData? {
        throw NotImplementedError("Platform storage not yet implemented — iOS Keychain binding required")
    }

    actual open fun clear() {
        throw NotImplementedError("Platform storage not yet implemented — iOS Keychain binding required")
    }
}
