// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

/**
 * Key rotation support for household KEKs (#94).
 *
 * When a member leaves a household, or on a periodic schedule, the household
 * KEK is rotated. This involves:
 *  1. Generating a new KEK.
 *  2. Re-encrypting (re-sharing) the new KEK to every remaining member.
 *  3. Re-wrapping all existing per-record DEKs with the new KEK.
 *
 * Note: re-wrapping DEKs does NOT require re-encrypting the underlying data,
 * because the DEKs themselves remain unchanged -- only their wrappers change.
 *
 * @property encryptionService Symmetric encryption primitive.
 * @property envelopeEncryption Envelope (DEK/KEK) helper.
 * @property householdKeyManager Household key manager for key sharing.
 */
class KeyRotation(
    private val encryptionService: EncryptionService,
    private val envelopeEncryption: EnvelopeEncryption,
    private val householdKeyManager: HouseholdKeyManager,
    private val randomProvider: RandomProvider = DefaultRandomProvider,
) {

    /**
     * Rotate the household KEK.
     *
     * Generates a new KEK, encrypts it for every member, and returns a
     * new [HouseholdKeyBundle].
     *
     * @param householdId The household whose key is being rotated.
     * @param oldKek      The current (outgoing) KEK -- needed to re-wrap existing DEKs.
     * @param members     List of member public keys who should receive the new KEK.
     * @return A pair of the new [HouseholdKeyBundle] and a list of per-member encrypted KEKs.
     */
    fun rotateHouseholdKey(
        householdId: String,
        oldKek: ByteArray,
        members: List<ByteArray>,
    ): RotationResult {
        require(members.isNotEmpty()) { "At least one member is required" }

        val newKek = randomProvider.nextBytes(HouseholdKeyManager.KEK_LENGTH_BYTES)

        // Encrypt the new KEK for each member
        val memberShares = members.map { memberPublicKey ->
            householdKeyManager.shareKey(newKek, memberPublicKey)
        }

        val bundle = HouseholdKeyBundle(
            householdId = householdId,
            encryptedKek = memberShares.first(),
            publicKey = members.first(),
            algorithm = HouseholdKeyManager.DEFAULT_ALGORITHM,
        )

        return RotationResult(
            newKek = newKek,
            bundle = bundle,
            memberShares = memberShares,
        )
    }

    /**
     * Re-encrypt (re-wrap) existing data with a new KEK.
     *
     * This unwraps each record's DEK with the old KEK and re-wraps it with the
     * new KEK. The underlying ciphertext is untouched -- only the DEK wrapper changes.
     *
     * @param oldKek The outgoing KEK.
     * @param newKek The incoming KEK.
     * @param wrappedDeks List of currently wrapped DEKs.
     * @return List of re-wrapped DEKs in the same order.
     */
    fun reWrapDeks(
        oldKek: ByteArray,
        newKek: ByteArray,
        wrappedDeks: List<ByteArray>,
    ): List<ByteArray> = wrappedDeks.map { wrappedDek ->
        val dek = envelopeEncryption.unwrapDEK(wrappedDek, oldKek)
        envelopeEncryption.wrapDEK(dek, newKek)
    }

    /**
     * Re-encrypt existing encrypted payloads with a new KEK.
     *
     * Decrypts each payload with [oldKek] and re-encrypts with [newKek].
     * This is the full-data re-encryption path used when the DEK/KEK separation
     * is not applicable (e.g. for directly-KEK-encrypted metadata).
     *
     * @param oldKek The outgoing KEK.
     * @param newKek The incoming KEK.
     * @param data   List of payloads encrypted with [oldKek].
     * @return List of payloads re-encrypted with [newKek].
     */
    fun reEncryptData(
        oldKek: ByteArray,
        newKek: ByteArray,
        data: List<EncryptedPayload>,
    ): List<EncryptedPayload> = data.map { payload ->
        val plaintext = encryptionService.decrypt(payload, oldKek)
        encryptionService.encrypt(plaintext, newKek)
    }

    /**
     * Result of a key rotation operation.
     *
     * @property newKek       The new plaintext KEK (handle securely!).
     * @property bundle       The [HouseholdKeyBundle] for the primary member.
     * @property memberShares Per-member encrypted copies of the new KEK.
     */
    data class RotationResult(
        val newKek: ByteArray,
        val bundle: HouseholdKeyBundle,
        val memberShares: List<ByteArray>,
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other == null || other !is RotationResult) return false
            return newKek.contentEquals(other.newKek) &&
                bundle == other.bundle &&
                memberShares.size == other.memberShares.size &&
                memberShares.zip(other.memberShares).all { (a, b) -> a.contentEquals(b) }
        }

        override fun hashCode(): Int {
            var result = newKek.contentHashCode()
            result = 31 * result + bundle.hashCode()
            result = 31 * result + memberShares.hashCode()
            return result
        }
    }
}