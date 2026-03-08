// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import com.finance.sync.SyncChange
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MergeResolverTest {

    private val resolver = MergeResolver()

    private fun change(
        operation: MutationOperation = MutationOperation.UPDATE,
        rowData: Map<String, String?>,
        serverTimestamp: String = "2024-01-01T00:00:00Z",
        seq: Long = 1L,
    ): SyncChange = SyncChange(
        tableName = "budgets",
        operation = operation,
        rowData = rowData,
        serverTimestamp = Instant.parse(serverTimestamp),
        sequenceNumber = seq,
    )

    @Test
    fun nonConflictingFieldsAreMerged() {
        val local = change(rowData = mapOf("id" to "1", "name" to "Groceries", "amount" to "5000"))
        val remote = change(rowData = mapOf("id" to "1", "name" to "Groceries", "icon" to "cart"))
        val result = resolver.resolve(local, remote)
        assertEquals("Groceries", result.rowData["name"])
        assertEquals("5000", result.rowData["amount"])
        assertEquals("cart", result.rowData["icon"])
    }

    @Test
    fun identicalFieldValuesDoNotConflict() {
        val local = change(rowData = mapOf("id" to "1", "amount" to "5000"))
        val remote = change(rowData = mapOf("id" to "1", "amount" to "5000"))
        val result = resolver.resolve(local, remote)
        assertEquals("5000", result.rowData["amount"])
        assertNull(result.rowData["__conflict_amount"])
    }

    @Test
    fun conflictingFieldFlagsConflictMarker() {
        val local = change(rowData = mapOf("id" to "1", "amount" to "5000"))
        val remote = change(rowData = mapOf("id" to "1", "amount" to "7500"))
        val result = resolver.resolve(local, remote)
        assertEquals("7500", result.rowData["amount"], "Remote value should win")
        assertEquals("5000", result.rowData["__conflict_amount"], "Local value should be flagged")
    }

    @Test
    fun updatedAtAlwaysUsesLaterValue() {
        val local = change(rowData = mapOf("id" to "1", "updated_at" to "2024-01-01T14:00:00Z"))
        val remote = change(rowData = mapOf("id" to "1", "updated_at" to "2024-01-01T10:00:00Z"))
        val result = resolver.resolve(local, remote)
        assertEquals("2024-01-01T14:00:00Z", result.rowData["updated_at"])
    }

    @Test
    fun deleteAlwaysWins_remoteDeletes() {
        val local = change(operation = MutationOperation.UPDATE, rowData = mapOf("id" to "1", "name" to "X"))
        val remote = change(operation = MutationOperation.DELETE, rowData = mapOf("id" to "1"))
        val result = resolver.resolve(local, remote)
        assertEquals(MutationOperation.DELETE, result.operation)
        assertEquals(remote, result)
    }

    @Test
    fun deleteAlwaysWins_localDeletes() {
        val local = change(operation = MutationOperation.DELETE, rowData = mapOf("id" to "1"))
        val remote = change(operation = MutationOperation.UPDATE, rowData = mapOf("id" to "1", "name" to "X"))
        val result = resolver.resolve(local, remote)
        assertEquals(MutationOperation.DELETE, result.operation)
        assertEquals(local, result)
    }

    @Test
    fun usesHigherServerTimestampAndSequence() {
        val local = change(rowData = mapOf("id" to "1", "name" to "A"), serverTimestamp = "2024-01-01T10:00:00Z", seq = 5)
        val remote = change(rowData = mapOf("id" to "1", "name" to "B"), serverTimestamp = "2024-01-01T12:00:00Z", seq = 8)
        val result = resolver.resolve(local, remote)
        assertEquals(Instant.parse("2024-01-01T12:00:00Z"), result.serverTimestamp)
        assertEquals(8L, result.sequenceNumber)
    }

    @Test
    fun multipleConflictingFieldsAllFlagged() {
        val local = change(rowData = mapOf("id" to "1", "name" to "Local", "amount" to "100", "note" to "L"))
        val remote = change(rowData = mapOf("id" to "1", "name" to "Remote", "amount" to "200", "note" to "R"))
        val result = resolver.resolve(local, remote)
        assertEquals("Remote", result.rowData["name"])
        assertEquals("Local", result.rowData["__conflict_name"])
        assertEquals("200", result.rowData["amount"])
        assertEquals("100", result.rowData["__conflict_amount"])
    }

    @Test
    fun nullValuesHandledCorrectly() {
        val local = change(rowData = mapOf("id" to "1", "note" to null))
        val remote = change(rowData = mapOf("id" to "1", "note" to "Server note"))
        val result = resolver.resolve(local, remote)
        assertEquals("Server note", result.rowData["note"])
        assertTrue(result.rowData.containsKey("__conflict_note"))
    }
}