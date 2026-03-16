// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests for [MergeResolver.resolveConflict] — the high-level SyncConflict API.
 *
 * The low-level [MergeResolver.resolve] tests remain in [MergeResolverTest].
 */
class MergeResolverConflictTest {

    private val resolver = MergeResolver()

    private fun conflict(
        localOp: MutationOperation = MutationOperation.UPDATE,
        serverOp: MutationOperation = MutationOperation.UPDATE,
        localData: Map<String, String?>? = mapOf("id" to "1", "name" to "Local", "note" to "local note"),
        serverData: Map<String, String?>? = mapOf("id" to "1", "name" to "Server", "icon" to "star"),
        localVersion: Long = 1L,
        serverVersion: Long = 2L,
        localTs: String = "2024-01-01T10:00:00Z",
        serverTs: String = "2024-01-01T12:00:00Z",
    ) = SyncConflict(
        tableName = "budgets",
        recordId = "1",
        localData = localData,
        serverData = serverData,
        localVersion = localVersion,
        serverVersion = serverVersion,
        localTimestamp = Instant.parse(localTs),
        serverTimestamp = Instant.parse(serverTs),
        localOperation = localOp,
        serverOperation = serverOp,
    )

    // --- Non-conflicting field merge ---

    @Test
    fun nonConflictingFieldsAreMerged() {
        val result = resolver.resolveConflict(
            conflict(
                localData = mapOf("id" to "1", "note" to "local note"),
                serverData = mapOf("id" to "1", "icon" to "star"),
            ),
        )
        assertIs<ConflictResolution.Merged>(result)
        assertEquals("1", result.data["id"])
        assertEquals("local note", result.data["note"])
        assertEquals("star", result.data["icon"])
    }

    @Test
    fun identicalFieldValuesDoNotConflict() {
        val result = resolver.resolveConflict(
            conflict(
                localData = mapOf("id" to "1", "name" to "Same"),
                serverData = mapOf("id" to "1", "name" to "Same"),
            ),
        )
        assertIs<ConflictResolution.Merged>(result)
        assertEquals("Same", result.data["name"])
        assertNull(result.data["__conflict_name"])
    }

    @Test
    fun conflictingMergeableFieldFlagsConflictMarker() {
        val result = resolver.resolveConflict(
            conflict(
                localData = mapOf("id" to "1", "name" to "Local Name"),
                serverData = mapOf("id" to "1", "name" to "Server Name"),
            ),
        )
        assertIs<ConflictResolution.Merged>(result)
        assertEquals("Server Name", result.data["name"])
        assertEquals("Local Name", result.data["__conflict_name"])
    }

    @Test
    fun updatedAtAlwaysUsesLaterValue() {
        val result = resolver.resolveConflict(
            conflict(
                localData = mapOf("id" to "1", "updated_at" to "2024-01-01T14:00:00Z"),
                serverData = mapOf("id" to "1", "updated_at" to "2024-01-01T10:00:00Z"),
            ),
        )
        assertIs<ConflictResolution.Merged>(result)
        assertEquals("2024-01-01T14:00:00Z", result.data["updated_at"])
    }

    // --- DELETE delegation ---

    @Test
    fun serverDeleteDelegatesToFallback() {
        val result = resolver.resolveConflict(
            conflict(
                serverOp = MutationOperation.DELETE,
                serverData = null,
            ),
        )
        // Fallback (LWW) will produce Delete because server deleted.
        assertIs<ConflictResolution.Delete>(result)
    }

    @Test
    fun localDeleteDelegatesToFallback() {
        val result = resolver.resolveConflict(
            conflict(
                localOp = MutationOperation.DELETE,
                localData = null,
            ),
        )
        // Fallback (LWW): local delete with lower version, server has higher
        // version → server wins (revived).
        assertIs<ConflictResolution.AcceptServer>(result)
    }

    @Test
    fun localDeleteWithHigherVersionDelegatesToFallback() {
        val result = resolver.resolveConflict(
            conflict(
                localOp = MutationOperation.DELETE,
                localData = null,
                localVersion = 10,
                serverVersion = 5,
            ),
        )
        // Fallback (LWW): local delete with higher version → delete wins.
        assertIs<ConflictResolution.Delete>(result)
    }

    // --- Non-mergeable fields ---

