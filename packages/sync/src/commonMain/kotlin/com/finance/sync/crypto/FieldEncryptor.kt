// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

/**
 * Encrypts and decrypts specific fields on sync entities (#92).
 *
 * Only sensitive fields are encrypted; non-sensitive fields (needed for queries
 * such as `amount_cents`, `date`, `category_id`) are left in the clear so the
 * backend can index and filter them without accessing plaintext PII.
 *
 * Uses **envelope encryption**: each record gets its own random DEK, which is
 * wrapped with the household KEK. This allows key rotation without re-encrypting
 * every record's data -- only the DEK wrappers need to be updated.
 *
 * @property encryptionService The symmetric encryption primitive.
 * @property envelopeEncryption The DEK/KEK envelope helper.
 * @property sensitiveFields The set of field names that must be encrypted.
 */
class FieldEncryptor(
    private val encryptionService: EncryptionService,
    private val envelopeEncryption: EnvelopeEncryption,
    private val sensitiveFields: Set<String> = DEFAULT_SENSITIVE_FIELDS,
) {

    companion object {
        /**
         * Default set of fields classified as sensitive PII / financial data.
         * These are encrypted at rest; everything else remains queryable.
         */
        val DEFAULT_SENSITIVE_FIELDS: Set<String> = setOf(
            "payee",
            "note",
            "account.name",
        )

        /**
         * Fields that are explicitly left in the clear for server-side queries.
         * Listed here for documentation / audit purposes.
         */
        val QUERYABLE_FIELDS: Set<String> = setOf(
            "amount_cents",
            "date",
            "category_id",
        )
    }

    /**
     * Result of encrypting a record's sensitive fields.
     *
     * @property encryptedFields Map of field name to [EncryptedPayload] for sensitive fields.
     * @property cleartextFields Map of field name to original value for non-sensitive fields.
     * @property wrappedDek      The per-record DEK, wrapped with the household KEK.
     */
    data class EncryptedRecord(
        val encryptedFields: Map<String, EncryptedPayload>,
        val cleartextFields: Map<String, String>,
        val wrappedDek: ByteArray,
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other == null || other !is EncryptedRecord) return false
            return encryptedFields == other.encryptedFields &&
                cleartextFields == other.cleartextFields &&
                wrappedDek.contentEquals(other.wrappedDek)
        }

        override fun hashCode(): Int {
            var result = encryptedFields.hashCode()
            result = 31 * result + cleartextFields.hashCode()
            result = 31 * result + wrappedDek.contentHashCode()
            return result
        }
    }

    /**
     * Encrypt a record's fields using envelope encryption.
     *
     * @param fields Map of field name to plaintext value.
     * @param kek    The household Key Encryption Key.
     * @return An [EncryptedRecord] with sensitive fields encrypted and a wrapped DEK.
     */
    fun encryptRecord(fields: Map<String, String>, kek: ByteArray): EncryptedRecord {
        val dek = envelopeEncryption.generateDEK()
        val wrappedDek = envelopeEncryption.wrapDEK(dek, kek)

        val encrypted = mutableMapOf<String, EncryptedPayload>()
        val cleartext = mutableMapOf<String, String>()

        for ((name, value) in fields) {
            if (name in sensitiveFields) {
                encrypted[name] = encryptionService.encrypt(
                    plaintext = value.encodeToByteArray(),
                    key = dek,
                )
            } else {
                cleartext[name] = value
            }
        }

        return EncryptedRecord(
            encryptedFields = encrypted,
            cleartextFields = cleartext,
            wrappedDek = wrappedDek,
        )
    }

    /**
     * Decrypt a previously encrypted record.
     *
     * @param record The [EncryptedRecord] to decrypt.
     * @param kek    The household KEK that was used to wrap the DEK.
     * @return A flat map of field name to plaintext value (all fields merged).
     */
    fun decryptRecord(record: EncryptedRecord, kek: ByteArray): Map<String, String> {
        val dek = envelopeEncryption.unwrapDEK(record.wrappedDek, kek)

        val result = mutableMapOf<String, String>()
        result.putAll(record.cleartextFields)

        for ((name, payload) in record.encryptedFields) {
            val plainBytes = encryptionService.decrypt(payload, dek)
            result[name] = plainBytes.decodeToString()
        }

        return result
    }
}