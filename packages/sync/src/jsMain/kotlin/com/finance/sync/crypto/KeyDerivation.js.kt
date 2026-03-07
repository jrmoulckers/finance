package com.finance.sync.crypto

/**
 * JS actual for [PlatformKeyDerivation].
 *
 * Stub -- real implementation will use a WebCrypto / wasm-argon2 binding
 * when the web app module is built.
 */
actual class PlatformKeyDerivation actual constructor() {
    actual fun deriveKey(password: String, salt: ByteArray): ByteArray {
        throw NotImplementedError("Platform crypto not yet implemented -- JS Argon2id binding required")
    }
}