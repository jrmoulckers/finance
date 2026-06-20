// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.quickaction

import kotlinx.datetime.Instant
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class QuickActionRankingTest {
    private val json = Json { encodeDefaults = true }

    @Test
    fun score_usesDocumentedFreshAggregateMath() {
        val candidate = candidate(
            id = "review",
            baseScore = 40,
            signals = QuickActionSignals(
                impressionCount = 3,
                selectionCount = 2,
                completionCount = 1,
                dismissalCount = 1,
                isFresh = true,
            ),
        )

        assertEquals(59, QuickActionLocalScorer.score(candidate))
    }

    @Test
    fun score_ignoresStaleSignals() {
        val candidate = candidate(
            id = "stale",
            baseScore = 40,
            signals = QuickActionSignals(
                impressionCount = 99,
                selectionCount = 99,
                completionCount = 99,
                dismissalCount = 0,
                isFresh = false,
            ),
        )

        assertEquals(40, QuickActionLocalScorer.score(candidate))
    }

    @Test
    fun rank_appliesOverridePrecedencePinnedNormalDismissedDisabled() {
        val ranked = QuickActionRanker.rank(
            candidates = listOf(
                candidate(id = "normal", defaultOrder = 0),
                candidate(id = "dismissed", defaultOrder = 1),
                candidate(id = "disabled", defaultOrder = 2),
                candidate(id = "pinned", defaultOrder = 9),
            ),
            overrides = QuickActionOverrides(
                pinnedActionIds = listOf("pinned"),
                dismissedActionIds = setOf("pinned", "dismissed"),
                disabledActionIds = setOf("pinned", "disabled"),
            ),
        )

        assertEquals(listOf("pinned", "normal", "dismissed"), ranked.map { it.candidate.id })
        assertEquals(QuickActionOverrideState.PINNED, ranked[0].overrideState)
        assertEquals(QuickActionOverrideState.NORMAL, ranked[1].overrideState)
        assertEquals(QuickActionOverrideState.DISMISSED, ranked[2].overrideState)
    }

    @Test
    fun rank_whenNoFreshSignalsUsesStaleFallbackDefaultOrder() {
        val ranked = QuickActionRanker.rank(
            candidates = listOf(
                candidate(
                    id = "high-stale-score",
                    defaultOrder = 2,
                    baseScore = 100,
                    signals = QuickActionSignals(selectionCount = 10, isFresh = false),
                ),
                candidate(id = "first-default", defaultOrder = 0, baseScore = 1),
            ),
        )

        assertEquals(listOf("first-default", "high-stale-score"), ranked.map { it.candidate.id })
        assertTrue(ranked.all { it.fallbackApplied })
    }

    @Test
    fun rank_emptyCandidatesReturnsSensibleDefaultOrderedSet() {
        val ranked = QuickActionRanker.rank(candidates = emptyList(), limit = 3)

        assertEquals(
            listOf("add-transaction", "review-transactions", "open-budgets"),
            ranked.map { it.candidate.id },
        )
        assertTrue(ranked.all { it.fallbackApplied })
    }

    @Test
    fun rank_withFreshSignalsUsesDeterministicTieBreaks() {
        val sharedSignals = QuickActionSignals(selectionCount = 1, isFresh = true)
        val ranked = QuickActionRanker.rank(
            candidates = listOf(
                candidate(id = "beta", defaultOrder = 1, type = QuickActionType.OPEN_BUDGETS, signals = sharedSignals),
                candidate(id = "earlier", defaultOrder = 0, type = QuickActionType.VIEW_INSIGHTS, signals = sharedSignals),
                candidate(id = "alpha", defaultOrder = 1, type = QuickActionType.OPEN_BUDGETS, signals = sharedSignals),
            ),
        )

        assertEquals(listOf("earlier", "alpha", "beta"), ranked.map { it.candidate.id })
        assertFalse(ranked.any { it.fallbackApplied })
    }

    @Test
    fun quickActionModels_serializeRoundTrip() {
        val candidate = candidate(
            id = "import-transactions",
            type = QuickActionType.IMPORT_TRANSACTIONS,
            signals = QuickActionSignals(
                impressionCount = 5,
                selectionCount = 3,
                completionCount = 2,
                dismissalCount = 1,
                isFresh = true,
            ),
        )
        val overrides = QuickActionOverrides(
            pinnedActionIds = listOf("import-transactions"),
            dismissedActionIds = setOf("view-insights"),
            disabledActionIds = setOf("toggle-privacy-mode"),
        )
        val event = QuickActionUsefulnessEvent(
            timestamp = Instant.parse("2025-01-02T03:04:05Z"),
            shownCount = 10,
            selectedCount = 4,
            completedCount = 3,
            dismissedCount = 2,
            pinnedCount = 1,
            disabledCount = 1,
            staleFallbackCount = 1,
        )

        assertEquals(candidate, json.decodeFromString(json.encodeToString(candidate)))
        assertEquals(overrides, json.decodeFromString(json.encodeToString(overrides)))
        assertEquals(event, json.decodeFromString(json.encodeToString(event)))
    }

    @Test
    fun usefulnessEvent_containsOnlyPrivacySafeAggregateCounts() {
        val event = QuickActionUsefulnessEvent(
            timestamp = Instant.parse("2025-01-02T03:04:05Z"),
            shownCount = 10,
            selectedCount = 4,
            completedCount = 3,
            dismissedCount = 2,
            pinnedCount = 1,
            disabledCount = 1,
            staleFallbackCount = 1,
        )

        assertEquals("quick_action_usefulness", event.name)
        assertTrue(event.hasOnlyAggregateCountProperties())
        assertTrue(event.properties.keys.all { it.endsWith("_count") })
        assertTrue(event.properties.values.all { value -> value.all { it in '0'..'9' } })

        val encoded = json.encodeToString(event).lowercase()
        assertFalse(encoded.contains("account"))
        assertFalse(encoded.contains("amount"))
        assertFalse(encoded.contains("payee"))
        assertFalse(encoded.contains("transactionid"))
        assertFalse(encoded.contains("actionid"))
    }

    private fun candidate(
        id: String,
        defaultOrder: Int = 0,
        baseScore: Int = 50,
        type: QuickActionType = QuickActionType.ADD_TRANSACTION,
        signals: QuickActionSignals = QuickActionSignals(),
    ): QuickActionCandidate = QuickActionCandidate(
        id = id,
        type = type,
        titleKey = "quick_action.$id.title",
        descriptionKey = "quick_action.$id.description",
        destination = id,
        defaultOrder = defaultOrder,
        baseScore = baseScore,
        signals = signals,
    )
}
