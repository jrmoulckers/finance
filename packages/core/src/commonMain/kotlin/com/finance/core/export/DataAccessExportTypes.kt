// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.models.*
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.plus
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** Schema version for GDPR/CCPA data access ZIP packages. */
const val DATA_ACCESS_PACKAGE_SCHEMA_VERSION: String = "1.0"

/** Domains that must be represented in every data access package. */
enum class DataAccessDomain(val fileName: String, val description: String) {
    TRANSACTIONS("transactions.json", "Transactions with full detail owned by the requesting user"),
    ACCOUNTS("accounts.json", "Accounts and balances owned by the requesting user"),
    BUDGETS("budgets.json", "Budgets and rollover configuration"),
    GOALS("goals.json", "Savings goals and progress"),
    RECURRING_RULES("recurring_rules.json", "Recurring transaction rules"),
    CATEGORIES("categories.json", "Categories, including protected categories unless opted out"),
    TAGS("tags.json", "Transaction tags derived from exported transactions"),
    ATTACHMENTS("attachments.json", "Receipt and attachment metadata with binary file references"),
    PREFERENCES("preferences.json", "User-facing preferences"),
    SETTINGS("settings.json", "Application settings"),
    AUDIT_LOG("audit_log.json", "Audit events for the requesting user's own actions"),
    SYNC_METADATA("sync_metadata.json", "Device and last-sync metadata"),
    MOOD_TAGS("mood_tags.json", "Mood tag records included only when explicitly requested"),
}

/** Request-time options that control privacy-sensitive data inclusion. */
data class DataAccessRequestOptions(
    val appVersion: String,
    val localeTag: String = "en",
    val includeProtectedCategories: Boolean = true,
    val protectedCategoryMetadataAvailable: Boolean = false,
    val includeMoodTags: Boolean = false,
    val expirationDays: Int = 7,
    val generatedAt: Instant,
) {
    init {
        require(appVersion.isNotBlank()) { "appVersion cannot be blank" }
        require(expirationDays > 0) { "expirationDays must be positive" }
    }

    /** Timestamp at which the package should be deleted from in-app storage. */
    val expiresAt: Instant = generatedAt.plus(expirationDays, kotlinx.datetime.DateTimeUnit.DAY, TimeZone.UTC)
}

/** A flexible JSON record used for domains that are not yet shared KMP models. */
@Serializable
data class DataAccessJsonRecord(
    val fields: JsonObject,
)

/** Receipt or attachment included in the data access package. */
data class DataAccessAttachment(
    val id: String,
    val fileName: String,
    val contentType: String,
    val bytes: ByteArray? = null,
    val signedUrl: String? = null,
) {
    init {
        require(id.isNotBlank()) { "Attachment id cannot be blank" }
        require(fileName.isNotBlank()) { "Attachment fileName cannot be blank" }
        require(contentType.isNotBlank()) { "Attachment contentType cannot be blank" }
        require(bytes != null || !signedUrl.isNullOrBlank()) {
            "Attachment must provide local bytes or a signed URL reference"
        }
    }
}

/** All user-owned local data available to the GDPR/CCPA package generator. */
data class DataAccessExportData(
    val accounts: List<Account> = emptyList(),
    val transactions: List<Transaction> = emptyList(),
    val budgets: List<Budget> = emptyList(),
    val goals: List<Goal> = emptyList(),
    val categories: List<Category> = emptyList(),
    val recurringRules: List<DataAccessJsonRecord> = emptyList(),
    val preferences: List<DataAccessJsonRecord> = emptyList(),
    val settings: List<DataAccessJsonRecord> = emptyList(),
    val auditLog: List<DataAccessJsonRecord> = emptyList(),
    val syncMetadata: List<DataAccessJsonRecord> = emptyList(),
    val attachments: List<DataAccessAttachment> = emptyList(),
    val moodTags: List<DataAccessJsonRecord> = emptyList(),
) {
    /** Unique transaction tags represented as their own export domain. */
    val tags: List<String> = transactions.flatMap { it.tags }.distinct().sorted()
}

/** One file generated before ZIP packaging. */
data class GeneratedPackageFile(
    val path: String,
    val bytes: ByteArray,
    val contentType: String,
)

/** Completed data access package ready for platform share-sheet delivery. */
data class DataAccessPackageResult(
    val fileName: String,
    val zipBytes: ByteArray,
    val files: List<GeneratedPackageFile>,
    val manifest: DataAccessManifest,
)

/** Manifest describing the ZIP contents, retention, and privacy-sensitive options. */
@Serializable
data class DataAccessManifest(
    @SerialName("schema_version") val schemaVersion: String,
    @SerialName("generated_at") val generatedAt: String,
    @SerialName("expires_at") val expiresAt: String,
    @SerialName("app_version") val appVersion: String,
    @SerialName("locale") val locale: String,
    @SerialName("contents") val contents: List<DataAccessManifestEntry>,
    @SerialName("privacy") val privacy: DataAccessPrivacyManifest,
    @SerialName("coordination_notes") val coordinationNotes: List<String> = emptyList(),
)

/** Per-file inventory entry in [DataAccessManifest]. */
@Serializable
data class DataAccessManifestEntry(
    val domain: String,
    val path: String,
    @SerialName("content_type") val contentType: String,
    @SerialName("record_count") val recordCount: Int,
    @SerialName("schema_version") val schemaVersion: String,
    val description: String,
)

/** Privacy-sensitive request-time choices recorded in the manifest. */
@Serializable
data class DataAccessPrivacyManifest(
    @SerialName("protected_categories_included") val protectedCategoriesIncluded: Boolean,
    @SerialName("mood_tags_included") val moodTagsIncluded: Boolean,
    @SerialName("available_on_request") val availableOnRequest: List<String>,
    @SerialName("household_scope") val householdScope: String,
)

/** Retention helper for 7-day auto-delete and 24-hour warning UX. */
object DataAccessPackageRetention {
    /** Returns true once the package is at or past its expiration timestamp. */
    fun shouldAutoDelete(now: Instant, expiresAt: Instant): Boolean = now >= expiresAt

    /** Returns true during the final 24 hours before expiration. */
    fun shouldWarnWithin24Hours(now: Instant, expiresAt: Instant): Boolean {
        val warningStartsAt = expiresAt.plus(-1, kotlinx.datetime.DateTimeUnit.DAY, TimeZone.UTC)
        return now >= warningStartsAt && now < expiresAt
    }
}

/** Test seam used to prove package generation does not initiate HTTP egress. */
fun interface NetworkEgressProbe {
    /** Called by code that attempts HTTP egress; package generation must never call this. */
    fun recordHttpAttempt(url: String)
}
