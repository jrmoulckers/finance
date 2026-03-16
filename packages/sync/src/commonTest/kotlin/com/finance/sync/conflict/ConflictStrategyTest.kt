// SPDX-License-Identifier: BUSL-1.1

package com.finance.sync.conflict

import com.finance.sync.MutationOperation
import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class ConflictStrategyTest {

    // --- resolverFor mapping ---

    @Test
    fun budgetsUseMergeResolver() {
        assertIs<MergeResolver>(ConflictStrategy.resolverFor("budgets"))
    }

    @Test
    fun goalsUseMergeResolver() {
        assertIs<MergeResolver>(ConflictStrategy.resolverFor("goals"))
    }

    @Test
    fun householdsUseMergeResolver() {
        assertIs<MergeResolver>(ConflictStrategy.resolverFor("households"))
    }

    @Test
    fun unknownTableDefaultsToLastWriteWins() {
        assertIs<LastWriteWinsResolver>(ConflictStrategy.resolverFor("transactions"))
    }

    @Test
    fun accountsDefaultToLastWriteWins() {
        assertIs<LastWriteWinsResolver>(ConflictStrategy.resolverFor("accounts"))
    }

    // --- Enum entries ---

    @Test
    fun allStrategiesHaveResolvers() {
        ConflictStrategy.entries.forEach { strategy ->
            // Just verify that the resolver is not null and is a ConflictResolver.
            assertTrue(strategy.resolver is ConflictResolver, "${strategy.name} must have a resolver")
        }
    }

    @Test
    fun serverWinsStrategyUsesServerWinsResolver() {
        assertIs<ServerWinsResolver>(ConflictStrategy.SERVER_WINS.resolver)
    }

    @Test
    fun clientWinsStrategyUsesClientWinsResolver() {
        assertIs<ClientWinsResolver>(ConflictStrategy.CLIENT_WINS.resolver)
    }

    // --- resolveAll batch ---

    @Test
    fun resolveAllProcessesAllConflicts() {
        val resolver = LastWriteWinsResolver()
        val conflicts = listOf(
            SyncConflict(
                tableName = "accounts",
                recordId = "a1",
                localData = mapOf("id" to "a1", "name" to "Local A"),
                serverData = mapOf("id" to "a1", "name" to "Server A"),
                localVersion = 1,
                serverVersion = 2,
                localTimestamp = Instant.parse("2024-01-01T10:00:00Z"),
                serverTimestamp = Instant.parse("2024-01-01T12:00:00Z"),
                localOperation = MutationOperation.UPDATE,
                serverOperation = MutationOperation.UPDATE,
            ),
            SyncConflict(
                tableName = "transactions",
                recordId = "t1",
                localData = null,
                serverData = mapOf("id" to "t1", "amount" to "5000"),
                localVersion = 3,
                serverVersion = 5,
                localTimestamp = Instant.parse("2024-01-01T10:00:00Z"),
                serverTimestamp = Instant.parse("2024-01-01T12:00:00Z"),
                localOperation = MutationOperation.DELETE,
                serverOperation = MutationOperation.UPDATE,
            ),
        )

        val results = resolver.resolveAll(conflicts)

        assertEquals(2, results.size)

        // First conflict: server version higher → AcceptServer.
        val (firstConflict, firstResolution) = results[0]
        assertEquals("a1", firstConflict.recordId)
        assertIs<ConflictResolution.AcceptServer>(firstResolution)

        // Second conflict: local delete but server has higher version → AcceptServer (revived).
        val (secondConflict, secondResolution) = results[1]
        assertEquals("t1", secondConflict.recordId)
        assertIs<ConflictResolution.AcceptServer>(secondResolution)
    }

    @Test
    fun resolveAllWithEmptyListReturnsEmpty() {
        val resolver = ServerWinsResolver()
        val results = resolver.resolveAll(emptyList())
        assertTrue(results.isEmpty())
    }
}
