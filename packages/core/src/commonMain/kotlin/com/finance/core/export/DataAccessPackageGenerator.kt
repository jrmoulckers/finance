// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.export

import com.finance.models.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** Generates on-device GDPR/CCPA data access ZIP packages. */
class DataAccessPackageGenerator(
    private val networkEgressProbe: NetworkEgressProbe? = null,
) {
    private val json = Json {
        prettyPrint = true
        prettyPrintIndent = "  "
        encodeDefaults = true
    }

    /**
     * Builds a local ZIP package containing manifest, domain JSON files,
     * attachment binaries, and a localized README.
     */
    fun generate(data: DataAccessExportData, options: DataAccessRequestOptions): DataAccessPackageResult {
        val dataFiles = buildDataFiles(data, options)
        val attachmentFiles = buildAttachmentFiles(data.attachments)
        val manifest = buildManifest(data, options, dataFiles, attachmentFiles)
        val manifestFile = GeneratedPackageFile(
            path = "manifest.json",
            bytes = json.encodeToString(manifest).encodeToByteArray(),
            contentType = "application/json",
        )
        val readmeFile = GeneratedPackageFile(
            path = "README.md",
            bytes = DataAccessReadmeRenderer.render(manifest, options.localeTag).encodeToByteArray(),
            contentType = "text/markdown; charset=utf-8",
        )
        val files = listOf(manifestFile) + dataFiles + attachmentFiles + readmeFile
        val zipBytes = ZipArchive.build(files)

        return DataAccessPackageResult(
            fileName = DataExportService.generateFilename(ExportFormat.CSV, options.generatedAt),
            zipBytes = zipBytes,
            files = files,
            manifest = manifest,
        )
    }

    private fun buildDataFiles(
        data: DataAccessExportData,
        options: DataAccessRequestOptions,
    ): List<GeneratedPackageFile> {
        val domains = mutableListOf(
            domainFile(DataAccessDomain.TRANSACTIONS, serializeTransactions(data.transactions), data.transactions.size),
            domainFile(DataAccessDomain.ACCOUNTS, serializeAccounts(data.accounts), data.accounts.size),
            domainFile(DataAccessDomain.BUDGETS, serializeBudgets(data.budgets), data.budgets.size),
            domainFile(DataAccessDomain.GOALS, serializeGoals(data.goals), data.goals.size),
            domainFile(DataAccessDomain.RECURRING_RULES, serializeJsonRecords(data.recurringRules), data.recurringRules.size),
            domainFile(DataAccessDomain.CATEGORIES, serializeCategories(data.categories), data.categories.size),
            domainFile(DataAccessDomain.TAGS, serializeTagsDomain(data.tags), data.tags.size),
            domainFile(DataAccessDomain.ATTACHMENTS, serializeAttachments(data.attachments), data.attachments.size),
            domainFile(DataAccessDomain.PREFERENCES, serializeJsonRecords(data.preferences), data.preferences.size),
            domainFile(DataAccessDomain.SETTINGS, serializeJsonRecords(data.settings), data.settings.size),
            domainFile(DataAccessDomain.AUDIT_LOG, serializeJsonRecords(data.auditLog), data.auditLog.size),
            domainFile(DataAccessDomain.SYNC_METADATA, serializeJsonRecords(data.syncMetadata), data.syncMetadata.size),
        )
        if (options.includeMoodTags) {
            domains += domainFile(
                DataAccessDomain.MOOD_TAGS,
                serializeJsonRecords(data.moodTags),
                data.moodTags.size,
            )
        }
        return domains
    }

    private fun buildAttachmentFiles(attachments: List<DataAccessAttachment>): List<GeneratedPackageFile> =
        attachments.mapNotNull { attachment ->
            attachment.bytes?.let { bytes ->
                GeneratedPackageFile(
                    path = "attachments/${sanitizePathSegment(attachment.id)}-${sanitizePathSegment(attachment.fileName)}",
                    bytes = bytes,
                    contentType = attachment.contentType,
                )
            }
        }

    private fun buildManifest(
        data: DataAccessExportData,
        options: DataAccessRequestOptions,
        dataFiles: List<GeneratedPackageFile>,
        attachmentFiles: List<GeneratedPackageFile>,
    ): DataAccessManifest {
        val counts = mapOf(
            DataAccessDomain.TRANSACTIONS to data.transactions.size,
            DataAccessDomain.ACCOUNTS to data.accounts.size,
            DataAccessDomain.BUDGETS to data.budgets.size,
            DataAccessDomain.GOALS to data.goals.size,
            DataAccessDomain.RECURRING_RULES to data.recurringRules.size,
            DataAccessDomain.CATEGORIES to data.categories.size,
            DataAccessDomain.TAGS to data.tags.size,
            DataAccessDomain.ATTACHMENTS to data.attachments.size,
            DataAccessDomain.PREFERENCES to data.preferences.size,
            DataAccessDomain.SETTINGS to data.settings.size,
            DataAccessDomain.AUDIT_LOG to data.auditLog.size,
            DataAccessDomain.SYNC_METADATA to data.syncMetadata.size,
            DataAccessDomain.MOOD_TAGS to data.moodTags.size,
        )
        val manifestEntries = dataFiles.map { file ->
            val domain = DataAccessDomain.entries.first { file.path.endsWith(it.fileName) }
            DataAccessManifestEntry(
                domain = domain.name.lowercase(),
                path = file.path,
                contentType = file.contentType,
                recordCount = counts.getValue(domain),
                schemaVersion = DATA_ACCESS_PACKAGE_SCHEMA_VERSION,
                description = domain.description,
            )
        } + attachmentFiles.map { file ->
            DataAccessManifestEntry(
                domain = "attachment_binary",
                path = file.path,
                contentType = file.contentType,
                recordCount = 1,
                schemaVersion = DATA_ACCESS_PACKAGE_SCHEMA_VERSION,
                description = "Local attachment binary copied into the package",
            )
        }

        return DataAccessManifest(
            schemaVersion = DATA_ACCESS_PACKAGE_SCHEMA_VERSION,
            generatedAt = options.generatedAt.toString(),
            expiresAt = options.expiresAt.toString(),
            appVersion = options.appVersion,
            locale = options.localeTag,
            contents = manifestEntries,
            privacy = DataAccessPrivacyManifest(
                protectedCategoriesIncluded = options.includeProtectedCategories,
                moodTagsIncluded = options.includeMoodTags,
                availableOnRequest = buildList {
                    if (!options.includeMoodTags) add("mood_tags")
                    add("caregiver_mode_audit_trail")
                    add("accountability_partner_shared_snapshots")
                },
                householdScope = "Only the requesting user's own contributions are included; other household members' data is excluded.",
            ),
            coordinationNotes = buildList {
                if (!options.protectedCategoryMetadataAvailable) {
                    add("Needs Coordination: #1719 protected-category metadata is not yet available in shared KMP models; callers must pass pre-filtered categories when users opt out.")
                }
            },
        )
    }

    private fun domainFile(domain: DataAccessDomain, recordsJson: String, recordCount: Int): GeneratedPackageFile {
        val body = buildString {
            append("{\n")
            append("  \"schema_version\": \"").append(DATA_ACCESS_PACKAGE_SCHEMA_VERSION).append("\",\n")
            append("  \"record_count\": ").append(recordCount).append(",\n")
            append("  \"records\": ").append(recordsJson.prependIndent("  ").trimStart()).append('\n')
            append('}')
        }
        return GeneratedPackageFile(
            path = "data/${domain.fileName}",
            bytes = body.encodeToByteArray(),
            contentType = "application/json",
        )
    }
}

