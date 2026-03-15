// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

/**
 * Pure-Kotlin SHA-256 implementation for multiplatform use.
 *
 * Used for export checksums and user-ID anonymisation. This is **not** intended
 * for security-critical cryptographic operations — for those, use the platform-
 * specific implementations in `packages/sync` (e.g., [com.finance.sync.auth.PlatformSHA256]).
 *
 * Implements the SHA-256 algorithm per FIPS 180-4.
 */
internal object Sha256 {

    private val K = intArrayOf(
        0x428a2f98.toInt(), 0x71374491, 0xb5c0fbcf.toInt(), 0xe9b5dba5.toInt(),
        0x3956c25b, 0x59f111f1, 0x923f82a4.toInt(), 0xab1c5ed5.toInt(),
        0xd807aa98.toInt(), 0x12835b01, 0x243185be, 0x550c7dc3,
        0x72be5d74, 0x80deb1fe.toInt(), 0x9bdc06a7.toInt(), 0xc19bf174.toInt(),
        0xe49b69c1.toInt(), 0xefbe4786.toInt(), 0x0fc19dc6, 0x240ca1cc,
        0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152.toInt(), 0xa831c66d.toInt(), 0xb00327c8.toInt(), 0xbf597fc7.toInt(),
        0xc6e00bf3.toInt(), 0xd5a79147.toInt(), 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
        0x650a7354, 0x766a0abb, 0x81c2c92e.toInt(), 0x92722c85.toInt(),
        0xa2bfe8a1.toInt(), 0xa81a664b.toInt(), 0xc24b8b70.toInt(), 0xc76c51a3.toInt(),
        0xd192e819.toInt(), 0xd6990624.toInt(), 0xf40e3585.toInt(), 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
        0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814.toInt(), 0x8cc70208.toInt(),
        0x90befffa.toInt(), 0xa4506ceb.toInt(), 0xbef9a3f7.toInt(), 0xc67178f2.toInt(),
    )

    /**
     * Computes the SHA-256 digest of [input] and returns the result as a
     * lowercase hexadecimal string (64 characters).
     */
    fun hexDigest(input: ByteArray): String {
        val hash = digest(input)
        return hash.joinToString("") { byte ->
            (byte.toInt() and 0xFF).toString(16).padStart(2, '0')
        }
    }

    /**
     * Convenience overload that hashes a UTF-8 encoded string.
     */
    fun hexDigest(input: String): String = hexDigest(input.encodeToByteArray())

    /**
     * Computes the raw 32-byte SHA-256 digest of [message].
     */
    fun digest(message: ByteArray): ByteArray {
        val padded = pad(message)
        var h0 = 0x6a09e667
        var h1 = 0xbb67ae85.toInt()
        var h2 = 0x3c6ef372
        var h3 = 0xa54ff53a.toInt()
        var h4 = 0x510e527f
        var h5 = 0x9b05688c.toInt()
        var h6 = 0x1f83d9ab
        var h7 = 0x5be0cd19

        for (i in padded.indices step 64) {
            val w = IntArray(64)
            for (j in 0 until 16) {
                w[j] = ((padded[i + j * 4].toInt() and 0xFF) shl 24) or
                    ((padded[i + j * 4 + 1].toInt() and 0xFF) shl 16) or
                    ((padded[i + j * 4 + 2].toInt() and 0xFF) shl 8) or
                    (padded[i + j * 4 + 3].toInt() and 0xFF)
            }
            for (j in 16 until 64) {
                val s0 = rightRotate(w[j - 15], 7) xor rightRotate(w[j - 15], 18) xor (w[j - 15] ushr 3)
                val s1 = rightRotate(w[j - 2], 17) xor rightRotate(w[j - 2], 19) xor (w[j - 2] ushr 10)
                w[j] = w[j - 16] + s0 + w[j - 7] + s1
            }

            var a = h0; var b = h1; var c = h2; var d = h3
            var e = h4; var f = h5; var g = h6; var h = h7

            for (j in 0 until 64) {
                val s1 = rightRotate(e, 6) xor rightRotate(e, 11) xor rightRotate(e, 25)
                val ch = (e and f) xor (e.inv() and g)
                val temp1 = h + s1 + ch + K[j] + w[j]
                val s0 = rightRotate(a, 2) xor rightRotate(a, 13) xor rightRotate(a, 22)
                val maj = (a and b) xor (a and c) xor (b and c)
                val temp2 = s0 + maj

                h = g; g = f; f = e; e = d + temp1
                d = c; c = b; b = a; a = temp1 + temp2
            }

            h0 += a; h1 += b; h2 += c; h3 += d
            h4 += e; h5 += f; h6 += g; h7 += h
        }

        return intToBytes(h0) + intToBytes(h1) + intToBytes(h2) + intToBytes(h3) +
            intToBytes(h4) + intToBytes(h5) + intToBytes(h6) + intToBytes(h7)
    }

    private fun pad(message: ByteArray): ByteArray {
        val bitLen = message.size.toLong() * 8
        val padLen = (56 - (message.size + 1) % 64 + 64) % 64
        val padded = ByteArray(message.size + 1 + padLen + 8)
        message.copyInto(padded)
        padded[message.size] = 0x80.toByte()
        for (i in 0 until 8) {
            padded[padded.size - 8 + i] = (bitLen ushr (56 - i * 8)).toByte()
        }
        return padded
    }

    private fun rightRotate(value: Int, bits: Int): Int =
        (value ushr bits) or (value shl (32 - bits))

    private fun intToBytes(value: Int): ByteArray = byteArrayOf(
        (value ushr 24).toByte(), (value ushr 16).toByte(),
        (value ushr 8).toByte(), value.toByte(),
    )
}
