package com.finance.sync.crypto

import kotlinx.datetime.Instant

/**
 * Immutable certificate recording a crypto-shredding event (#96).
 *
 * Stored as part of the GDPR audit trail to prove that encryption keys
 * were destroyed, rendering the associated data permanently unreadable.
 * The certificate itself contains NO sensitive data -- only identifiers
 * and timestamps.
 *
 * @property id              Unique certificate identifier.
 * @property subjectType     What was shredded ("household" or "user").
 * @property subjectId       The household or user ID whose keys were destroyed.
 * @property destroyedAt     UTC timestamp of key destruction.
 * @property requestedBy     The user or system principal that initiated deletion.
 * @property keyFingerprints Fingerprints (hashes) of the destroyed keys, for
 *                           verification without revealing key material.
 * @property verified        Whether [CryptoShredder.verifyShredding] confirmed
 *                           that data is unrecoverable.
 */
data class DeletionCertificate(
    val id: String,
    val subjectType: SubjectType,
    val subjectId: String,
    val destroyedAt: Instant,
    val requestedBy: String,
    val keyFingerprints: List<String>,
    val verified: Boolean,
) {
    /** The type of entity whose keys were shredded. */
    enum class SubjectType {
        HOUSEHOLD,
        USER,
    }
}