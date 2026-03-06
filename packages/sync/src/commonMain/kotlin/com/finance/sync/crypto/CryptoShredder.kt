package com.finance.sync.crypto

import kotlinx.datetime.Clock
import kotlinx.datetime.Instant

/**
 * Crypto-shredding service for GDPR-compliant data deletion (#96).
 *
 * Instead of attempting to locate and scrub every copy of personal data
 * (which is error-prone in distributed systems), crypto-shredding destroys
 * the encryption keys. Without the keys the ciphertext is computationally
 * indistinguishable from random noise, satisfying GDPR Art. 17 ("right
 * to erasure").
 *
 * This class coordinates with a [KeyStore] abstraction to destroy keys and
 * issues [DeletionCertificate]s as an auditable record of the operation.
 *
 * @property keyStore  Persistent store of encryption keys.
 * @property clock     Time source (injectable for testing).
 */
class CryptoShredder(
    private val keyStore: KeyStore,
    private val clock: Clock = Clock.System,
) {

    /**
     * Destroy all KEKs and DEKs associated with [householdId].
     *
     * After this operation, every record encrypted under the household's KEK
     * is permanently unreadable.
     *
     * @param householdId The household to shred.
     * @param requestedBy The principal requesting deletion (for audit trail).
     * @return A [DeletionCertificate] recording the event.
     */
    fun shredHouseholdData(householdId: String, requestedBy: String): DeletionCertificate {
        val fingerprints = keyStore.destroyHouseholdKeys(householdId)
        val now = clock.now()
        val verified = verifyShredding(householdId)

        return DeletionCertificate(
            id = generateCertificateId(now),
            subjectType = DeletionCertificate.SubjectType.HOUSEHOLD,
            subjectId = householdId,
            destroyedAt = now,
            requestedBy = requestedBy,
            keyFingerprints = fingerprints,
            verified = verified,
        )
    }

    /**
     * Destroy all personal encryption keys for [userId].
     *
     * This covers the user's personal key-pair and any key material
     * that is exclusively theirs (not shared household keys, which
     * are handled by [shredHouseholdData]).
     *
     * @param userId      The user whose keys should be destroyed.
     * @param requestedBy The principal requesting deletion.
     * @return A [DeletionCertificate] recording the event.
     */
    fun shredUserData(userId: String, requestedBy: String): DeletionCertificate {
        val fingerprints = keyStore.destroyUserKeys(userId)
        val now = clock.now()
        val verified = !keyStore.hasKeysForUser(userId)

        return DeletionCertificate(
            id = generateCertificateId(now),
            subjectType = DeletionCertificate.SubjectType.USER,
            subjectId = userId,
            destroyedAt = now,
            requestedBy = requestedBy,
            keyFingerprints = fingerprints,
            verified = verified,
        )
    }

    /**
     * Verify that all keys for [householdId] have been destroyed
     * and encrypted data is unrecoverable.
     *
     * @return `true` if no keys remain for the household.
     */
    fun verifyShredding(householdId: String): Boolean =
        !keyStore.hasKeysForHousehold(householdId)

    private fun generateCertificateId(timestamp: Instant): String =
        "cert-" + timestamp.toEpochMilliseconds().toString(36)
}

/**
 * Abstraction over the persistent key storage layer.
 *
 * Implementations are platform-specific (Keychain on iOS, KeyStore on Android/JVM,
 * IndexedDB + WebCrypto on JS) and are responsible for secure storage and
 * irrecoverable deletion of key material.
 */
interface KeyStore {
    /**
     * Destroy all keys associated with [householdId].
     * @return Fingerprints (hex-encoded hashes) of the destroyed keys.
     */
    fun destroyHouseholdKeys(householdId: String): List<String>

    /**
     * Destroy all keys associated with [userId].
     * @return Fingerprints of the destroyed keys.
     */
    fun destroyUserKeys(userId: String): List<String>

    /** @return `true` if any keys for [householdId] still exist. */
    fun hasKeysForHousehold(householdId: String): Boolean

    /** @return `true` if any keys for [userId] still exist. */
    fun hasKeysForUser(userId: String): Boolean
}