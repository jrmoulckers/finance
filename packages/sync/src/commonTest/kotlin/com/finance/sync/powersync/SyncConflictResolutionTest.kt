// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.powersync

import com.finance.sync.MutationOperation
import com.finance.sync.conflict.ConflictResolution
import com.finance.sync.conflict.ConflictStrategy
import com.finance.sync.conflict.LastWriteWinsResolver
import com.finance.sync.conflict.MergeResolver
import com.finance.sync.conflict.SyncConflict
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Conflict resolution tests covering LWW, concurrent edits, delete-vs-update,
 * create-vs-create, and audit logging.
 *
 * These tests verify deterministic conflict resolution behaviour required
 * by the PowerSync integration layer.
 *
 * Addresses #1388.
 */
class SyncConflictResolutionTest {

    private val lwwResolver = LastWriteWinsResolver()
    private val mergeResolver = MergeResolver()

    // ── Helper ──────────────────────────────────────────────────

    private fun conflict(
        tableName: String = "transactions",
        recordId: String = "rec-1",
        localOp: MutationOperation = MutationOperation.UPDATE,
        serverOp: MutationOperation = MutationOperation.UPDATE,
        localData: Map<String, String?>? = mapOf("id" to recordId, "name" to "Local Value"),
        serverData: Map<String, String?>? = mapOf("id" to recordId, "name" to "Server Value"),
        localVersion: Long = 1L,
        serverVersion: Long = 2L,
        localTs: String = "2024-06-01T10:00:00Z",
        serverTs: String = "2024-06-01T12:00:00Z",
    ) = SyncConflict(
        tableName = tableName,
        recordId = recordId,
        localData = localData,
        serverData = serverData,
        localVersion = localVersion,
        serverVersion = serverVersion,
        localTimestamp = Instant.parse(localTs),
        serverTimestamp = Instant.parse(serverTs),
        localOperation = localOp,
        serverOperation = serverOp,
    )

    // ── LWW resolution ──────────────────────────────────────────

    @Test
    fun test_lww_server_wins_when_server_version_higher() {
        val result = lwwResolver.resolveConflict(
            conflict(localVersion = 1, serverVersion = 5),
        )
        assertIs<ConflictResolution.AcceptServer>(result)
        assertEquals("Server Value", result.data?.get("name"))
    }

    @Test
    fun test_lww_local_wins_when_local_version_higher() {
        val result = lwwResolver.resolveConflict(
            conflict(localVersion = 7, serverVersion = 3),
        )
        assertIs<ConflictResolution.AcceptLocal>(result)
        assertEquals("Local Value", result.data?.get("name"))
    }

    @Test
    fun test_lww_server_wins_as_tiebreaker_on_equal_versions() {
        val result = lwwResolver.resolveConflict(
            conflict(localVersion = 5, serverVersion = 5),
        )
        assertIs<ConflictResolution.AcceptServer>(result)
    }

    // ── Concurrent edits to same field ──────────────────────────

    @Test
    fun test_concurrent_edits_same_field_lww_resolves_by_version() {
        val c = conflict(
            localData = mapOf("id" to "rec-1", "amount_cents" to "5000"),
            serverData = mapOf("id" to "rec-1", "amount_cents" to "7500"),
            localVersion = 2,
            serverVersion = 4,
        )
        val result = lwwResolver.resolveConflict(c)
        assertIs<ConflictResolution.AcceptServer>(result)
        assertEquals("7500", result.data?.get("amount_cents"))
    }

    @Test
    fun test_concurrent_edits_same_field_local_wins_when_higher_version() {
        val c = conflict(
            localData = mapOf("id" to "rec-1", "amount_cents" to "5000"),
            serverData = mapOf("id" to "rec-1", "amount_cents" to "7500"),
            localVersion = 6,
            serverVersion = 3,
        )
        val result = lwwResolver.resolveConflict(c)
        assertIs<ConflictResolution.AcceptLocal>(result)
        assertEquals("5000", result.data?.get("amount_cents"))
    }

    // ── Concurrent edits to different fields ────────────────────

    @Test
    fun test_concurrent_edits_different_fields_merge_combines_both() {
        val c = conflict(
            tableName = "budgets",
            localData = mapOf("id" to "b-1", "name" to "Updated Name", "amount_cents" to "10000"),
            serverData = mapOf("id" to "b-1", "name" to "Original Name", "amount_cents" to "20000"),
            localVersion = 2,
            serverVersion = 3,
        )
        // MergeResolver is used for budgets (per ConflictStrategy)
        val result = mergeResolver.resolveConflict(c)

        // MergeResolver should attempt to merge non-conflicting fields
        assertIs<ConflictResolution.Merged>(result)
        assertNotNull(result.data)
    }

    @Test
    fun test_concurrent_edits_different_fields_strategy_selects_merge_for_budgets() {
        val resolver = ConflictStrategy.resolverFor("budgets")
        val c = conflict(
            tableName = "budgets",
            localData = mapOf("id" to "b-1", "name" to "Local", "limit_cents" to "50000"),
            serverData = mapOf("id" to "b-1", "name" to "Server", "limit_cents" to "50000"),
            localVersion = 3,
            serverVersion = 4,
        )
        val result = resolver.resolveConflict(c)
        // Should use MergeResolver since budgets table is configured for MERGE strategy
        assertTrue(
            result is ConflictResolution.Merged || result is ConflictResolution.AcceptServer,
            "Budgets should use merge strategy",
        )
    }

    // ── Delete vs update conflict ───────────────────────────────

