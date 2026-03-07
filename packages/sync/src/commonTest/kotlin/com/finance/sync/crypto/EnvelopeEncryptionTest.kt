package com.finance.sync.crypto

import kotlin.test.Test
import kotlin.test.assertEquals
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
}