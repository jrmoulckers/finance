package com.finance.sync.crypto

/**
 * Manages household Key Encryption Keys (KEKs) for multi-member households (#94).
 *
 * Each household has a single symmetric KEK that protects all per-record DEKs.
 * When a new member joins, the KEK is asymmetrically encrypted to their public
 * key so they can decrypt it locally. This avoids transmitting the KEK in the
 * clear and ensures only authorised members can access household data.
 *
 * NOTE: In this initial implementation the asymmetric layer is modelled with
 * symmetric encryption (using the public/private key material as a symmetric key).
 * Platform-specific asymmetric crypto (X25519 + sealed box) will replace this
 * when the platform app modules are implemented.
 *
 * @property encryptionService Symmetric encryption for KEK generation and wrapping.
 * @property randomProvider    CSPRNG for key generation.
 */
class HouseholdKeyManager(
    private val encryptionService: EncryptionService,
    private val randomProvider: RandomProvider = DefaultRandomProvider,
) {

    companion object {
        /** KEK length in bytes (256-bit). */
        const val KEK_LENGTH_BYTES: Int = 32

        /** Default asymmetric algorithm identifier. */
        const val DEFAULT_ALGORITHM: String = "X25519+AES-256-GCM"

        /** Standard nonce length for AES-256-GCM in bytes. */
        const val NONCE_LENGTH: Int = 12
    }

    /**
     * Create a new household KEK and bundle it for the founding member.
     *
     * In a production implementation the KEK would be asymmetrically encrypted
     * to the creator's public key. Here we model the intent and use the
     * symmetric [EncryptionService] as a stand-in until platform asymmetric
     * primitives are available.
     *
     * @param householdId      A unique household identifier.
     * @param creatorPublicKey The founding member's public key material.
     * @return A [HouseholdKeyBundle] containing the encrypted KEK.
     */
    fun createHouseholdKey(
        householdId: String,
        creatorPublicKey: ByteArray,
    ): HouseholdKeyBundle {
        val kek = randomProvider.nextBytes(KEK_LENGTH_BYTES)
        val encryptedKek = encryptionService.encrypt(kek, creatorPublicKey)
        return HouseholdKeyBundle(
            householdId = householdId,
            encryptedKek = encryptedKek.nonce + encryptedKek.ciphertext,
            publicKey = creatorPublicKey,
            algorithm = DEFAULT_ALGORITHM,
        )
    }

    /**
     * Encrypt an existing household KEK for a new member.
     *
     * @param kek               The plaintext household KEK.
     * @param recipientPublicKey The new member's public key.
     * @return Opaque bytes that only the recipient can decrypt with their private key.
     */
    fun shareKey(kek: ByteArray, recipientPublicKey: ByteArray): ByteArray {
        val payload = encryptionService.encrypt(kek, recipientPublicKey)
        return payload.nonce + payload.ciphertext
    }

    /**
     * Decrypt a shared household KEK using the recipient's private key.
     *
     * @param encryptedKek The bytes produced by [shareKey].
     * @param privateKey   The recipient's private key material.
     * @return The plaintext household KEK.
     */
    fun receiveKey(encryptedKek: ByteArray, privateKey: ByteArray): ByteArray {
        require(encryptedKek.size > NONCE_LENGTH) { "Encrypted KEK too short" }
        val nonce = encryptedKek.copyOfRange(0, NONCE_LENGTH)
        val ciphertext = encryptedKek.copyOfRange(NONCE_LENGTH, encryptedKek.size)
        val payload = EncryptedPayload(
            ciphertext = ciphertext,
            nonce = nonce,
            algorithm = DEFAULT_ALGORITHM,
        )
        return encryptionService.decrypt(payload, privateKey)
    }
}