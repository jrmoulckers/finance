// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * Tests for [EnvelopeEncryption] (#92).
 *
 * Verifies DEK generation, wrap/unwrap round-trips, and key isolation.
 */
class EnvelopeEncryptionTest {

    private val crypto = TestCryptoProvider()
    private val random = TestRandomProvider()
    private val envelope = EnvelopeEncryption(crypto, random)

    /** A 32-byte test KEK. */
    private val testKek = ByteArray(32) { (it + 1).toByte() }

    @Test
    fun generateDekReturnsCorrectLength() {
        val dek = envelope.generateDEK()
        assertEquals(
            EnvelopeEncryption.DEK_LENGTH_BYTES,
            dek.size,
            "DEK should be {EnvelopeEncryption.DEK_LENGTH_BYTES} bytes",
        )
    }

    @Test
    fun wrapUnwrapDekRoundTrips() {
        val dek = envelope.generateDEK()
        val wrapped = envelope.wrapDEK(dek, testKek)
        val unwrapped = envelope.unwrapDEK(wrapped, testKek)

        assertTrue(
            dek.contentEquals(unwrapped),
            "Unwrapped DEK must match original",
        )
    }

    @Test
    fun wrappedDekDiffersFromOriginal() {
        val dek = envelope.generateDEK()
        val wrapped = envelope.wrapDEK(dek, testKek)

        assertTrue(
            !dek.contentEquals(wrapped),
            "Wrapped DEK should not equal plaintext DEK",
        )
    }

    @Test
    fun differentKeksProduceDifferentWrappings() {
        val dek = envelope.generateDEK()
        val kek1 = ByteArray(32) { 0x01 }
        val kek2 = ByteArray(32) { 0x02 }

        val wrapped1 = envelope.wrapDEK(dek, kek1)
        val wrapped2 = envelope.wrapDEK(dek, kek2)

        assertTrue(
            !wrapped1.contentEquals(wrapped2),
            "Different KEKs should produce different wrapped DEKs",
        )
    }

    @Test
    fun multipleWrapsCanAllUnwrap() {
        val dek = envelope.generateDEK()
        repeat(5) {
            val wrapped = envelope.wrapDEK(dek, testKek)
            val unwrapped = envelope.unwrapDEK(wrapped, testKek)
            assertTrue(
                dek.contentEquals(unwrapped),
                "Wrap/unwrap round-trip it should succeed",
            )
        }
    }

    // =========================================================================
    // Unwrapping with wrong KEK
    // =========================================================================

    @Test
    fun unwrapWithWrongKekProducesIncorrectDek() {
        val dek = envelope.generateDEK()
        val wrapped = envelope.wrapDEK(dek, testKek)

        val wrongKek = ByteArray(32) { 0xFF.toByte() }
        // With XOR-based test crypto, wrong key produces different bytes
        val unwrapped = envelope.unwrapDEK(wrapped, wrongKek)

        assertTrue(
            !dek.contentEquals(unwrapped),
            "Unwrapping with wrong KEK should not produce original DEK",
        )
    }

    @Test
    fun unwrapWithSlightlyDifferentKekFails() {
        val dek = envelope.generateDEK()
        val wrapped = envelope.wrapDEK(dek, testKek)

        // Change just one byte of the KEK
        val alteredKek = testKek.copyOf()
        alteredKek[0] = (alteredKek[0].toInt() xor 0x01).toByte()

        val unwrapped = envelope.unwrapDEK(wrapped, alteredKek)
        assertTrue(
            !dek.contentEquals(unwrapped),
            "Even a single-bit change in KEK should prevent correct unwrap",
        )
    }

    // =========================================================================
    // Wrapped DEK format
    // =========================================================================

    @Test
    fun wrappedDekContainsNonceLengthPrefix() {
        val dek = envelope.generateDEK()
        val wrapped = envelope.wrapDEK(dek, testKek)

        // First 4 bytes encode the nonce length as big-endian int
        assertTrue(wrapped.size > 4, "Wrapped DEK must be longer than 4 bytes")

        val nonceLen =
            ((wrapped[0].toInt() and 0xFF) shl 24) or
            ((wrapped[1].toInt() and 0xFF) shl 16) or
            ((wrapped[2].toInt() and 0xFF) shl 8) or
            (wrapped[3].toInt() and 0xFF)

        assertTrue(nonceLen > 0, "Nonce length must be positive")
        assertTrue(
            wrapped.size > 4 + nonceLen,
            "Wrapped DEK must contain nonce + ciphertext after length prefix",
        )
    }

    @Test
    fun wrappedDekIsTooShortThrows() {
        assertFailsWith<IllegalArgumentException> {
            envelope.unwrapDEK(byteArrayOf(0, 0, 0), testKek)
        }
    }

    @Test
    fun wrappedDekMalformedNonceLengthThrows() {
        // Claim nonce is 255 bytes but provide only 5 total bytes
        val malformed = byteArrayOf(0, 0, 0, 255.toByte(), 42)
        assertFailsWith<IllegalArgumentException> {
            envelope.unwrapDEK(malformed, testKek)
        }
    }

    // =========================================================================
    // DEK generation uniqueness
    // =========================================================================

    @Test
    fun consecutiveDeksAreDifferent() {
        val dek1 = envelope.generateDEK()
        val dek2 = envelope.generateDEK()

        assertTrue(
            !dek1.contentEquals(dek2),
            "Consecutive DEKs should be different",
        )
    }

    @Test
    fun dekLengthIsAlways32Bytes() {
        repeat(10) {
            val dek = envelope.generateDEK()
            assertEquals(32, dek.size, "Every DEK must be 32 bytes")
        }
    }

    // =========================================================================
    // EncryptedPayload equality
    // =========================================================================

    @Test
    fun encryptedPayloadEqualityByContent() {
        val p1 = EncryptedPayload(
            ciphertext = byteArrayOf(1, 2, 3),
            nonce = byteArrayOf(4, 5, 6),
            algorithm = "AES-256-GCM",
        )
        val p2 = EncryptedPayload(
            ciphertext = byteArrayOf(1, 2, 3),
            nonce = byteArrayOf(4, 5, 6),
            algorithm = "AES-256-GCM",
        )
        assertEquals(p1, p2, "Payloads with same content should be equal")
        assertEquals(p1.hashCode(), p2.hashCode(), "Equal payloads should have same hashCode")
    }

    @Test
    fun encryptedPayloadInequalityOnCiphertext() {
        val p1 = EncryptedPayload(byteArrayOf(1, 2, 3), byteArrayOf(4, 5, 6), "AES-256-GCM")
        val p2 = EncryptedPayload(byteArrayOf(1, 2, 4), byteArrayOf(4, 5, 6), "AES-256-GCM")
        assertNotEquals(p1, p2, "Different ciphertext should make payloads unequal")
    }

    @Test
    fun encryptedPayloadInequalityOnAlgorithm() {
        val p1 = EncryptedPayload(byteArrayOf(1), byteArrayOf(2), "AES-256-GCM")
        val p2 = EncryptedPayload(byteArrayOf(1), byteArrayOf(2), "ChaCha20-Poly1305")
        assertNotEquals(p1, p2, "Different algorithm should make payloads unequal")
    }
}