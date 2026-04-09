// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.provider

import com.finance.sync.MutationOperation
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * Unit tests for [SyncApiModels] serialisation helpers and DTO conversion.
 */
class SyncApiModelsTest {

    // ── parseOperation ──────────────────────────────────────────────

    @Test
    fun parseOperation_INSERT() {
        assertEquals(MutationOperation.INSERT, parseOperation("INSERT"))
    }

    @Test
    fun parseOperation_UPDATE() {
        assertEquals(MutationOperation.UPDATE, parseOperation("UPDATE"))
    }

    @Test
    fun parseOperation_DELETE() {
        assertEquals(MutationOperation.DELETE, parseOperation("DELETE"))
    }

    @Test
    fun parseOperation_UPSERT_maps_to_UPDATE() {
        assertEquals(MutationOperation.UPDATE, parseOperation("UPSERT"))
    }

    @Test
    fun parseOperation_is_case_insensitive() {
        assertEquals(MutationOperation.INSERT, parseOperation("insert"))
        assertEquals(MutationOperation.UPDATE, parseOperation("update"))
        assertEquals(MutationOperation.DELETE, parseOperation("delete"))
        assertEquals(MutationOperation.UPDATE, parseOperation("Upsert"))
    }

    @Test
    fun parseOperation_throws_on_unknown() {
        assertFailsWith<IllegalArgumentException> {
            parseOperation("MERGE")
        }
    }

    // ── ChangeDto.toSyncChange ──────────────────────────────────────

    @Test
    fun changeDtoConvertsToSyncChange() {
        val dto = ChangeDto(
            tableName = "transactions",
            operation = "INSERT",
            rowData = mapOf("id" to "txn-1", "amount" to "4200"),
            serverTimestamp = "2023-11-15T10:30:00Z",
            sequenceNumber = 42L,
            recordId = "txn-1",
            syncVersion = 5L,
            householdId = "hh-1",
        )

        val change = dto.toSyncChange()

        assertEquals("transactions", change.tableName)
        assertEquals(MutationOperation.INSERT, change.operation)
        assertEquals(mapOf("id" to "txn-1", "amount" to "4200"), change.rowData)
        assertEquals(42L, change.sequenceNumber)
        assertEquals("txn-1", change.recordId)
        assertEquals(5L, change.syncVersion)
        assertEquals("hh-1", change.householdId)
    }

    @Test
    fun changeDtoHandlesDeleteOperation() {
        val dto = ChangeDto(
            tableName = "transactions",
            operation = "DELETE",
            rowData = mapOf("id" to "txn-1"),
            serverTimestamp = "2023-11-15T10:30:00Z",
            sequenceNumber = 1L,
        )

        val change = dto.toSyncChange()

        assertEquals(MutationOperation.DELETE, change.operation)
    }

    @Test
    fun changeDtoHandlesNullValues() {
        val dto = ChangeDto(
            tableName = "transactions",
            operation = "UPDATE",
            rowData = mapOf("id" to "txn-1", "notes" to null),
            serverTimestamp = "2023-11-15T10:30:00Z",
            sequenceNumber = 1L,
        )

        val change = dto.toSyncChange()

        assertEquals(null, change.rowData["notes"])
    }

    // ── PullRequestDto ──────────────────────────────────────────────

    @Test
    fun pullRequestDtoDefaultValues() {
        val dto = PullRequestDto(
            sinceVersions = mapOf("transactions" to 5L),
        )

        assertEquals(mapOf("transactions" to 5L), dto.sinceVersions)
        assertEquals(null, dto.batchSize)
        assertEquals(null, dto.householdId)
    }

    // ── PullResponseDto ─────────────────────────────────────────────

    @Test
    fun pullResponseDtoWithChanges() {
        val dto = PullResponseDto(
            changes = listOf(
                ChangeDto(
                    tableName = "transactions",
                    operation = "INSERT",
                    rowData = mapOf("id" to "txn-1"),
                    serverTimestamp = "2023-11-15T10:30:00Z",
                    sequenceNumber = 1L,
                ),
            ),
            newVersions = mapOf("transactions" to 1L),
            hasMore = false,
        )

        assertEquals(1, dto.changes.size)
        assertFalse(dto.hasMore)
    }

    // ── PushRequestDto ──────────────────────────────────────────────

    @Test
    fun pushRequestDtoContainsMutations() {
        val dto = PushRequestDto(
            mutations = listOf(
                MutationDto(
                    id = "mut-1",
                    tableName = "transactions",
                    operation = "INSERT",
                    rowData = mapOf("id" to "txn-1", "amount" to "1000"),
                    timestamp = "2023-11-15T10:30:00Z",
                    recordId = "txn-1",
                ),
            ),
        )

        assertEquals(1, dto.mutations.size)
        assertEquals("mut-1", dto.mutations[0].id)
    }

    // ── PushResponseDto ─────────────────────────────────────────────

    @Test
    fun pushResponseDtoWithSuccesses() {
        val dto = PushResponseDto(
            succeeded = listOf("mut-1", "mut-2"),
            failed = emptyList(),
        )

        assertEquals(2, dto.succeeded.size)
        assertTrue(dto.failed.isEmpty())
    }

    @Test
    fun pushResponseDtoWithFailures() {
        val dto = PushResponseDto(
            succeeded = listOf("mut-1"),
            failed = listOf(
                PushFailureDto(
                    mutationId = "mut-2",
                    error = "Constraint violation",
                    retryable = false,
                ),
            ),
        )

        assertEquals(1, dto.succeeded.size)
        assertEquals(1, dto.failed.size)
        assertEquals("mut-2", dto.failed[0].mutationId)
        assertFalse(dto.failed[0].retryable)
    }

    // ── Helpers ─────────────────────────────────────────────────────

    private fun assertTrue(condition: Boolean) {
        kotlin.test.assertTrue(condition)
    }

    private fun assertFalse(condition: Boolean) {
        kotlin.test.assertFalse(condition)
    }
}
