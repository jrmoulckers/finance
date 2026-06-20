// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.mileage

import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/** Shared IRS mileage rates and platform-neutral mileage/shift deduction calculators. */
object MileageCalculator {
    val mileageRates2024: List<MileageRate> = listOf(
        MileageRate(2024, MileagePurpose.BUSINESS, 67L),
        MileageRate(2024, MileagePurpose.MEDICAL, 21L),
        MileageRate(2024, MileagePurpose.MOVING, 21L),
        MileageRate(2024, MileagePurpose.CHARITY, 14L),
    )

    val mileageRates2025: List<MileageRate> = listOf(
        MileageRate(2025, MileagePurpose.BUSINESS, 70L),
        MileageRate(2025, MileagePurpose.MEDICAL, 21L),
        MileageRate(2025, MileagePurpose.MOVING, 21L),
        MileageRate(2025, MileagePurpose.CHARITY, 14L),
    )

    val standardMileageRatesByYear: Map<Int, List<MileageRate>> = listOf(
        mileageRates2024,
        mileageRates2025,
    ).associateBy { rates -> rates.first().taxYear }

    fun getMileageRate(purpose: MileagePurpose, taxYear: Int): MileageRate? {
        if (purpose == MileagePurpose.PERSONAL) return MileageRate(taxYear, MileagePurpose.PERSONAL, 0L)
        return standardMileageRatesByYear[taxYear]?.firstOrNull { it.purpose == purpose }
    }

    fun calculateMileageDeduction(
        miles: Double,
        purpose: MileagePurpose,
        taxYear: Int,
        businessUsePercent: Int = 100,
    ): MileageCalculation {
        require(businessUsePercent in 0..100) { "businessUsePercent must be in 0..100" }
        val rate = requireNotNull(getMileageRate(purpose, taxYear)) {
            "No mileage rate found for $purpose in $taxYear."
        }

        if (!miles.isFinite() || miles <= 0.0 || purpose == MileagePurpose.PERSONAL) {
            return MileageCalculation(rate.centsPerMile, 0L, taxYear)
        }

        val roundedMiles = roundMiles(miles)
        val effectiveMiles = if (purpose == MileagePurpose.BUSINESS) {
            roundedMiles * (businessUsePercent / 100.0)
        } else {
            roundedMiles
        }

        return MileageCalculation(
            rateCentsPerMile = rate.centsPerMile,
            deductionCents = (effectiveMiles * rate.centsPerMile).roundToLong(),
            appliedYear = taxYear,
        )
    }

    fun calculateTripDeduction(trip: MileageTripEntry): MileageCalculation =
        calculateMileageDeduction(
            miles = trip.miles,
            purpose = trip.purpose,
            taxYear = trip.date.year,
            businessUsePercent = trip.businessUsePercent,
        )

    fun calculateTripMiles(input: MileageDistanceInput): Double {
        input.miles?.let { miles ->
            require(miles.isFinite() && miles >= 0.0) { "Miles must be finite and non-negative" }
            if (miles > 0.0) return roundMiles(miles)
        }

        val start = input.odometerStart
        val end = input.odometerEnd
        require(start != null) { "Enter miles directly or provide odometer readings" }
        require(end != null) { "Ending odometer is required when using odometer readings" }
        require(start.isFinite() && end.isFinite()) { "Odometer values must be finite" }
        require(end >= start) { "Ending odometer must be greater than or equal to starting odometer" }
        return roundMiles(end - start)
    }

    fun createTripEntry(
        id: String,
        date: kotlinx.datetime.LocalDate,
        startLocation: String,
        endLocation: String,
        distance: MileageDistanceInput,
        purpose: MileagePurpose,
        audit: MileageAuditMetadata,
        businessUsePercent: Int = 100,
        routePresetId: String? = null,
        vehicle: String? = null,
        notes: String = "",
    ): MileageTripEntry = MileageTripEntry(
        id = id,
        date = date,
        startLocation = startLocation.trim(),
        endLocation = endLocation.trim(),
        miles = calculateTripMiles(distance),
        purpose = purpose,
        odometerStart = distance.odometerStart,
        odometerEnd = distance.odometerEnd,
        businessUsePercent = normalizeBusinessUsePercent(purpose, businessUsePercent),
        routePresetId = routePresetId,
        vehicle = vehicle?.trim()?.takeIf { it.isNotEmpty() },
        notes = notes.trim(),
        audit = audit,
    )

