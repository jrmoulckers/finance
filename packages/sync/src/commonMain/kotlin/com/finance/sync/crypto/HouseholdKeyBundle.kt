// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.crypto

/**
 * Bundle representing a household's encryption key material (#94).
 *
 * Created when a new household is provisioned or when keys are rotated.
 * The [encryptedKek] is encrypted to the creating member's public key
 * so only they can unwrap it; additional members receive their own copy
 * via [HouseholdKeyManager.shareKey].
 *
 * @property householdId  Unique identifier for the household.
 * @property encryptedKek The KEK encrypted to the creator's public key.
 * @property publicKey    The creator's public key (for key-agreement / verification).
 * @property algorithm    The asymmetric algorithm used (e.g. "X25519+AES-256-GCM").
 */
data class HouseholdKeyBundle(
    val householdId: String,
    val encryptedKek: ByteArray,
    val publicKey: ByteArray,
    val algorithm: String,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other == null || other !is HouseholdKeyBundle) return false
        return householdId == other.householdId &&
            encryptedKek.contentEquals(other.encryptedKek) &&
            publicKey.contentEquals(other.publicKey) &&
            algorithm == other.algorithm
    }

    override fun hashCode(): Int {
        var result = householdId.hashCode()
        result = 31 * result + encryptedKek.contentHashCode()
        result = 31 * result + publicKey.contentHashCode()
        result = 31 * result + algorithm.hashCode()
        return result
    }
}