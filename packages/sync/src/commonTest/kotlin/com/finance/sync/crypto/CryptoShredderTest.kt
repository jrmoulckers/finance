// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

import com.finance.sync.integration.TestClock
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

    // =========================================================================
    // Deterministic clock for certificates
    // =========================================================================

    @Test
    fun deletionCertificateUsesInjectedClock() {
        val testClock = TestClock()
        val keyStore = TestKeyStore()
        keyStore.addHouseholdKey("hh-clock", "fp-1")

        val shredder = CryptoShredder(keyStore, testClock)
        val cert = shredder.shredHouseholdData("hh-clock", requestedBy = "system")

        assertEquals(
            testClock.now(),
            cert.destroyedAt,
            "Certificate timestamp should match the injected clock",
        )
    }

    @Test
    fun deletionCertificateIdContainsTimestamp() {
        val testClock = TestClock()
        val keyStore = TestKeyStore()
        keyStore.addHouseholdKey("hh-id", "fp-1")

        val shredder = CryptoShredder(keyStore, testClock)
        val cert = shredder.shredHouseholdData("hh-id", requestedBy = "system")

        assertTrue(cert.id.startsWith("cert-"), "Certificate ID should start with 'cert-'")
        // The timestamp portion should be base-36 encoded
        val timestampPart = cert.id.removePrefix("cert-")
        assertTrue(timestampPart.isNotEmpty(), "Certificate ID should have a timestamp suffix")
    }

    // =========================================================================
    // Multiple sequential shred operations
    // =========================================================================

    @Test
    fun multipleShredOperationsProduceUniqueCertificates() {
        val testClock = TestClock()
        val keyStore = TestKeyStore()
        keyStore.addHouseholdKey("hh-A", "fp-a")
        keyStore.addHouseholdKey("hh-B", "fp-b")

        val shredder = CryptoShredder(keyStore, testClock)

        val certA = shredder.shredHouseholdData("hh-A", requestedBy = "admin")
        testClock.advanceBy(1000)
        val certB = shredder.shredHouseholdData("hh-B", requestedBy = "admin")

        // Certificates should have different IDs (different timestamps)
        assertTrue(certA.id != certB.id, "Sequential certificates should have different IDs")
        assertEquals("hh-A", certA.subjectId)
        assertEquals("hh-B", certB.subjectId)
    }

    @Test
    fun shredSameHouseholdTwiceIsIdempotent() {
        val keyStore = TestKeyStore()
        keyStore.addHouseholdKey("hh-idem", "fp-1")

        val shredder = CryptoShredder(keyStore)

        // First shred should destroy keys
        val cert1 = shredder.shredHouseholdData("hh-idem", requestedBy = "admin")
        assertEquals(1, cert1.keyFingerprints.size)
        assertTrue(cert1.verified)

        // Second shred should be a no-op with empty fingerprints
        val cert2 = shredder.shredHouseholdData("hh-idem", requestedBy = "admin")
        assertTrue(cert2.keyFingerprints.isEmpty(), "No keys to destroy on second shred")
        assertTrue(cert2.verified, "Still verified — no keys remain")
    }

    // =========================================================================
    // Combined user + household shredding
    // =========================================================================

    @Test
    fun shredUserThenHouseholdBothVerify() {
        val keyStore = TestKeyStore()
        keyStore.addUserKey("user-99", "fp-user-key")
        keyStore.addHouseholdKey("hh-99", "fp-hh-kek")
        keyStore.addHouseholdKey("hh-99", "fp-hh-dek")

        val shredder = CryptoShredder(keyStore)

        // Shred user first
        val userCert = shredder.shredUserData("user-99", requestedBy = "user-99")
        assertTrue(userCert.verified)
        assertEquals(DeletionCertificate.SubjectType.USER, userCert.subjectType)
        assertFalse(keyStore.hasKeysForUser("user-99"))

        // Household keys should still exist
        assertTrue(keyStore.hasKeysForHousehold("hh-99"))

        // Shred household
        val hhCert = shredder.shredHouseholdData("hh-99", requestedBy = "admin")
        assertTrue(hhCert.verified)
        assertEquals(DeletionCertificate.SubjectType.HOUSEHOLD, hhCert.subjectType)
        assertEquals(2, hhCert.keyFingerprints.size)
        assertFalse(keyStore.hasKeysForHousehold("hh-99"))
    }

    @Test
    fun shredUserDataRecordsFingerprintsCorrectly() {
        val keyStore = TestKeyStore()
        keyStore.addUserKey("user-fp", "fingerprint-alpha")
        keyStore.addUserKey("user-fp", "fingerprint-beta")
        keyStore.addUserKey("user-fp", "fingerprint-gamma")

        val shredder = CryptoShredder(keyStore)
        val cert = shredder.shredUserData("user-fp", requestedBy = "user-fp")

        assertEquals(3, cert.keyFingerprints.size, "All three fingerprints should be recorded")
        assertTrue("fingerprint-alpha" in cert.keyFingerprints)
        assertTrue("fingerprint-beta" in cert.keyFingerprints)
        assertTrue("fingerprint-gamma" in cert.keyFingerprints)
    }

    // =========================================================================
    // verifyShredding edge cases
    // =========================================================================

    @Test
    fun verifyShredsReturnsTrueAfterDestroyingAllKeys() {
        val keyStore = TestKeyStore()
        keyStore.addHouseholdKey("hh-verify", "fp-1")
        keyStore.addHouseholdKey("hh-verify", "fp-2")
        keyStore.addHouseholdKey("hh-verify", "fp-3")

        val shredder = CryptoShredder(keyStore)

        assertFalse(shredder.verifyShredding("hh-verify"), "Before shredding: should not verify")

        shredder.shredHouseholdData("hh-verify", requestedBy = "admin")

        assertTrue(shredder.verifyShredding("hh-verify"), "After shredding: should verify")
    }

    @Test
    fun shreddingDataWithMultipleSensitiveFields() {
        // End-to-end: encrypt multiple fields, shred, verify data is unrecoverable
        val crypto = TestCryptoProvider()
        val random = TestRandomProvider()
        val envelope = EnvelopeEncryption(crypto, random)
        val encryptor = FieldEncryptor(crypto, envelope)

        val kek = ByteArray(32) { (it + 1).toByte() }
        val record = encryptor.encryptRecord(
            fields = mapOf(
                "payee" to "Very Secret Payee",
                "note" to "Classified Note",
                "account.name" to "Secret Account",
                "amount_cents" to "999999",
            ),
            kek = kek,
        )

        // Before shredding: all fields decrypt correctly
        val decrypted = encryptor.decryptRecord(record, kek)
        assertEquals("Very Secret Payee", decrypted["payee"])
        assertEquals("Classified Note", decrypted["note"])
        assertEquals("Secret Account", decrypted["account.name"])

        // After "shredding" (destroying the key): data is unrecoverable
        val destroyedKek = ByteArray(32) { 0 }
        val result = encryptor.decryptRecord(record, destroyedKek)
        assertTrue(result["payee"] != "Very Secret Payee", "Payee should be unrecoverable")
        assertTrue(result["note"] != "Classified Note", "Note should be unrecoverable")
        assertTrue(result["account.name"] != "Secret Account", "Account name should be unrecoverable")
        // amount_cents is cleartext, so it should still be readable
        assertEquals("999999", result["amount_cents"])
    }
}