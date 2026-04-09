// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

import com.finance.sync.auth.PlatformSHA256

/**
 * JS actual for [PlatformKeyDerivation] using pure-Kotlin PBKDF2-HMAC-SHA256.
 *
 * Derives a 256-bit key from a password and salt using PBKDF2 with
 * HMAC-SHA256 as the PRF, per RFC 2898 / NIST SP 800-132.
 *
 * Uses 600,000 iterations per OWASP 2023 recommendations for
 * PBKDF2-HMAC-SHA256.
 *
 * **Why pure Kotlin?** The Web Crypto API's `crypto.subtle.deriveBits`
 * supports PBKDF2 but is async-only (`Promise`-based). The `expect`
 * declaration requires a synchronous `deriveKey`, so we implement
 * PBKDF2 in pure Kotlin using [PlatformSHA256.sha256] as the hash
 * primitive. This works identically in both browser and Node.js
 * environments without platform-specific API dependencies.
 *
 * **Performance:** 600k iterations of HMAC-SHA256 in pure Kotlin/JS
 * may take several seconds on modern engines. This is acceptable because
 * key derivation is an infrequent operation (household creation/join).
 *
 * @see <a href="https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html">OWASP Password Storage</a>
 * @see <a href="https://datatracker.ietf.org/doc/html/rfc2898#section-5.2">RFC 2898 §5.2</a>
 */
actual class PlatformKeyDerivation actual constructor() {

    companion object {
        /** Derived key length in bytes (256 bits). */
        private const val KEY_LENGTH = 32

        /**
         * PBKDF2 iteration count.
         *
         * 600,000 is the OWASP-recommended minimum for PBKDF2-HMAC-SHA256
         * as of 2023.
         */
        private const val ITERATIONS = 600_000

        /** SHA-256 block size in bytes (for HMAC key padding). */
        private const val BLOCK_SIZE = 64

        /** SHA-256 output length in bytes. */
        private const val HASH_LENGTH = 32
    }

    /**
     * Derive a 256-bit key from [password] and [salt] using PBKDF2-HMAC-SHA256.
     *
     * @param password The user-supplied passphrase.
     * @param salt     A cryptographically-random salt (at least 16 bytes recommended).
     * @return A 32-byte derived key.
     * @throws IllegalArgumentException if [salt] is empty.
     */
    actual fun deriveKey(password: String, salt: ByteArray): ByteArray {
        require(salt.isNotEmpty()) { "Salt must not be empty" }
        return pbkdf2HmacSha256(
            password = password.encodeToByteArray(),
            salt = salt,
            iterations = ITERATIONS,
            dkLen = KEY_LENGTH,
        )
    }

    /**
     * PBKDF2 key derivation using HMAC-SHA256 as the PRF.
     *
     * Implements RFC 2898 §5.2:
     *   DK = T1 || T2 || ... || Tdklen/hlen
     *   Ti = F(Password, Salt, c, i)
     *   F(Password, Salt, c, i) = U1 ^ U2 ^ ... ^ Uc
     *   U1 = PRF(Password, Salt || INT(i))
     *   U2 = PRF(Password, U1)
     *   ...
     *   Uc = PRF(Password, Uc-1)
     */
    private fun pbkdf2HmacSha256(
        password: ByteArray,
        salt: ByteArray,
        iterations: Int,
        dkLen: Int,
    ): ByteArray {
        val numBlocks = (dkLen + HASH_LENGTH - 1) / HASH_LENGTH
        val result = ByteArray(numBlocks * HASH_LENGTH)

        // Pre-compute HMAC key padding (avoids recomputing per iteration)
        val normalizedKey = if (password.size > BLOCK_SIZE) {
            PlatformSHA256.sha256(password)
        } else {
            password
        }
        val ipadKey = ByteArray(BLOCK_SIZE)
        val opadKey = ByteArray(BLOCK_SIZE)
        for (i in normalizedKey.indices) {
            ipadKey[i] = (normalizedKey[i].toInt() xor 0x36).toByte()
            opadKey[i] = (normalizedKey[i].toInt() xor 0x5c).toByte()
        }
        for (i in normalizedKey.size until BLOCK_SIZE) {
            ipadKey[i] = 0x36.toByte()
            opadKey[i] = 0x5c.toByte()
        }

        for (blockIndex in 1..numBlocks) {
            // INT(i) — big-endian 4-byte encoding of the block number
            val intI = byteArrayOf(
                (blockIndex shr 24).toByte(),
                (blockIndex shr 16).toByte(),
                (blockIndex shr 8).toByte(),
                blockIndex.toByte(),
            )

            // U1 = HMAC(Password, Salt || INT(i))
            var u = hmacSha256WithPaddedKey(ipadKey, opadKey, salt + intI)
            val block = u.copyOf()

            // U2 .. Uc: accumulate XOR
            for (j in 2..iterations) {
                u = hmacSha256WithPaddedKey(ipadKey, opadKey, u)
                for (k in block.indices) {
                    block[k] = (block[k].toInt() xor u[k].toInt()).toByte()
                }
            }

            block.copyInto(result, (blockIndex - 1) * HASH_LENGTH)
        }

        return result.copyOf(dkLen)
    }

    /**
     * HMAC-SHA256 using pre-computed ipad/opad key blocks.
     *
     * HMAC(K, m) = H((K' ⊕ opad) || H((K' ⊕ ipad) || m))
     *
     * Using pre-padded keys avoids redundant key normalization and
     * XOR computation on every iteration of the PBKDF2 loop.
     */
    private fun hmacSha256WithPaddedKey(
        ipadKey: ByteArray,
        opadKey: ByteArray,
        message: ByteArray,
    ): ByteArray {
        val inner = PlatformSHA256.sha256(ipadKey + message)
        return PlatformSHA256.sha256(opadKey + inner)
    }
}