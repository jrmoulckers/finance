// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

/**
 * Validates that exported content complies with GDPR data minimization
 * principles and the project's privacy policy.
 *
 * ## Rules enforced
 * 1. **No sync metadata** — `syncVersion` and `isSynced` must never appear
 *    in export output. These are internal implementation details.
 * 2. **User ID anonymization** — raw user IDs must be SHA-256 hashed.
 *    The export should contain `sha256:` prefixed hashes only.
 * 3. **No internal-only fields** — fields like `sync_version`, `is_synced`
 *    must be stripped by the [ExportSerializer].
 *
 * This validator is designed to be run in tests (and optionally as a
 * CI lint step) against serialized export output to catch regressions.
 *
 * Usage:
 * ```
 * val result = DataExportService.export(data, serializer, userId, appVersion)
 * if (result is ExportOutcome.Success) {
 *     val violations = ExportComplianceValidator.validate(result.export)
 *     check(violations.isEmpty()) { "GDPR violations: $violations" }
 * }
 * ```
 */
object ExportComplianceValidator {

    /**
     * Fields that must never appear in export output.
     *
     * These are checked as case-insensitive substrings. The serializers
     * use `@SerialName` / column headers that should not match these.
     */
    private val PROHIBITED_FIELD_PATTERNS = listOf(
        "syncVersion",
        "sync_version",
        "isSynced",
        "is_synced",
    )

    /**
     * Validates the export content for GDPR compliance.
     *
     * @param exportResult The completed export result to validate.
     * @return A list of [ComplianceViolation]s found. Empty list means compliant.
     */
    fun validate(exportResult: ExportResult): List<ComplianceViolation> {
        val violations = mutableListOf<ComplianceViolation>()

        // Rule 1: No sync metadata fields
        for (pattern in PROHIBITED_FIELD_PATTERNS) {
            if (exportResult.content.contains(pattern, ignoreCase = false)) {
                violations.add(
                    ComplianceViolation.ProhibitedFieldPresent(
                        fieldName = pattern,
                        detail = "Sync-internal field '$pattern' found in ${exportResult.format.name} export output",
                    ),
                )
            }
        }

        // Rule 2: User ID hash must be present and properly formatted
        val metadata = exportResult.metadata
        if (!metadata.userIdHash.startsWith("sha256:")) {
            violations.add(
                ComplianceViolation.UserIdNotAnonymized(
                    detail = "userIdHash does not start with 'sha256:' prefix: ${metadata.userIdHash.take(20)}...",
                ),
            )
        } else {
            val hexPart = metadata.userIdHash.removePrefix("sha256:")
            if (hexPart.length != 64 || !hexPart.all { it in '0'..'9' || it in 'a'..'f' }) {
                violations.add(
                    ComplianceViolation.UserIdNotAnonymized(
                        detail = "userIdHash SHA-256 portion is not a valid 64-char hex string",
                    ),
                )
            }
        }

        // Rule 3: Checksum must be present and valid
        if (exportResult.checksum.length != 64 ||
            !exportResult.checksum.all { it in '0'..'9' || it in 'a'..'f' }
        ) {
            violations.add(
                ComplianceViolation.InvalidChecksum(
                    detail = "Checksum is not a valid 64-char hex SHA-256 digest",
                ),
            )
        }

        // Rule 4: Verify checksum matches content
        val expectedChecksum = Sha256.hexDigest(exportResult.content)
        if (exportResult.checksum != expectedChecksum) {
            violations.add(
                ComplianceViolation.ChecksumMismatch(
                    expected = expectedChecksum,
                    actual = exportResult.checksum,
                ),
            )
        }

        return violations
    }
}

/**
 * Sealed hierarchy of compliance violations found during export validation.
 */
sealed class ComplianceViolation(val message: String) {

    /** A sync-internal field was found in the export output. */
    data class ProhibitedFieldPresent(
        val fieldName: String,
        val detail: String,
    ) : ComplianceViolation("Prohibited field: $detail")

    /** The user ID in metadata is not properly SHA-256 anonymized. */
    data class UserIdNotAnonymized(
        val detail: String,
    ) : ComplianceViolation("User ID not anonymized: $detail")

    /** The integrity checksum is not a valid format. */
    data class InvalidChecksum(
        val detail: String,
    ) : ComplianceViolation("Invalid checksum: $detail")

    /** The checksum doesn't match the content. */
    data class ChecksumMismatch(
        val expected: String,
        val actual: String,
    ) : ComplianceViolation("Checksum mismatch: expected=$expected, actual=$actual")
}
