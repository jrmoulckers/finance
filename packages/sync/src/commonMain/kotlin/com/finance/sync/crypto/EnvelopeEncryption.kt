package com.finance.sync.crypto

/**
 * Envelope encryption utilities for the DEK/KEK pattern (#92).
 *
 * Each sync record is encrypted with its own random Data Encryption Key (DEK).
 * The DEK is then "wrapped" (encrypted) with the household's Key Encryption Key
 * (KEK) so that:
 *  - Compromising one record's DEK does not expose other records.
 *  - Key rotation only requires re-wrapping DEKs, not re-encrypting all data.
 *
 * @property encryptionService The [EncryptionService] used for wrap/unwrap operations.
 */
class EnvelopeEncryption(
    private val encryptionService: EncryptionService,
    private val randomProvider: RandomProvider = DefaultRandomProvider,
) {

    companion object {
        /** DEK length in bytes (256-bit). */
        const val DEK_LENGTH_BYTES: Int = 32
    }

    /**
     * Generate a cryptographically random Data Encryption Key.
     *
     * @return A new [DEK_LENGTH_BYTES]-byte random key.
     */
    fun generateDEK(): ByteArray = randomProvider.nextBytes(DEK_LENGTH_BYTES)

    /**
     * Wrap (encrypt) a [dek] with the household [kek].
     *
     * @param dek The Data Encryption Key to protect.
     * @param kek The Key Encryption Key (household KEK).
     * @return The encrypted DEK bytes (serialized as `[4-byte nonce length][nonce][ciphertext]`).
     */
    fun wrapDEK(dek: ByteArray, kek: ByteArray): ByteArray {
        val payload = encryptionService.encrypt(dek, kek)
        val nonceLen = payload.nonce.size
        return byteArrayOf(
            (nonceLen shr 24 and 0xFF).toByte(),
            (nonceLen shr 16 and 0xFF).toByte(),
            (nonceLen shr 8 and 0xFF).toByte(),
            (nonceLen and 0xFF).toByte(),
        ) + payload.nonce + payload.ciphertext
    }

    /**
     * Unwrap (decrypt) a previously wrapped DEK.
     *
     * @param wrappedDek The output of [wrapDEK].
     * @param kek        The same household KEK used to wrap.
     * @return The original DEK bytes.
     */
    fun unwrapDEK(wrappedDek: ByteArray, kek: ByteArray): ByteArray {
        require(wrappedDek.size > 4) { "Wrapped DEK too short" }
        val nonceLen =
            ((wrappedDek[0].toInt() and 0xFF) shl 24) or
            ((wrappedDek[1].toInt() and 0xFF) shl 16) or
            ((wrappedDek[2].toInt() and 0xFF) shl 8) or
            (wrappedDek[3].toInt() and 0xFF)
        require(wrappedDek.size > 4 + nonceLen) { "Wrapped DEK is malformed" }
        val nonce = wrappedDek.copyOfRange(4, 4 + nonceLen)
        val ciphertext = wrappedDek.copyOfRange(4 + nonceLen, wrappedDek.size)
        val payload = EncryptedPayload(
            ciphertext = ciphertext,
            nonce = nonce,
            algorithm = "AES-256-GCM",
        )
        return encryptionService.decrypt(payload, kek)
    }
}