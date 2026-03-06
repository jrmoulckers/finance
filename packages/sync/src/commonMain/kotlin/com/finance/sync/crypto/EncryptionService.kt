package com.finance.sync.crypto

/**
 * Core encryption service interface for E2E encryption of financial data (#92).
 *
 * Implementations must use authenticated encryption (e.g. AES-256-GCM) to ensure
 * both confidentiality and integrity of sensitive financial fields.
 *
 * Platform-specific implementations are provided via expect/actual for
 * [PlatformKeyDerivation]; this interface is consumed by [FieldEncryptor] and
 * [EnvelopeEncryption] to encrypt/decrypt individual data fields.
 */
interface EncryptionService {

    /**
     * Encrypt [plaintext] with the given symmetric [key].
     *
     * Implementations must generate a fresh, cryptographically-random nonce
     * for every call and include it in the returned [EncryptedPayload].
     *
     * @param plaintext Raw bytes to encrypt.
     * @param key       Symmetric key (e.g. a DEK). Length must match the algorithm requirement.
     * @return An [EncryptedPayload] containing ciphertext, nonce, and algorithm identifier.
     * @throws IllegalArgumentException if [key] length is invalid.
     */
    fun encrypt(plaintext: ByteArray, key: ByteArray): EncryptedPayload

    /**
     * Decrypt an [EncryptedPayload] using the given symmetric [key].
     *
     * @param payload The [EncryptedPayload] produced by [encrypt].
     * @param key     The same symmetric key that was used to encrypt.
     * @return The original plaintext bytes.
     * @throws IllegalArgumentException if [key] length is invalid.
     * @throws IllegalStateException    if decryption or authentication fails.
     */
    fun decrypt(payload: EncryptedPayload, key: ByteArray): ByteArray
}