    @Test
    fun test_delete_vs_update_server_delete_wins() {
        val result = lwwResolver.resolveConflict(
            conflict(
                localOp = MutationOperation.UPDATE,
                serverOp = MutationOperation.DELETE,
                serverData = null,
            ),
        )
        assertIs<ConflictResolution.Delete>(result)
    }

    @Test
    fun test_delete_vs_update_local_delete_wins_when_version_higher() {
        val result = lwwResolver.resolveConflict(
            conflict(
                localOp = MutationOperation.DELETE,
                serverOp = MutationOperation.UPDATE,
                localData = null,
                localVersion = 5,
                serverVersion = 3,
            ),
        )
        assertIs<ConflictResolution.Delete>(result)
    }

    @Test
    fun test_delete_vs_update_server_update_wins_when_version_higher() {
        val result = lwwResolver.resolveConflict(
            conflict(
                localOp = MutationOperation.DELETE,
                serverOp = MutationOperation.UPDATE,
                localData = null,
                localVersion = 2,
                serverVersion = 5,
            ),
        )
        assertIs<ConflictResolution.AcceptServer>(result)
    }

    // ── Create vs create conflict (same ID) ─────────────────────

    @Test
    fun test_create_vs_create_same_id_server_version_wins() {
        val result = lwwResolver.resolveConflict(
            conflict(
                localOp = MutationOperation.INSERT,
                serverOp = MutationOperation.INSERT,
                localData = mapOf("id" to "rec-dup", "name" to "Local Created"),
                serverData = mapOf("id" to "rec-dup", "name" to "Server Created"),
                localVersion = 1,
                serverVersion = 2,
            ),
        )
        assertIs<ConflictResolution.AcceptServer>(result)
        assertEquals("Server Created", result.data?.get("name"))
    }

    @Test
    fun test_create_vs_create_same_id_local_wins_when_higher_version() {
        val result = lwwResolver.resolveConflict(
            conflict(
                localOp = MutationOperation.INSERT,
                serverOp = MutationOperation.INSERT,
                localData = mapOf("id" to "rec-dup", "name" to "Local Created"),
                serverData = mapOf("id" to "rec-dup", "name" to "Server Created"),
                localVersion = 3,
                serverVersion = 1,
            ),
        )
        assertIs<ConflictResolution.AcceptLocal>(result)
        assertEquals("Local Created", result.data?.get("name"))
    }

    // ── Conflict log recording (audit) ──────────────────────────

    @Test
    fun test_conflict_batch_resolution_records_all_conflicts() {
        val conflicts = listOf(
            conflict(recordId = "rec-1", localVersion = 1, serverVersion = 3),
            conflict(recordId = "rec-2", localVersion = 4, serverVersion = 2),
            conflict(
                recordId = "rec-3",
                localOp = MutationOperation.DELETE,
                serverOp = MutationOperation.DELETE,
                localData = null,
                serverData = null,
            ),
        )

        val resolutions = lwwResolver.resolveAll(conflicts)

        assertEquals(3, resolutions.size, "Should resolve all 3 conflicts")

        // Verify each conflict is paired with its resolution
        val (conflict1, resolution1) = resolutions[0]
        assertEquals("rec-1", conflict1.recordId)
        assertIs<ConflictResolution.AcceptServer>(resolution1)

        val (conflict2, resolution2) = resolutions[1]
        assertEquals("rec-2", conflict2.recordId)
        assertIs<ConflictResolution.AcceptLocal>(resolution2)

        val (conflict3, resolution3) = resolutions[2]
        assertEquals("rec-3", conflict3.recordId)
        assertIs<ConflictResolution.Delete>(resolution3)
    }

    @Test
    fun test_conflict_metadata_is_preserved_in_resolution() {
        val c = conflict(
            tableName = "transactions",
            recordId = "txn-audit-1",
            localVersion = 2,
            serverVersion = 5,
        )

        val resolutions = lwwResolver.resolveAll(listOf(c))
        assertEquals(1, resolutions.size)

        val (original, _) = resolutions[0]
        assertEquals("transactions", original.tableName)
        assertEquals("txn-audit-1", original.recordId)
        assertEquals(2L, original.localVersion)
        assertEquals(5L, original.serverVersion)
    }

    // ── Both delete ─────────────────────────────────────────────

    @Test
    fun test_both_delete_results_in_delete() {
        val result = lwwResolver.resolveConflict(
            conflict(
                localOp = MutationOperation.DELETE,
                serverOp = MutationOperation.DELETE,
                localData = null,
                serverData = null,
            ),
        )
        assertIs<ConflictResolution.Delete>(result)
    }

    // ── Strategy routing ────────────────────────────────────────

    @Test
    fun test_strategy_routes_transactions_to_lww() {
        val resolver = ConflictStrategy.resolverFor("transactions")
        assertIs<LastWriteWinsResolver>(resolver)
    }

    @Test
    fun test_strategy_routes_budgets_to_merge() {
        val resolver = ConflictStrategy.resolverFor("budgets")
        assertIs<MergeResolver>(resolver)
    }

    @Test
    fun test_strategy_routes_goals_to_merge() {
        val resolver = ConflictStrategy.resolverFor("goals")
        assertIs<MergeResolver>(resolver)
    }

    @Test
    fun test_strategy_routes_unknown_table_to_lww() {
        val resolver = ConflictStrategy.resolverFor("some_unknown_table")
        assertIs<LastWriteWinsResolver>(resolver)
    }
}
