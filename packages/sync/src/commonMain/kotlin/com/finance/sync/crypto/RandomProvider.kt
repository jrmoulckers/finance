package com.finance.sync.crypto

/**
 * Abstraction for cryptographically-secure random byte generation.
 *
 * Platform implementations should delegate to their native CSPRNG
 * (e.g. SecureRandom on JVM, crypto.getRandomValues on JS, SecRandomCopyBytes on iOS).
 */
interface RandomProvider {
    /** Generate [size] cryptographically-random bytes. */
    fun nextBytes(size: Int): ByteArray
}

/**
 * Default [RandomProvider] using [kotlin.random.Random].
 *
 * **WARNING:** This is NOT cryptographically secure and exists only as a
 * fallback / compilation placeholder. Platform `actual` implementations
 * MUST supply a CSPRNG-backed provider for production use.
 */
internal object DefaultRandomProvider : RandomProvider {
    override fun nextBytes(size: Int): ByteArray =
        kotlin.random.Random.nextBytes(size)
}