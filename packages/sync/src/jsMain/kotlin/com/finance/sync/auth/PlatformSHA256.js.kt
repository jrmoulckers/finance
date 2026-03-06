package com.finance.sync.auth

/**
 * JS actual for [PlatformSHA256].
 *
 * Stub — real implementation will use Web Crypto API
 * (crypto.subtle.digest + crypto.getRandomValues) when the web
 * app module is built. Note: Web Crypto digest is async, so the
 * production version may need a coroutine-based API or a
 * synchronous wasm fallback.
 */
actual object PlatformSHA256 {
    actual fun sha256(input: ByteArray): ByteArray {
        throw NotImplementedError("Platform crypto not yet implemented — JS WebCrypto SHA-256 binding required")
    }

    actual fun randomBytes(size: Int): ByteArray {
        throw NotImplementedError("Platform crypto not yet implemented — JS crypto.getRandomValues binding required")
    }
}
