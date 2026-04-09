// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.provider

import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange
import kotlinx.datetime.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ── Pull request / response ─────────────────────────────────────────

/**
 * Request body for the pull endpoint.
 *
 * Sent as JSON to `POST /sync/pull`. The server returns only changes
 * newer than the per-table versions in [sinceVersions].
 *
 * @property sinceVersions Map of table name → last known sync version.
 *   Tables not present in the map receive all available changes (full sync).
 * @property batchSize Maximum number of changes to return in a single response.
 *   The server may return fewer changes. When more changes exist, the response
 *   sets [PullResponseDto.hasMore] to `true`.
 * @property householdId Optional household scope to restrict pulled changes.
 */
@Serializable
data class PullRequestDto(
    @SerialName("since_versions") val sinceVersions: Map<String, Long>,
    @SerialName("batch_size") val batchSize: Int? = null,
    @SerialName("household_id") val householdId: String? = null,
)

/**
 * Response body from the pull endpoint.
 *
 * @property changes List of server changes since the requested versions.
 * @property newVersions Updated per-table sync versions after this batch.
 *   Clients must persist these and send them on the next pull.
 * @property hasMore `true` when the server has additional changes beyond
 *   this batch (pagination). The client should issue another pull.
 */
@Serializable
data class PullResponseDto(
    val changes: List<ChangeDto>,
    @SerialName("new_versions") val newVersions: Map<String, Long>,
    @SerialName("has_more") val hasMore: Boolean,
)

/**
 * A single server-originated change, as returned by the pull endpoint.
 *
 * @property tableName The database table affected.
 * @property operation The DML operation (INSERT, UPDATE, DELETE).
 * @property rowData Column name → serialised value map. `null` values represent SQL NULLs.
 * @property serverTimestamp ISO-8601 timestamp assigned by the server.
 * @property sequenceNumber Monotonically increasing sequence for delta sync.
 * @property recordId The primary key of the affected record.
 * @property syncVersion The sync version of the record after this change.
 * @property householdId The household scope for this change.
 */
@Serializable
data class ChangeDto(
    @SerialName("table_name") val tableName: String,
    val operation: String,
    @SerialName("row_data") val rowData: Map<String, String?>,
    @SerialName("server_timestamp") val serverTimestamp: String,
    @SerialName("sequence_number") val sequenceNumber: Long,
    @SerialName("record_id") val recordId: String = "",
    @SerialName("sync_version") val syncVersion: Long = 0L,
    @SerialName("household_id") val householdId: String = "",
) {
    /**
     * Convert this DTO to a domain [SyncChange].
     */
    fun toSyncChange(): SyncChange = SyncChange(
        tableName = tableName,
        operation = parseOperation(operation),
        rowData = rowData,
        serverTimestamp = Instant.parse(serverTimestamp),
        sequenceNumber = sequenceNumber,
        recordId = recordId,
        syncVersion = syncVersion,
        householdId = householdId,
    )
}

// ── Push request / response ─────────────────────────────────────────

/**
 * Request body for the push endpoint.
 *
 * Sent as JSON to `POST /sync/push`.
 *
 * @property mutations List of local mutations to push to the server.
 * @property householdId Optional household scope for the push operation.
 */
@Serializable
data class PushRequestDto(
    val mutations: List<MutationDto>,
    @SerialName("household_id") val householdId: String? = null,
)

/**
 * A single local mutation, serialised for the push endpoint.
 *
 * @property id Unique mutation identifier.
 * @property tableName The database table being mutated.
 * @property operation The DML operation (INSERT, UPDATE, DELETE).
 * @property rowData Column name → serialised value map.
 * @property timestamp ISO-8601 timestamp when the mutation was created locally.
 * @property recordId The primary key of the record being mutated.
 */
@Serializable
data class MutationDto(
    val id: String,
    @SerialName("table_name") val tableName: String,
    val operation: String,
    @SerialName("row_data") val rowData: Map<String, String?>,
    val timestamp: String,
    @SerialName("record_id") val recordId: String = "",
)

/**
 * Response body from the push endpoint.
 *
 * @property succeeded IDs of mutations the server accepted.
 * @property failed Details about each mutation the server rejected.
 */
@Serializable
data class PushResponseDto(
    val succeeded: List<String>,
    val failed: List<PushFailureDto> = emptyList(),
)

/**
 * Details about a single mutation that failed during push.
 *
 * @property mutationId The ID of the failed mutation.
 * @property error Human-readable error description.
 * @property retryable `true` if the failure is transient and the mutation
 *   should be retried.
 */
@Serializable
data class PushFailureDto(
    @SerialName("mutation_id") val mutationId: String,
    val error: String,
    val retryable: Boolean,
)

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Parse a string operation name to [MutationOperation].
 *
 * Recognises case-insensitive operation names as well as the UPSERT
 * synonym used by some server implementations (mapped to [MutationOperation.UPDATE]).
 *
 * @throws IllegalArgumentException if the operation is unknown.
 */
internal fun parseOperation(operation: String): MutationOperation = when (operation.uppercase()) {
    "INSERT" -> MutationOperation.INSERT
    "UPDATE" -> MutationOperation.UPDATE
    "DELETE" -> MutationOperation.DELETE
    "UPSERT" -> MutationOperation.UPDATE
    else -> throw IllegalArgumentException("Unknown operation: $operation")
}
