// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * Tests for [FieldEncryptor] (#92).
 *
 * Verifies that:
 *  - Sensitive fields (payee, note, account.name) are encrypted.
 *  - Non-sensitive fields (amount_cents, date, category_id) remain readable.
 *  - Encrypt-then-decrypt round-trips correctly.
 */
class FieldEncryptorTest {

    private val crypto = TestCryptoProvider()
    private val random = TestRandomProvider()
    private val envelope = EnvelopeEncryption(crypto, random)
    private val encryptor = FieldEncryptor(crypto, envelope)

    /** A 32-byte test KEK. */
    private val testKek = ByteArray(32) { (it + 1).toByte() }

    private val sampleRecord = mapOf(
        "payee" to "Acme Corp",
        "note" to "Invoice #1234",
        "account.name" to "Checking Account",
        "amount_cents" to "150000",
        "date" to "2025-01-15",
        "category_id" to "cat-groceries",
    )

    @Test
    fun sensitiveFieldsAreEncrypted() {
        val result = encryptor.encryptRecord(sampleRecord, testKek)

        // Sensitive fields must appear in encryptedFields, not cleartextFields
        assertTrue(result.encryptedFields.containsKey("payee"))
        assertTrue(result.encryptedFields.containsKey("note"))
        assertTrue(result.encryptedFields.containsKey("account.name"))

        // Their ciphertext must differ from plaintext
        val payeeCipher = result.encryptedFields["payee"]!!.ciphertext
        assertNotEquals(
            "Acme Corp",
            payeeCipher.decodeToString(),
            "payee should be encrypted",
        )
    }

    @Test
    fun nonSensitiveFieldsRemainReadable() {
        val result = encryptor.encryptRecord(sampleRecord, testKek)

        assertEquals("150000", result.cleartextFields["amount_cents"])
        assertEquals("2025-01-15", result.cleartextFields["date"])
        assertEquals("cat-groceries", result.cleartextFields["category_id"])
    }

    @Test
    fun encryptThenDecryptRoundTrips() {
        val encrypted = encryptor.encryptRecord(sampleRecord, testKek)
        val decrypted = encryptor.decryptRecord(encrypted, testKek)

        for ((key, value) in sampleRecord) {
            assertEquals(value, decrypted[key], "Field 'key' should round-trip")
        }
    }

    @Test
    fun sensitiveFieldsNotInCleartext() {
        val result = encryptor.encryptRecord(sampleRecord, testKek)

        assertTrue(
            "payee" !in result.cleartextFields,
            "payee must not appear in cleartext",
        )
        assertTrue(
            "note" !in result.cleartextFields,
            "note must not appear in cleartext",
        )
        assertTrue(
            "account.name" !in result.cleartextFields,
            "account.name must not appear in cleartext",
        )
    }

    @Test
    fun encryptedRecordContainsWrappedDek() {
        val result = encryptor.encryptRecord(sampleRecord, testKek)
        assertTrue(result.wrappedDek.isNotEmpty(), "wrappedDek must be present")
    }

    @Test
    fun differentRecordsGetDifferentDeks() {
        val random1 = TestRandomProvider(seed = 100)
        val random2 = TestRandomProvider(seed = 200)
        val env1 = EnvelopeEncryption(crypto, random1)
        val env2 = EnvelopeEncryption(crypto, random2)
        val enc1 = FieldEncryptor(crypto, env1)
        val enc2 = FieldEncryptor(crypto, env2)

        val result1 = enc1.encryptRecord(sampleRecord, testKek)
        val result2 = enc2.encryptRecord(sampleRecord, testKek)

        assertTrue(
            !result1.wrappedDek.contentEquals(result2.wrappedDek),
            "Each record should have a unique DEK",
        )
    }

    // =========================================================================
    // Different inputs → different ciphertexts
    // =========================================================================

    @Test
    fun differentInputsProduceDifferentCiphertexts() {
        val record1 = mapOf("payee" to "Vendor Alpha", "amount_cents" to "100")
        val record2 = mapOf("payee" to "Vendor Beta", "amount_cents" to "100")

        val enc1 = FieldEncryptor(crypto, EnvelopeEncryption(crypto, TestRandomProvider(seed = 1)))
        val enc2 = FieldEncryptor(crypto, EnvelopeEncryption(crypto, TestRandomProvider(seed = 1)))

        val result1 = enc1.encryptRecord(record1, testKek)
        val result2 = enc2.encryptRecord(record2, testKek)

        val cipher1 = result1.encryptedFields["payee"]!!.ciphertext
        val cipher2 = result2.encryptedFields["payee"]!!.ciphertext

        assertTrue(
            !cipher1.contentEquals(cipher2),
            "Different plaintext inputs should produce different ciphertexts",
        )
    }