    fun createTripEntryFromPreset(
        id: String,
        date: kotlinx.datetime.LocalDate,
        preset: RoutePreset,
        audit: MileageAuditMetadata,
        milesOverride: Double? = null,
        notes: String = preset.notes,
    ): MileageTripEntry {
        val miles = milesOverride ?: preset.defaultMiles
        require(miles != null) { "Route preset requires defaultMiles or milesOverride" }
        return createTripEntry(
            id = id,
            date = date,
            startLocation = preset.startLocation,
            endLocation = preset.endLocation,
            distance = MileageDistanceInput(miles = miles),
            purpose = preset.defaultPurpose,
            audit = audit,
            businessUsePercent = preset.defaultBusinessUsePercent,
            routePresetId = preset.id,
            notes = notes,
        )
    }

    fun generateAnnualMileageSummary(
        trips: List<MileageTripEntry>,
        year: Int,
    ): AnnualMileageSummary {
        val yearTrips = trips.filter { it.date.year == year }
        val purposeSummaries = IRS_DEDUCTIBLE_MILEAGE_PURPOSES.map { purpose ->
            summarizePurpose(yearTrips, purpose, year)
        }
        val deductibleTrips = yearTrips.filter { it.purpose != MileagePurpose.PERSONAL }

        return AnnualMileageSummary(
            year = year,
            byPurpose = purposeSummaries,
            totalLoggedMiles = roundMiles(yearTrips.sumOf { it.miles }),
            totalDeductibleMiles = roundMiles(deductibleTrips.sumOf { effectiveDeductibleMiles(it) }),
            totalDeductionCents = purposeSummaries.sumOf { it.deductionCents },
            totalTripCount = yearTrips.size,
            deductibleTripCount = deductibleTrips.size,
        )
    }

    fun summarizeShift(
        shift: WorkShiftSession,
        trips: List<MileageTripEntry>,
    ): ShiftDeductionSummary {
        val tripIdSet = shift.tripIds.toSet()
        val matchingTrips = trips.filter { trip ->
            trip.id in tripIdSet || trip.audit.externalShiftId == shift.id
        }
        val deductionCents = matchingTrips.sumOf { calculateTripDeduction(it).deductionCents }

        return ShiftDeductionSummary(
            shiftId = shift.id,
            platform = shift.platform ?: matchingTrips.firstOrNull { it.audit.platform != null }?.audit?.platform,
            tripCount = matchingTrips.size,
            totalMiles = roundMiles(matchingTrips.sumOf { it.miles }),
            deductibleMiles = roundMiles(matchingTrips.sumOf { effectiveDeductibleMiles(it) }),
            mileageDeductionCents = deductionCents,
            grossEarningsCents = shift.grossEarningsCents,
        )
    }

    fun validateTripEntry(trip: MileageTripEntry): List<String> = buildList {
        if (trip.miles <= 0.0) add("Miles must be greater than zero.")
        if (trip.miles > 10_000.0) add("Miles exceeds 10,000 for a single trip — please verify.")
        if (trip.startLocation.isBlank()) add("Start location is required.")
        if (trip.endLocation.isBlank()) add("End location is required.")
        if (getMileageRate(trip.purpose, trip.date.year) == null) {
            add("No mileage rate found for ${trip.purpose} in ${trip.date.year}.")
        }
    }

    fun taxYearFor(instant: Instant, timeZone: TimeZone = TimeZone.UTC): Int =
        instant.toLocalDateTime(timeZone).date.year

    private fun summarizePurpose(
        trips: List<MileageTripEntry>,
        purpose: MileagePurpose,
        year: Int,
    ): MileagePurposeSummary {
        val matchingTrips = trips.filter { it.purpose == purpose }
        val rate = getMileageRate(purpose, year)?.centsPerMile ?: 0L
        return MileagePurposeSummary(
            purpose = purpose,
            totalMiles = roundMiles(matchingTrips.sumOf { effectiveDeductibleMiles(it) }),
            tripCount = matchingTrips.size,
            rateCentsPerMile = rate,
            deductionCents = matchingTrips.sumOf { calculateTripDeduction(it).deductionCents },
        )
    }

    private fun normalizeBusinessUsePercent(purpose: MileagePurpose, percent: Int): Int =
        if (purpose == MileagePurpose.BUSINESS) percent.coerceIn(0, 100) else 100

    private fun effectiveDeductibleMiles(trip: MileageTripEntry): Double = when (trip.purpose) {
        MileagePurpose.BUSINESS -> roundMiles(trip.miles) * (trip.businessUsePercent.coerceIn(0, 100) / 100.0)
        MileagePurpose.MEDICAL,
        MileagePurpose.MOVING,
        MileagePurpose.CHARITY -> roundMiles(trip.miles)
        MileagePurpose.PERSONAL -> 0.0
    }

    private fun roundMiles(value: Double): Double = (value * 10.0).roundToInt() / 10.0
}