private fun sanitizePathSegment(value: String): String = buildString {
    value.forEach { char ->
        append(if (char.isLetterOrDigit() || char in setOf('.', '-', '_')) char else '_')
    }
}.ifBlank { "attachment" }

private object DataAccessReadmeRenderer {
    fun render(manifest: DataAccessManifest, localeTag: String): String {
        val title = when (localeTag.substringBefore('-')) {
            "es" -> "# Paquete de datos de Finance"
            "fr" -> "# Package de données Finance"
            else -> "# Finance data package"
        }
        return buildString {
            appendLine(title)
            appendLine()
            appendLine("Generated: ${manifest.generatedAt}")
            appendLine("Expires: ${manifest.expiresAt}")
            appendLine()
            appendLine("This ZIP was generated on your device. It contains the data Finance stores for your account and should be treated as sensitive financial information.")
            appendLine()
            appendLine("## Privacy choices")
            appendLine("- Protected categories included: ${manifest.privacy.protectedCategoriesIncluded}")
            appendLine("- Mood tags included: ${manifest.privacy.moodTagsIncluded}")
            appendLine("- Household scope: ${manifest.privacy.householdScope}")
            appendLine()
            appendLine("## Files")
            manifest.contents.forEach { entry ->
                appendLine("- `${entry.path}` — ${entry.description} (${entry.recordCount} record(s)).")
            }
            if (manifest.privacy.availableOnRequest.isNotEmpty()) {
                appendLine()
                appendLine("## Available on request")
                manifest.privacy.availableOnRequest.forEach { appendLine("- `$it`") }
            }
        }
    }
}
