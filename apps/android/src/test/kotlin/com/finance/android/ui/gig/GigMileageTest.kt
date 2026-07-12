// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gig

import kotlinx.datetime.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Unit tests for [GigMileage] shift-based mileage maths (#2137). */
class GigMileageTest {

    private val t0 = Instant.fromEpochMilliseconds(1_700_000_000_000L)
    private val t1 = Instant.fromEpochMilliseconds(1_700_010_000_000L)

    private fun shift(
        id: String,
        platform: GigPlatform = GigPlatform.UBER,
        start: Int? = 1000,
        end: Int? = 1050,
        ended: Instant? = t1,
    ) = MileageShift(
        id = id,
        platform = platform,
        startedAt = t0,
        endedAt = ended,
        startOdometer = start,
        endOdometer = end,
    )

    @Test
    fun `computes miles from odometer readings`() {
        assertEquals(50, GigMileage.milesForShift(1000, 1050))
    }

    @Test
    fun `rejects missing, non-increasing, or implausible readings`() {
        assertNull(GigMileage.milesForShift(null, 1050))
        assertNull(GigMileage.milesForShift(1000, null))
        assertNull(GigMileage.milesForShift(1050, 1000))
        assertNull(GigMileage.milesForShift(1000, 1000))
        assertNull(GigMileage.milesForShift(0, GigMileage.MAX_SHIFT_MILES + 1))
        assertNull(GigMileage.milesForShift(-5, 10))
    }

    @Test
    fun `deduction uses the IRS rate with integer math`() {
        assertEquals(50L * 67L, GigMileage.deductionCents(50))
        assertEquals(0L, GigMileage.deductionCents(0))
        assertEquals(100L * 70L, GigMileage.deductionCents(100, rateCentsPerMile = 70))
    }

    @Test
    fun `totals only count completed shifts`() {
        val shifts = listOf(
            shift("a", start = 1000, end = 1050), // 50 mi
            shift("b", start = 2000, end = 2030), // 30 mi
            shift("c", ended = null), // active, excluded
        )
        assertEquals(80, GigMileage.totalMiles(shifts))
        assertEquals(80L * 67L, GigMileage.totalDeductionCents(shifts))
    }

    @Test
    fun `miles grouped by platform`() {
        val shifts = listOf(
            shift("a", platform = GigPlatform.UBER, start = 0, end = 40),
            shift("b", platform = GigPlatform.DOORDASH, start = 0, end = 25),
            shift("c", platform = GigPlatform.UBER, start = 0, end = 10),
        )
        val byPlatform = GigMileage.milesByPlatform(shifts)
        assertEquals(50, byPlatform[GigPlatform.UBER])
        assertEquals(25, byPlatform[GigPlatform.DOORDASH])
    }

    @Test
    fun `shift completeness reflects end time and valid mileage`() {
        assertTrue(shift("a").isComplete)
        assertFalse(shift("b", ended = null).isComplete)
        assertTrue(shift("c", ended = null).isActive)
        assertFalse(shift("d", end = 500).isComplete) // end < start -> null miles
    }

    @Test
    fun `csv is deterministic with header and dollar formatting`() {
        val csv = GigMileage.toCsv(listOf(shift("a", start = 1000, end = 1050)))
        val lines = csv.split("\n")
        assertEquals("platform,start,end,miles,deduction_usd", lines[0])
        assertTrue(lines[1].startsWith("Uber,"))
        assertTrue(lines[1].endsWith(",50,33.50")) // 50 * 67c = 3350c = $33.50
    }
}