    // =========================================================================
    // Decryption with wrong key produces incorrect data
    // =========================================================================

    @Test
    fun decryptionWithWrongKeyProducesGarbage() {
        val encrypted = encryptor.encryptRecord(sampleRecord, testKek)
        val wrongKek = ByteArray(32) { 0xFF.toByte() }

        // With XOR-based test crypto, wrong key produces different (garbage) output
        val result = encryptor.decryptRecord(encrypted, wrongKek)
        assertNotEquals(
            "Acme Corp",
            result["payee"],
            "Decryption with wrong key should not produce original plaintext",
        )
    }

    @Test
    fun decryptionWithWrongKeyDoesNotMatchAnyOriginalField() {
        val encrypted = encryptor.encryptRecord(sampleRecord, testKek)
        val wrongKek = ByteArray(32) { 0xAB.toByte() }

        val result = encryptor.decryptRecord(encrypted, wrongKek)

        // Every sensitive field should differ from original
        for (fieldName in FieldEncryptor.DEFAULT_SENSITIVE_FIELDS) {
            val original = sampleRecord[fieldName] ?: continue
            assertNotEquals(
                original,
                result[fieldName],
                "Field '$fieldName' should not match original when decrypted with wrong key",
            )
        }

        // Non-sensitive fields should still be correct (they're in cleartext)
        assertEquals("150000", result["amount_cents"])
        assertEquals("2025-01-15", result["date"])
    }

    // =========================================================================
    // Custom sensitive fields configuration
    // =========================================================================

    @Test
    fun customSensitiveFieldsAreRespected() {
        val customFields = setOf("amount_cents")
        val customEncryptor = FieldEncryptor(crypto, envelope, customFields)

        val result = customEncryptor.encryptRecord(sampleRecord, testKek)

        // amount_cents should now be encrypted
        assertTrue(
            result.encryptedFields.containsKey("amount_cents"),
            "Custom sensitive field 'amount_cents' should be encrypted",
        )
        // payee should now be in cleartext (not in custom set)
        assertTrue(
            result.cleartextFields.containsKey("payee"),
            "Non-custom field 'payee' should be in cleartext",
        )
    }

    @Test
    fun emptyFieldsMapProducesEmptyResult() {
        val result = encryptor.encryptRecord(emptyMap(), testKek)

        assertTrue(result.encryptedFields.isEmpty(), "No encrypted fields for empty input")
        assertTrue(result.cleartextFields.isEmpty(), "No cleartext fields for empty input")
        assertTrue(result.wrappedDek.isNotEmpty(), "DEK should still be generated")
    }

    @Test
    fun onlyNonSensitiveFieldsProducesNoCiphertexts() {
        val nonSensitiveOnly = mapOf(
            "amount_cents" to "5000",
            "date" to "2025-06-15",
        )

        val result = encryptor.encryptRecord(nonSensitiveOnly, testKek)

        assertTrue(result.encryptedFields.isEmpty(), "No sensitive fields to encrypt")
        assertEquals(2, result.cleartextFields.size)
        assertEquals("5000", result.cleartextFields["amount_cents"])
    }

    @Test
    fun onlySensitiveFieldsProducesNoCleartext() {
        val sensitiveOnly = mapOf(
            "payee" to "Secret Corp",
            "note" to "Confidential",
        )

        val result = encryptor.encryptRecord(sensitiveOnly, testKek)

        assertTrue(result.cleartextFields.isEmpty(), "No cleartext fields")
        assertEquals(2, result.encryptedFields.size)
    }

    @Test
    fun encryptedRecordEquality() {
        // Same inputs with same random provider should produce equal records
        val r1 = TestRandomProvider(seed = 0)
        val r2 = TestRandomProvider(seed = 0)
        val c1 = TestCryptoProvider()
        val c2 = TestCryptoProvider()

        val enc1 = FieldEncryptor(c1, EnvelopeEncryption(c1, r1))
        val enc2 = FieldEncryptor(c2, EnvelopeEncryption(c2, r2))

        val result1 = enc1.encryptRecord(sampleRecord, testKek)
        val result2 = enc2.encryptRecord(sampleRecord, testKek)

        assertEquals(result1, result2, "Identical inputs and random state should produce equal records")
    }
}