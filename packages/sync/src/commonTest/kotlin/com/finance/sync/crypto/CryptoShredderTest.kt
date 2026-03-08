// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Tests for [CryptoShredder] (#96).
 *
 * Verifies that crypto-shredding:
 *  - Destroys keys and produces a deletion certificate.
 *  - Makes data unrecoverable after shredding.
 *  - Passes verification checks.
 */
class CryptoShredderTest {

    @Test
    fun shredHouseholdDataDestroysKeys() {
        val keyStore = TestKeyStore()
        keyStore.addHouseholdKey("hh-1", "fingerprint-kek-1")
        keyStore.addHouseholdKey("hh-1", "fingerprint-dek-1")

        val shredder = CryptoShredder(keyStore)

        assertTrue(keyStore.hasKeysForHousehold("hh-1"), "Keys should exist before shredding")

        val cert = shredder.shredHouseholdData("hh-1", requestedBy = "admin@example.com")

        assertFalse(keyStore.hasKeysForHousehold("hh-1"), "Keys should be gone after shredding")
        assertEquals(DeletionCertificate.SubjectType.HOUSEHOLD, cert.subjectType)
        assertEquals("hh-1", cert.subjectId)
        assertEquals("admin@example.com", cert.requestedBy)
        assertTrue(cert.verified, "Shredding should be verified")
        assertEquals(2, cert.keyFingerprints.size, "Both key fingerprints should be recorded")
    }

    @Test
    fun shredUserDataDestroysKeys() {
        val keyStore = TestKeyStore()
        keyStore.addUserKey("user-42", "fingerprint-pk-42")

        val shredder = CryptoShredder(keyStore)

        assertTrue(keyStore.hasKeysForUser("user-42"), "Keys should exist before shredding")

        val cert = shredder.shredUserData("user-42", requestedBy = "user-42")

        assertFalse(keyStore.hasKeysForUser("user-42"), "Keys should be gone")
        assertEquals(DeletionCertificate.SubjectType.USER, cert.subjectType)
        assertEquals("user-42", cert.subjectId)
        assertTrue(cert.verified)
    }

    @Test
    fun verifyShredsReturnsTrue_whenNoKeysExist() {
        val keyStore = TestKeyStore()
        val shredder = CryptoShredder(keyStore)

        assertTrue(
            shredder.verifyShredding("non-existent"),
            "No keys == successfully shredded",
        )
    }

    @Test
    fun verifyShredsReturnsFalse_whenKeysStillExist() {
        val keyStore = TestKeyStore()
        keyStore.addHouseholdKey("hh-2", "fingerprint-still-here")

        val shredder = CryptoShredder(keyStore)

        assertFalse(
            shredder.verifyShredding("hh-2"),
            "Keys still exist, shredding not verified",
        )
    }

    @Test
    fun deletionCertificateContainsTimestamp() {
        val keyStore = TestKeyStore()
        keyStore.addHouseholdKey("hh-3", "fp-1")

        val shredder = CryptoShredder(keyStore)
        val cert = shredder.shredHouseholdData("hh-3", requestedBy = "system")

        assertNotNull(cert.destroyedAt, "Certificate must include a timestamp")
        assertTrue(cert.id.startsWith("cert-"), "Certificate ID should have expected prefix")
    }

    @Test
    fun shreddingMakesDataUnrecoverable() {
        // Simulate: encrypt data, then shred keys, then attempt to decrypt
        val crypto = TestCryptoProvider()
        val random = TestRandomProvider()
        val envelope = EnvelopeEncryption(crypto, random)
        val encryptor = FieldEncryptor(crypto, envelope)

        val kek = ByteArray(32) { (it + 1).toByte() }
        val record = encryptor.encryptRecord(
            fields = mapOf("payee" to "Secret Payee", "amount_cents" to "5000"),
            kek = kek,
        )

        // Before shredding, decryption works
        val decrypted = encryptor.decryptRecord(record, kek)
        assertEquals("Secret Payee", decrypted["payee"])

        // After shredding, the KEK is gone -- simulate by zeroing it
        val destroyedKek = ByteArray(32) { 0 }

        // Attempting decryption with destroyed key should produce garbage
        val result = encryptor.decryptRecord(record, destroyedKek)
        assertTrue(
            result["payee"] != "Secret Payee",
            "Data should be unrecoverable with destroyed key",
        )
    }

    @Test
    fun shredHouseholdDataWithNoKeys() {
        val keyStore = TestKeyStore()
        val shredder = CryptoShredder(keyStore)

        // Should not throw; just produces an empty certificate
        val cert = shredder.shredHouseholdData("empty-hh", requestedBy = "admin")
        assertTrue(cert.keyFingerprints.isEmpty())
        assertTrue(cert.verified)
    }
}