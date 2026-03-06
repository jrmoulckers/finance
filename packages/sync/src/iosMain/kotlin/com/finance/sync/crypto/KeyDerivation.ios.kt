package com.finance.sync.crypto

/**
 * iOS actual for [PlatformKeyDerivation].
 *
 * Stub -- real implementation will use CryptoKit / libsodium
 * when the iOS app module is built.
 */
actual class PlatformKeyDerivation actual constructor() {
    actual fun deriveKey(password: String, salt: ByteArray): ByteArray {
        throw NotImplementedError("Platform crypto not yet implemented -- iOS Argon2id binding required")
    }
}