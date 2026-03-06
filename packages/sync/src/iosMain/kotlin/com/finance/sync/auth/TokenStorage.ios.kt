package com.finance.sync.auth

/**
 * iOS actual for [TokenStorage].
 *
 * Stub — real implementation will use Keychain Services via
 * Security framework when the iOS app module is built.
 */
actual class TokenStorage actual constructor() {
    actual fun save(
        accessToken: String,
        refreshToken: String,
        expiresAt: Long,
        userId: String,
    ) {
        throw NotImplementedError("Platform storage not yet implemented — iOS Keychain binding required")
    }

    actual fun load(): StoredTokenData? {
        throw NotImplementedError("Platform storage not yet implemented — iOS Keychain binding required")
    }

    actual fun clear() {
        throw NotImplementedError("Platform storage not yet implemented — iOS Keychain binding required")
    }
}
