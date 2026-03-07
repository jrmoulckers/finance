package com.finance.sync.auth

/**
 * iOS actual for [PlatformSHA256].
 *
 * Stub — real implementation will use CryptoKit (SHA256 + SecRandomCopyBytes)
 * when the iOS app module is built.
 */
actual object PlatformSHA256 {
    actual fun sha256(input: ByteArray): ByteArray {
        throw NotImplementedError("Platform crypto not yet implemented — iOS CryptoKit SHA256 binding required")
    }

    actual fun randomBytes(size: Int): ByteArray {
        throw NotImplementedError("Platform crypto not yet implemented — iOS SecRandomCopyBytes binding required")
    }
}
