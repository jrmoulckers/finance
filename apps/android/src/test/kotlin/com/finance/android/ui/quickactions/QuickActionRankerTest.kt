// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.quickactions

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for [DeterministicQuickActionRanker] and the supporting
 * on-device ranking primitives (#2396).
 *
 * Coverage:
 * - Cold-start defaults (no usage history) order by base prior.
 * - Stale-model fallback ignores usage and reverts to base priors.
 * - Recency / frequency boosts move used actions up.
 * - Time-of-day, pending-import, and upcoming-bill signals.
 * - Pin (always first), disable (excluded), dismiss (excluded) controls.
 * - Determinism: identical signals → identical output.
 */
class QuickActionRankerTest {

    private val ranker = DeterministicQuickActionRanker()

    // ── Cold start ──────────────────────────────────────────────────────

    @Test
    fun `cold start orders by base prior`() {
        val signals = QuickActionSignals(timeBucket = TimeBucket.NIGHT)
        val ranked = ranker.rank(signals)

        // ADD_EXPENSE has the highest base prior, VIEW_INSIGHTS the lowest.
        assertEquals(QuickActionType.ADD_EXPENSE, ranked.first().type)
        assertEquals(QuickActionType.VIEW_INSIGHTS, ranked.last().type)
        assertTrue(ranked.all { it.reason == RankReason.COLD_START })
    }

    @Test
    fun `cold start surfaces all non-disabled actions`() {
        val ranked = ranker.rank(QuickActionSignals(timeBucket = TimeBucket.MORNING))
        assertEquals(QuickActionType.entries.size, ranked.size)
    }

    @Test
    fun `cold start scores are monotonically non-increasing`() {
        val ranked = ranker.rank(QuickActionSignals(timeBucket = TimeBucket.NIGHT))
        for (i in 1 until ranked.size) {
            assertTrue(ranked[i - 1].score >= ranked[i].score)
        }
    }

    // ── Stale fallback ──────────────────────────────────────────────────

    @Test
    fun `stale model reverts to base priors despite usage`() {
        val signals = QuickActionSignals(
            timeBucket = TimeBucket.EVENING,
            usage = mapOf(
                QuickActionType.VIEW_INSIGHTS to ActionUsage(activationCount = 9, recencyDays = 0),
            ),
            modelAgeMinutes = DeterministicQuickActionRanker.STALE_THRESHOLD_MINUTES,
        )
        val ranked = ranker.rank(signals)

        // Despite heavy recent use of VIEW_INSIGHTS, stale fallback keeps the
        // base-prior ordering with ADD_EXPENSE first.
        assertEquals(QuickActionType.ADD_EXPENSE, ranked.first().type)
        assertTrue(ranked.all { it.reason == RankReason.STALE_FALLBACK })
    }

    @Test
    fun `fresh model below stale threshold uses live signals`() {
        val signals = QuickActionSignals(
            timeBucket = TimeBucket.EVENING,
            usage = mapOf(
                QuickActionType.VIEW_INSIGHTS to ActionUsage(activationCount = 9, recencyDays = 0),
            ),
            modelAgeMinutes = DeterministicQuickActionRanker.STALE_THRESHOLD_MINUTES - 1,
        )
        val ranked = ranker.rank(signals)
        assertFalse(ranked.all { it.reason == RankReason.STALE_FALLBACK })
    }

    // ── Recency / frequency ─────────────────────────────────────────────

    @Test
    fun `recent frequent use boosts an action above its base rank`() {
        val coldStartRank = ranker.rank(QuickActionSignals(timeBucket = TimeBucket.NIGHT))
            .indexOfFirst { it.type == QuickActionType.VIEW_INSIGHTS }

        val signals = QuickActionSignals(
            timeBucket = TimeBucket.NIGHT,
            usage = mapOf(
                QuickActionType.VIEW_INSIGHTS to ActionUsage(activationCount = 10, recencyDays = 0),
            ),
        )
        val boostedRank = ranker.rank(signals)
            .indexOfFirst { it.type == QuickActionType.VIEW_INSIGHTS }

        assertTrue(boostedRank < coldStartRank, "Expected VIEW_INSIGHTS to rank higher after use")
    }

    @Test
    fun `more recent use scores higher than older use`() {
        fun scoreFor(recencyDays: Int): Double {
            val signals = QuickActionSignals(
                timeBucket = TimeBucket.NIGHT,
                usage = mapOf(
                    QuickActionType.VIEW_BUDGETS to ActionUsage(activationCount = 3, recencyDays = recencyDays),
                ),
            )
            return ranker.rank(signals).first { it.type == QuickActionType.VIEW_BUDGETS }.score
        }
        assertTrue(scoreFor(0) > scoreFor(30))
    }

    // ── Time of day ─────────────────────────────────────────────────────

    @Test
    fun `morning boosts bills check`() {
        val signals = QuickActionSignals(
            timeBucket = TimeBucket.MORNING,
            usage = mapOf(QuickActionType.ADD_EXPENSE to ActionUsage(1, 5)),
        )
        val checkBills = ranker.rank(signals).first { it.type == QuickActionType.CHECK_BILLS }
        assertEquals(RankReason.TIME_OF_DAY, checkBills.reason)
    }

    // ── Contextual signals ──────────────────────────────────────────────

    @Test
    fun `pending imports boosts review imports`() {
        val signals = QuickActionSignals(
            timeBucket = TimeBucket.NIGHT,
            usage = mapOf(QuickActionType.ADD_EXPENSE to ActionUsage(1, 10)),
            pendingImportCount = 5,
        )
        val ranked = ranker.rank(signals)
        val review = ranked.first { it.type == QuickActionType.REVIEW_IMPORTS }
        assertEquals(RankReason.PENDING_IMPORTS, review.reason)
        // It should out-rank an unused INCOME action.
        val reviewIdx = ranked.indexOfFirst { it.type == QuickActionType.REVIEW_IMPORTS }
        val incomeIdx = ranked.indexOfFirst { it.type == QuickActionType.ADD_INCOME }
        assertTrue(reviewIdx < incomeIdx)
    }

    @Test
    fun `upcoming bills boosts check bills`() {
        val signals = QuickActionSignals(
            timeBucket = TimeBucket.NIGHT,
            usage = mapOf(QuickActionType.ADD_EXPENSE to ActionUsage(1, 10)),
            upcomingBillCount = 4,
        )
        val bills = ranker.rank(signals).first { it.type == QuickActionType.CHECK_BILLS }
        assertEquals(RankReason.UPCOMING_BILLS, bills.reason)
    }

    @Test
    fun `zero contextual counts add no boost`() {
        val base = ranker.rank(
            QuickActionSignals(
                timeBucket = TimeBucket.NIGHT,
                usage = mapOf(QuickActionType.ADD_EXPENSE to ActionUsage(1, 10)),
            ),
        ).first { it.type == QuickActionType.REVIEW_IMPORTS }.score

        val withZero = ranker.rank(
            QuickActionSignals(
                timeBucket = TimeBucket.NIGHT,
                usage = mapOf(QuickActionType.ADD_EXPENSE to ActionUsage(1, 10)),
                pendingImportCount = 0,
            ),
        ).first { it.type == QuickActionType.REVIEW_IMPORTS }.score

        assertEquals(base, withZero, 0.0001)
    }

    // ── User controls ───────────────────────────────────────────────────

    @Test
    fun `pinned action is always first`() {
        val signals = QuickActionSignals(
            timeBucket = TimeBucket.NIGHT,
            pinned = setOf(QuickActionType.VIEW_INSIGHTS),
        )
        val ranked = ranker.rank(signals)
        assertEquals(QuickActionType.VIEW_INSIGHTS, ranked.first().type)
        assertTrue(ranked.first().pinned)
        assertEquals(RankReason.PINNED, ranked.first().reason)
    }

    @Test
    fun `multiple pinned actions sort before all unpinned`() {
        val signals = QuickActionSignals(
            timeBucket = TimeBucket.NIGHT,
            pinned = setOf(QuickActionType.VIEW_INSIGHTS, QuickActionType.VIEW_BUDGETS),
        )
        val ranked = ranker.rank(signals)
        assertTrue(ranked[0].pinned)
        assertTrue(ranked[1].pinned)
        assertFalse(ranked[2].pinned)
    }

    @Test
    fun `disabled action is excluded`() {
        val signals = QuickActionSignals(
            timeBucket = TimeBucket.NIGHT,
            disabled = setOf(QuickActionType.ADD_EXPENSE),
        )
        val ranked = ranker.rank(signals)
        assertTrue(ranked.none { it.type == QuickActionType.ADD_EXPENSE })
        assertEquals(QuickActionType.entries.size - 1, ranked.size)
    }

    @Test
    fun `dismissed action is excluded`() {
        val signals = QuickActionSignals(
            timeBucket = TimeBucket.NIGHT,
            dismissed = setOf(QuickActionType.CHECK_BILLS),
        )
        val ranked = ranker.rank(signals)
        assertTrue(ranked.none { it.type == QuickActionType.CHECK_BILLS })
    }

    @Test
    fun `disabling everything yields empty list`() {
        val signals = QuickActionSignals(
            timeBucket = TimeBucket.NIGHT,
            disabled = QuickActionType.entries.toSet(),
        )
        assertTrue(ranker.rank(signals).isEmpty())
    }

    // ── Determinism ─────────────────────────────────────────────────────

    @Test
    fun `identical signals yield identical output`() {
        val signals = QuickActionSignals(
            timeBucket = TimeBucket.EVENING,
            usage = mapOf(
                QuickActionType.ADD_EXPENSE to ActionUsage(4, 1),
                QuickActionType.VIEW_BUDGETS to ActionUsage(2, 3),
            ),
            pendingImportCount = 2,
            upcomingBillCount = 1,
        )
        assertEquals(ranker.rank(signals), ranker.rank(signals))
    }

    // ── TimeBucket mapping ──────────────────────────────────────────────

    @Test
    fun `time bucket maps hours correctly`() {
        assertEquals(TimeBucket.MORNING, TimeBucket.fromHour(8))
        assertEquals(TimeBucket.MIDDAY, TimeBucket.fromHour(13))
        assertEquals(TimeBucket.EVENING, TimeBucket.fromHour(19))
        assertEquals(TimeBucket.NIGHT, TimeBucket.fromHour(2))
        assertEquals(TimeBucket.NIGHT, TimeBucket.fromHour(23))
    }

    @Test
    fun `time bucket coerces out of range hours`() {
        assertEquals(TimeBucket.fromHour(8), TimeBucket.fromHour(32))
        assertEquals(TimeBucket.fromHour(2), TimeBucket.fromHour(-22))
    }

    // ── Shortcut descriptors ────────────────────────────────────────────

    @Test
    fun `shortcut descriptors truncate to platform budget`() {
        val ranked = ranker.rank(QuickActionSignals(timeBucket = TimeBucket.MORNING))
        val descriptors = QuickActionShortcuts.toDescriptors(ranked)
        assertEquals(QuickActionShortcuts.MAX_DYNAMIC_SHORTCUTS, descriptors.size)
        // Descriptors carry only non-PII ids and routes.
        assertEquals(ranked.first().type.id, descriptors.first().id)
        assertEquals(ranked.first().type.route, descriptors.first().route)
    }

    @Test
    fun `fromId round-trips every action`() {
        for (type in QuickActionType.entries) {
            assertEquals(type, QuickActionType.fromId(type.id))
        }
        assertEquals(null, QuickActionType.fromId("unknown_key"))
    }
}