    @Test
    fun nonMergeableFieldConflictDelegatesToFallback() {
        // "amount" is in the default nonMergeableFields set.
        val result = resolver.resolveConflict(
            conflict(
                localData = mapOf("id" to "1", "amount" to "5000"),
                serverData = mapOf("id" to "1", "amount" to "7500"),
            ),
        )
        // Should delegate to fallback (LWW) since "amount" conflict
        // cannot be field-merged. Server version (2) > local version (1).
        assertIs<ConflictResolution.AcceptServer>(result)
    }

    @Test
    fun nonMergeableFieldWithSameValueDoesNotDelegateToFallback() {
        // Same amount on both sides — no conflict, so no delegation.
        val result = resolver.resolveConflict(
            conflict(
                localData = mapOf("id" to "1", "amount" to "5000", "note" to "local"),
                serverData = mapOf("id" to "1", "amount" to "5000", "icon" to "cart"),
            ),
        )
        assertIs<ConflictResolution.Merged>(result)
        assertEquals("5000", result.data["amount"])
        assertEquals("local", result.data["note"])
        assertEquals("cart", result.data["icon"])
    }

    @Test
    fun currencyCodeConflictDelegatesToFallback() {
        // "currency_code" is in the default nonMergeableFields set.
        val result = resolver.resolveConflict(
            conflict(
                localData = mapOf("id" to "1", "currency_code" to "USD"),
                serverData = mapOf("id" to "1", "currency_code" to "EUR"),
            ),
        )
        assertIs<ConflictResolution.AcceptServer>(result)
    }

    @Test
    fun typeFieldConflictDelegatesToFallback() {
        // "type" is in the default nonMergeableFields set.
        val result = resolver.resolveConflict(
            conflict(
                localData = mapOf("id" to "1", "type" to "EXPENSE"),
                serverData = mapOf("id" to "1", "type" to "INCOME"),
            ),
        )
        assertIs<ConflictResolution.AcceptServer>(result)
    }

    @Test
    fun customNonMergeableFieldsAreRespected() {
        val customResolver = MergeResolver(
            nonMergeableFields = setOf("status"),
        )
        val result = customResolver.resolveConflict(
            conflict(
                localData = mapOf("id" to "1", "status" to "PENDING"),
                serverData = mapOf("id" to "1", "status" to "CLEARED"),
            ),
        )
        // "status" is non-mergeable in this custom resolver.
        assertIs<ConflictResolution.AcceptServer>(result)
    }

    @Test
    fun customFallbackResolverIsUsed() {
        val customResolver = MergeResolver(
            fallbackResolver = ClientWinsResolver(),
            nonMergeableFields = setOf("amount"),
        )
        val result = customResolver.resolveConflict(
            conflict(
                localData = mapOf("id" to "1", "amount" to "5000"),
                serverData = mapOf("id" to "1", "amount" to "7500"),
            ),
        )
        // Fallback is ClientWins, so local data should win.
        assertIs<ConflictResolution.AcceptLocal>(result)
        assertEquals("5000", result.data?.get("amount"))
    }

    // --- Null data edge cases ---

    @Test
    fun bothNullDataReturnsDelete() {
        val result = resolver.resolveConflict(
            conflict(localData = null, serverData = null),
        )
        assertIs<ConflictResolution.Delete>(result)
    }

    @Test
    fun localNullDataReturnsAcceptServer() {
        val result = resolver.resolveConflict(
            conflict(localData = null, serverData = mapOf("id" to "1", "name" to "Server")),
        )
        assertIs<ConflictResolution.AcceptServer>(result)
        assertEquals("Server", result.data?.get("name"))
    }

    @Test
    fun serverNullDataReturnsAcceptLocal() {
        val result = resolver.resolveConflict(
            conflict(localData = mapOf("id" to "1", "name" to "Local"), serverData = null),
        )
        assertIs<ConflictResolution.AcceptLocal>(result)
        assertEquals("Local", result.data?.get("name"))
    }

    // --- Multiple conflicting fields ---

    @Test
    fun multipleConflictingMergeableFieldsAllFlagged() {
        val result = resolver.resolveConflict(
            conflict(
                localData = mapOf("id" to "1", "name" to "Local", "note" to "L", "icon" to "a"),
                serverData = mapOf("id" to "1", "name" to "Server", "note" to "S", "icon" to "b"),
            ),
        )
        assertIs<ConflictResolution.Merged>(result)
        assertEquals("Server", result.data["name"])
        assertEquals("Local", result.data["__conflict_name"])
        assertEquals("S", result.data["note"])
        assertEquals("L", result.data["__conflict_note"])
        assertEquals("b", result.data["icon"])
        assertEquals("a", result.data["__conflict_icon"])
    }
}
