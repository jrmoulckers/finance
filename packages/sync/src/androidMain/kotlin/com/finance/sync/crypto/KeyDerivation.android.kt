package com.finance.sync.crypto

/**
 * Android actual for [PlatformKeyDerivation].
 *
 * Stub — real implementation will use Android Keystore–backed
 * PBKDF2 or Argon2id via a native library when the security
 * module is fully integrated.
 */
actual class PlatformKeyDerivation actual constructor() {
    actual fun deriveKey(password: String, salt: ByteArray): ByteArray {
        throw NotImplementedError("Platform crypto not yet implemented — Android Argon2id binding required")
    }
}
