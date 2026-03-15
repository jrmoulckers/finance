// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

/**
 * iOS actual for [PlatformKeyDerivation].
 *
 * Argon2id is not available through the Apple framework interop exposed to this
 * KMP module, so iOS uses PBKDF2-HMAC-SHA256 as a deterministic 32-byte fallback.
 * This keeps the iOS source set functional until a shared Argon2id binding lands.
 */
actual class PlatformKeyDerivation actual constructor() {
    actual fun deriveKey(password: String, salt: ByteArray): ByteArray {
        return pbkdf2HmacSha256(
            password = password.encodeToByteArray(),
            salt = salt,
            iterations = PBKDF2_ITERATIONS,
            outputLength = DERIVED_KEY_SIZE_BYTES,
        )
    }

    private fun pbkdf2HmacSha256(
        password: ByteArray,
        salt: ByteArray,
        iterations: Int,
        outputLength: Int,
    ): ByteArray {
        val blockCount = (outputLength + SHA256_DIGEST_SIZE - 1) / SHA256_DIGEST_SIZE
        val derivedKey = ByteArray(blockCount * SHA256_DIGEST_SIZE)

        for (blockIndex in 1..blockCount) {
            var u = hmacSha256(password, salt + intToBigEndian(blockIndex))
            val accumulator = u.copyOf()

            repeat(iterations - 1) {
                u = hmacSha256(password, u)
                for (byteIndex in accumulator.indices) {
                    accumulator[byteIndex] =
                        (accumulator[byteIndex].toInt() xor u[byteIndex].toInt()).toByte()
                }
            }

            accumulator.copyInto(
                destination = derivedKey,
                destinationOffset = (blockIndex - 1) * SHA256_DIGEST_SIZE,
            )
        }

        return derivedKey.copyOf(outputLength)
    }

    private fun hmacSha256(key: ByteArray, message: ByteArray): ByteArray {
        val normalizedKey = if (key.size > HMAC_BLOCK_SIZE_BYTES) {
            Sha256.digest(key)
        } else {
            key
        }

        val keyBlock = ByteArray(HMAC_BLOCK_SIZE_BYTES)
        normalizedKey.copyInto(keyBlock)

        val innerPad = ByteArray(HMAC_BLOCK_SIZE_BYTES) { index ->
            (keyBlock[index].toInt() xor INNER_PAD_BYTE).toByte()
        }
        val outerPad = ByteArray(HMAC_BLOCK_SIZE_BYTES) { index ->
            (keyBlock[index].toInt() xor OUTER_PAD_BYTE).toByte()
        }

        val innerHash = Sha256.digest(innerPad + message)
        return Sha256.digest(outerPad + innerHash)
    }

    private fun intToBigEndian(value: Int): ByteArray = byteArrayOf(
        (value ushr 24).toByte(),
        (value ushr 16).toByte(),
        (value ushr 8).toByte(),
        value.toByte(),
    )

    private companion object {
        const val PBKDF2_ITERATIONS: Int = 100_000
        const val DERIVED_KEY_SIZE_BYTES: Int = 32
        const val SHA256_DIGEST_SIZE: Int = 32
        const val HMAC_BLOCK_SIZE_BYTES: Int = 64
        const val INNER_PAD_BYTE: Int = 0x36
        const val OUTER_PAD_BYTE: Int = 0x5C
    }
}
