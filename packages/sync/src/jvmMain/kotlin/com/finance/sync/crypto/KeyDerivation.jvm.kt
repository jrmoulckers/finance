package com.finance.sync.crypto

/**
 * JVM actual for [PlatformKeyDerivation].
 *
 * Stub -- real implementation will use Bouncy Castle or similar
 * Argon2id binding when the JVM app module is built.
 */
actual class PlatformKeyDerivation actual constructor() {
    actual fun deriveKey(password: String, salt: ByteArray): ByteArray {
        throw NotImplementedError("Platform crypto not yet implemented -- JVM Argon2id binding required")
    }
}