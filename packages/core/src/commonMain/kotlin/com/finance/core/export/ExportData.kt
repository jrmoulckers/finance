// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.models.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Container for all financial data to be exported.
 *
 * Callers construct this by querying SQLDelight DAOs for each entity type.
 * All records should already be filtered (`deleted_at IS NULL`) by the queries —
 * the export pipeline does **not** perform soft-delete filtering.
 *
 * Sync-internal fields (`syncVersion`, `isSynced`) are present on the domain
 * models but must be stripped by the [ExportSerializer] implementation during
 * serialization — callers pass the full domain objects unchanged.
 *
 * Usage:
 * ```
 * val data = ExportData(
 *     accounts = accountDao.selectActive(),
 *     transactions = transactionDao.selectAll(),
 *     categories = categoryDao.selectAll(),
 *     budgets = budgetDao.selectActive(),
 *     goals = goalDao.selectActive(),
 * )
 * ```
 */
@Serializable
data class ExportData(
    /** Active (non-deleted) accounts to include in the export. */
    val accounts: List<Account>,
    /** Non-deleted transactions to include in the export. */
    val transactions: List<Transaction>,
    /** Non-deleted categories to include in the export. */
    val categories: List<Category>,
    /** Active (non-deleted) budgets to include in the export. */
    val budgets: List<Budget>,
    /** Active (non-deleted) goals to include in the export. */
    val goals: List<Goal>,
    /** Recurring transaction templates/rules, represented as canonical JSON records. */
    val recurringTemplates: List<ExportJsonRecord> = emptyList(),
    /** User preferences captured outside SQLDelight-backed entities. */
    val preferences: List<ExportKeyValueRecord> = emptyList(),
    /** Application settings captured outside SQLDelight-backed entities. */
    val settings: List<ExportKeyValueRecord> = emptyList(),
    /** Consent/audit records required for privacy compliance restores. */
    val consentRecords: List<ExportKeyValueRecord> = emptyList(),
    /** Include optional mood tags in transaction export output. Defaults to private. */
    val includeMoodTags: Boolean = false,
) {
    /** `true` when every entity list is empty — nothing to export. */
    val isEmpty: Boolean
        get() = accounts.isEmpty() &&
            transactions.isEmpty() &&
            categories.isEmpty() &&
            budgets.isEmpty() &&
            goals.isEmpty() &&
            recurringTemplates.isEmpty() &&
            preferences.isEmpty() &&
            settings.isEmpty() &&
            consentRecords.isEmpty()

    /** Total number of records across all entity types. */
    val totalRecords: Int
        get() = accounts.size + transactions.size + categories.size +
            budgets.size + goals.size + recurringTemplates.size +
            preferences.size + settings.size + consentRecords.size
}

/** Current canonical backup package version for full export/restore artifacts. */
const val BACKUP_PACKAGE_VERSION: Int = 1

/** Flexible JSON object record used for web-only/restoration-support entities. */
@Serializable
data class ExportJsonRecord(
    val id: String? = null,
    val fields: Map<String, JsonElement> = emptyMap(),
)

/** Local key/value record used for preferences, settings, recurring rules, and consent records. */
@Serializable
data class ExportKeyValueRecord(
    val key: String,
    val value: String? = null,
)

/** Metadata attached to a canonical full-backup package. */
@Serializable
data class BackupPackageMetadata(
    val generatedAt: String,
    val appVersion: String? = null,
    val source: String = "web",
)

/**
 * Canonical JSON backup package schema for full web backup/restore round-trips.
 *
 * The root [version] field is mandatory and must be validated before restore.
 * Extra ownership tables are included so clean restores can satisfy local FK checks.
 */
@Serializable
data class BackupPackage(
    val version: Int = BACKUP_PACKAGE_VERSION,
    val metadata: BackupPackageMetadata,
    val users: List<ExportJsonRecord> = emptyList(),
    val households: List<ExportJsonRecord> = emptyList(),
    val householdMembers: List<ExportJsonRecord> = emptyList(),
    val accounts: List<ExportJsonRecord> = emptyList(),
    val transactions: List<ExportJsonRecord> = emptyList(),
    val categories: List<ExportJsonRecord> = emptyList(),
    val budgets: List<ExportJsonRecord> = emptyList(),
    val goals: List<ExportJsonRecord> = emptyList(),
    val recurringTemplates: List<ExportJsonRecord> = emptyList(),
    val preferences: List<ExportKeyValueRecord> = emptyList(),
    val settings: List<ExportKeyValueRecord> = emptyList(),
    val consentRecords: List<ExportKeyValueRecord> = emptyList(),
)
