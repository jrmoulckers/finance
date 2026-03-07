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
}