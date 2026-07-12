// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.gig

import kotlinx.datetime.Instant

/**
 * Shift-based mileage tracking for delivery / ride-share drivers (#2137).
 *
 * Drivers think in **shifts** ("I drove Friday 5–10pm"), not individual trips, and need to
 * capture miles from the car with minimal fuss — start a shift when they pull out of the
 * driveway, end it when they park. This file holds the pure, deterministic logic for
 * modelling shifts and turning odometer readings into deductible business miles. No I/O,
 * no Android APIs — the ViewModel/prefs layer owns persistence.
 *
 * Mileage is stored as whole miles (integers) to avoid float drift; deduction estimates
 * use the IRS standard mileage rate expressed in integer cents-per-mile.
 */
object GigMileage {

    /**
     * IRS standard business mileage rate for 2024, in cents per mile (67¢).
     *
     * The rate changes yearly; it is surfaced as a constant (not hard-coded at call sites)
     * and flagged for annual human review in the "Needs Human Action" section.
     */
    const val IRS_RATE_CENTS_PER_MILE_2024: Int = 67

    /** Largest plausible single-shift mileage; guards against odometer typos. */
    const val MAX_SHIFT_MILES: Int = 2_000

    /**
     * Computes business miles for a completed shift from odometer readings.
     *
     * @return miles driven (`end - start`), or `null` when the readings are missing,
     *   non-increasing, or exceed [MAX_SHIFT_MILES] (all of which indicate a data-entry
     *   error the UI should surface rather than silently record).
     */
    fun milesForShift(startOdometer: Int?, endOdometer: Int?): Int? {
        if (startOdometer == null || endOdometer == null) return null
        if (startOdometer < 0 || endOdometer < 0) return null
        val miles = endOdometer - startOdometer
        if (miles <= 0 || miles > MAX_SHIFT_MILES) return null
        return miles
    }

    /**
     * Estimated deduction in cents for [miles] at the given IRS [rateCentsPerMile].
     * Uses integer math so results are exact and reproducible.
     */
    fun deductionCents(miles: Int, rateCentsPerMile: Int = IRS_RATE_CENTS_PER_MILE_2024): Long =
        miles.toLong().coerceAtLeast(0L) * rateCentsPerMile.toLong()

    /** Total business miles across every [completed][MileageShift.isComplete] shift. */
    fun totalMiles(shifts: List<MileageShift>): Int =
        shifts.filter { it.isComplete }.sumOf { it.miles ?: 0 }

    /** Total estimated deduction (cents) across every completed shift. */
    fun totalDeductionCents(
        shifts: List<MileageShift>,
        rateCentsPerMile: Int = IRS_RATE_CENTS_PER_MILE_2024,
    ): Long = deductionCents(totalMiles(shifts), rateCentsPerMile)

    /** Miles grouped by the platform a shift was driven for (completed shifts only). */
    fun milesByPlatform(shifts: List<MileageShift>): Map<GigPlatform, Int> =
        shifts.filter { it.isComplete }
            .groupBy { it.platform }
            .mapValues { (_, group) -> group.sumOf { it.miles ?: 0 } }

    /**
     * Renders completed shifts as an IRS-audit-friendly CSV (one row per shift plus a
     * header). Columns: platform, start ISO-8601, end ISO-8601, miles, deduction (dollars).
     * The output is deterministic (stable column order, `.` decimal) so it can be
     * snapshot-tested and safely handed to a tax professional.
     */
    fun toCsv(
        shifts: List<MileageShift>,
        rateCentsPerMile: Int = IRS_RATE_CENTS_PER_MILE_2024,
    ): String {
        val header = "platform,start,end,miles,deduction_usd"
        val rows = shifts.filter { it.isComplete }.map { shift ->
            val miles = shift.miles ?: 0
            val deduction = deductionCents(miles, rateCentsPerMile)
            val dollars = "${deduction / 100}.${(deduction % 100).toString().padStart(2, '0')}"
            listOf(
                shift.platform.displayName,
                shift.startedAt.toString(),
                shift.endedAt?.toString().orEmpty(),
                miles.toString(),
                dollars,
            ).joinToString(",")
        }
        return (listOf(header) + rows).joinToString("\n")
    }
}

/**
 * One driving shift.
 *
 * A shift is *open* while [endedAt] is null (the driver is still out) and becomes
 * *complete* once ended with valid mileage. Odometer readings are optional at start so a
 * driver can tap "start shift" instantly and fill mileage when they park.
 *
 * @property id stable identifier (client-generated).
 * @property platform the gig platform this shift was primarily driven for.
 * @property startedAt when the shift began.
 * @property endedAt when the shift ended, or `null` if still active.
 * @property startOdometer odometer reading at start (whole miles), or `null`.
 * @property endOdometer odometer reading at end (whole miles), or `null`.
 */
data class MileageShift(
    val id: String,
    val platform: GigPlatform,
    val startedAt: Instant,
    val endedAt: Instant? = null,
    val startOdometer: Int? = null,
    val endOdometer: Int? = null,
) {
    /** Business miles for this shift, or `null` if incomputable (see [GigMileage.milesForShift]). */
    val miles: Int?
        get() = GigMileage.milesForShift(startOdometer, endOdometer)

    /** Whether the shift is over and has valid, recordable mileage. */
    val isComplete: Boolean
        get() = endedAt != null && miles != null

    /** Whether the shift is still in progress. */
    val isActive: Boolean
        get() = endedAt == null
}
