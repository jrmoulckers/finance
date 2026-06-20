// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.mileage

import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class MileageCalculatorTest {
    private val json = Json { encodeDefaults = true }
    private val now = Instant.parse("2025-01-02T12:00:00Z")
    private val platform = GigPlatformLink(
        platformId = "doordash",
        displayName = "DoorDash",
        accountId = "dasher-123",
    )

    private fun audit(
        source: MileageAuditSource = MileageAuditSource.MANUAL,
        externalTripId: String? = null,
        externalShiftId: String? = null,
    ): MileageAuditMetadata = MileageAuditMetadata(
        source = source,
        platform = if (source == MileageAuditSource.PLATFORM_IMPORT) platform else null,
        externalTripId = externalTripId,
        externalShiftId = externalShiftId,
        supportReference = "calendar:event-1",
        createdAt = now,
        updatedAt = now,
        importedAt = if (source == MileageAuditSource.PLATFORM_IMPORT) now else null,
    )

    private fun trip(
        id: String,
        date: LocalDate,
        miles: Double,
        purpose: MileagePurpose = MileagePurpose.BUSINESS,
        businessUsePercent: Int = 100,
        externalShiftId: String? = null,
    ): MileageTripEntry = MileageTripEntry(
        id = id,
        date = date,
        startLocation = "Home Office",
        endLocation = "Client Site",
        miles = miles,
        purpose = purpose,
        businessUsePercent = businessUsePercent,
        audit = audit(
            source = if (externalShiftId == null) MileageAuditSource.MANUAL else MileageAuditSource.PLATFORM_IMPORT,
            externalTripId = "platform-$id",
            externalShiftId = externalShiftId,
        ),
    )

    @Test
    fun irsStandardMileageRatesUseIntegerCentsPerMile() {
        assertEquals(67L, MileageCalculator.getMileageRate(MileagePurpose.BUSINESS, 2024)?.centsPerMile)
        assertEquals(21L, MileageCalculator.getMileageRate(MileagePurpose.MEDICAL, 2024)?.centsPerMile)
        assertEquals(21L, MileageCalculator.getMileageRate(MileagePurpose.MOVING, 2024)?.centsPerMile)
        assertEquals(14L, MileageCalculator.getMileageRate(MileagePurpose.CHARITY, 2024)?.centsPerMile)
        assertEquals(70L, MileageCalculator.getMileageRate(MileagePurpose.BUSINESS, 2025)?.centsPerMile)
    }

    @Test
    fun unsupportedYearReturnsNullForDeductiblePurposes() {
        assertEquals(null, MileageCalculator.getMileageRate(MileagePurpose.BUSINESS, 2026))
        assertEquals(0L, MileageCalculator.getMileageRate(MileagePurpose.PERSONAL, 2026)?.centsPerMile)
    }

    @Test
    fun calculatesWebParityMileageDeductionsInCents() {
        assertEquals(
            3_350L,
            MileageCalculator.calculateMileageDeduction(50.0, MileagePurpose.BUSINESS, 2024).deductionCents,
        )
        assertEquals(
            8_040L,
            MileageCalculator.calculateMileageDeduction(120.0, MileagePurpose.BUSINESS, 2024).deductionCents,
        )
        assertEquals(
            630L,
            MileageCalculator.calculateMileageDeduction(30.0, MileagePurpose.MEDICAL, 2024).deductionCents,
        )
        assertEquals(
            210L,
            MileageCalculator.calculateMileageDeduction(15.0, MileagePurpose.CHARITY, 2024).deductionCents,
        )
    }

    @Test
    fun roundsFractionalMilesBeforeCalculatingIntegerCents() {
        assertEquals(
            838L,
            MileageCalculator.calculateMileageDeduction(12.5, MileagePurpose.BUSINESS, 2024).deductionCents,
        )
        assertEquals(
            824L,
            MileageCalculator.calculateMileageDeduction(12.25, MileagePurpose.BUSINESS, 2024).deductionCents,
        )
    }

    @Test
    fun appliesBusinessUsePercentOnlyToBusinessTrips() {
        assertEquals(
            930L,
            MileageCalculator.calculateMileageDeduction(
                miles = 18.5,
                purpose = MileagePurpose.BUSINESS,
                taxYear = 2024,
                businessUsePercent = 75,
            ).deductionCents,
        )
        assertEquals(
            389L,
            MileageCalculator.calculateMileageDeduction(
                miles = 18.5,
                purpose = MileagePurpose.MEDICAL,
                taxYear = 2024,
                businessUsePercent = 1,
            ).deductionCents,
        )
    }

    @Test
    fun personalAndNonPositiveTripsDeductZero() {
        assertEquals(
            0L,
            MileageCalculator.calculateMileageDeduction(25.0, MileagePurpose.PERSONAL, 2024).deductionCents,
        )
        assertEquals(
            0L,
            MileageCalculator.calculateMileageDeduction(0.0, MileagePurpose.BUSINESS, 2024).deductionCents,
        )
        assertEquals(
            0L,
            MileageCalculator.calculateMileageDeduction(-1.0, MileagePurpose.BUSINESS, 2024).deductionCents,
        )
    }

    @Test
    fun tripDateSelectsCorrectYearBoundaryRate() {
        val lastDay2024 = trip("year-end", LocalDate(2024, 12, 31), 10.0)
        val firstDay2025 = trip("new-year", LocalDate(2025, 1, 1), 10.0)

        assertEquals(67L, MileageCalculator.calculateTripDeduction(lastDay2024).rateCentsPerMile)
        assertEquals(670L, MileageCalculator.calculateTripDeduction(lastDay2024).deductionCents)
        assertEquals(70L, MileageCalculator.calculateTripDeduction(firstDay2025).rateCentsPerMile)
        assertEquals(700L, MileageCalculator.calculateTripDeduction(firstDay2025).deductionCents)
    }

    @Test
    fun calculatesTripMilesFromDirectMilesOrOdometerReadings() {
        assertEquals(12.3, MileageCalculator.calculateTripMiles(MileageDistanceInput(miles = 12.25)))
        assertEquals(
            18.5,
            MileageCalculator.calculateTripMiles(
                MileageDistanceInput(odometerStart = 12_500.1, odometerEnd = 12_518.6),
            ),
        )
        assertFailsWith<IllegalArgumentException> {
            MileageCalculator.calculateTripMiles(MileageDistanceInput(odometerStart = 20.0, odometerEnd = 19.9))
        }
    }

    @Test
    fun createsTripEntriesFromRoutePresets() {
        val preset = RoutePreset(
            id = "home-client",
            name = "Home to Client",
            startLocation = "Home",
            endLocation = "Client HQ",
            defaultMiles = 42.24,
            defaultPurpose = MileagePurpose.BUSINESS,
            defaultBusinessUsePercent = 80,
            platform = platform,
        )

        val created = MileageCalculator.createTripEntryFromPreset(
            id = "trip-preset",
            date = LocalDate(2025, 2, 3),
            preset = preset,
            audit = audit(MileageAuditSource.ROUTE_PRESET),
        )

        assertEquals("home-client", created.routePresetId)
        assertEquals(42.2, created.miles)
        assertEquals(2_363L, MileageCalculator.calculateTripDeduction(created).deductionCents)
    }

    @Test
    fun generatesAnnualMileageSummaryMatchingWebFixture() {
        val trips = listOf(
            trip("trip-1", LocalDate(2024, 3, 15), 50.0),
            trip("trip-2", LocalDate(2024, 4, 20), 120.0),
            trip("trip-3", LocalDate(2024, 5, 10), 30.0, MileagePurpose.MEDICAL),
            trip("trip-4", LocalDate(2024, 6, 1), 15.0, MileagePurpose.CHARITY),
            trip("trip-5", LocalDate(2023, 12, 15), 80.0),
            trip("personal", LocalDate(2024, 7, 1), 10.0, MileagePurpose.PERSONAL),
        )

        val summary = MileageCalculator.generateAnnualMileageSummary(trips, 2024)

        assertEquals(2024, summary.year)
        assertEquals(225.0, summary.totalLoggedMiles)
        assertEquals(215.0, summary.totalDeductibleMiles)
        assertEquals(5, summary.totalTripCount)
        assertEquals(4, summary.deductibleTripCount)
        assertEquals(12_230L, summary.totalDeductionCents)
        assertEquals(11_390L, summary.byPurpose.first { it.purpose == MileagePurpose.BUSINESS }.deductionCents)
    }

    @Test
    fun handlesEmptyAnnualSummary() {
        val summary = MileageCalculator.generateAnnualMileageSummary(emptyList(), 2024)

        assertEquals(0.0, summary.totalLoggedMiles)
        assertEquals(0.0, summary.totalDeductibleMiles)
        assertEquals(0L, summary.totalDeductionCents)
        assertEquals(0, summary.totalTripCount)
        assertEquals(IRS_DEDUCTIBLE_MILEAGE_PURPOSES.size, summary.byPurpose.size)
        assertTrue(summary.byPurpose.all { it.tripCount == 0 && it.deductionCents == 0L })
    }

    @Test
    fun summarizesGigShiftUsingTripIdsAndPlatformAuditLinks() {
        val shift = WorkShiftSession(
            id = "shift-1",
            platform = platform,
            startedAt = Instant.parse("2025-03-01T15:00:00Z"),
            endedAt = Instant.parse("2025-03-01T20:00:00Z"),
            tripIds = listOf("trip-a"),
            grossEarningsCents = 12_500L,
            audit = audit(MileageAuditSource.PLATFORM_IMPORT, externalShiftId = "shift-1"),
        )
        val trips = listOf(
            trip("trip-a", LocalDate(2025, 3, 1), 25.0),
            trip("trip-b", LocalDate(2025, 3, 1), 10.0, MileagePurpose.CHARITY, externalShiftId = "shift-1"),
            trip("trip-c", LocalDate(2025, 3, 2), 99.0),
        )

        val summary = MileageCalculator.summarizeShift(shift, trips)

        assertEquals("shift-1", summary.shiftId)
        assertEquals(platform, summary.platform)
        assertEquals(2, summary.tripCount)
        assertEquals(35.0, summary.totalMiles)
        assertEquals(35.0, summary.deductibleMiles)
        assertEquals(1_890L, summary.mileageDeductionCents)
        assertEquals(10_610L, summary.netAfterMileageDeductionCents)
    }

    @Test
    fun validatesMileageTripEdgeCases() {
        val zeroMiles = trip("zero", LocalDate(2024, 1, 1), 0.0)
        val highMiles = trip("high", LocalDate(2024, 1, 1), 15_000.0)

        assertTrue(MileageCalculator.validateTripEntry(zeroMiles).contains("Miles must be greater than zero."))
        assertTrue(MileageCalculator.validateTripEntry(highMiles).any { it.contains("10,000") })
        assertFalse(MileageCalculator.validateTripEntry(trip("ok", LocalDate(2024, 1, 1), 1.0)).isNotEmpty())
    }

    @Test
    fun serializesMileageTripRoutePresetAndShiftContracts() {
        val routePreset = RoutePreset(
            id = "airport",
            name = "Airport pickup",
            startLocation = "Airport",
            endLocation = "Downtown",
            defaultMiles = 14.4,
            platform = platform,
        )
        val mileageTrip = trip(
            id = "trip-json",
            date = LocalDate(2025, 4, 10),
            miles = 14.4,
            externalShiftId = "shift-json",
        )
        val shift = WorkShiftSession(
            id = "shift-json",
            platform = platform,
            startedAt = Instant.parse("2025-04-10T09:00:00Z"),
            endedAt = Instant.parse("2025-04-10T11:00:00Z"),
            tripIds = listOf(mileageTrip.id),
            grossEarningsCents = 5_000L,
            audit = audit(MileageAuditSource.PLATFORM_IMPORT, externalShiftId = "shift-json"),
        )

        val decodedPreset = json.decodeFromString<RoutePreset>(json.encodeToString(routePreset))
        val decodedTrip = json.decodeFromString<MileageTripEntry>(json.encodeToString(mileageTrip))
        val decodedShift = json.decodeFromString<WorkShiftSession>(json.encodeToString(shift))

        assertEquals(routePreset, decodedPreset)
        assertEquals(mileageTrip, decodedTrip)
        assertEquals(shift, decodedShift)
        assertNotNull(decodedTrip.audit.platform)
    }

    @Test
    fun serializesAnnualAndShiftSummaries() {
        val annualSummary = MileageCalculator.generateAnnualMileageSummary(
            listOf(trip("trip-2025", LocalDate(2025, 5, 5), 10.0)),
            2025,
        )
        val shiftSummary = ShiftDeductionSummary(
            shiftId = "summary-shift",
            platform = platform,
            tripCount = 1,
            totalMiles = 10.0,
            deductibleMiles = 10.0,
            mileageDeductionCents = 700L,
            grossEarningsCents = 2_500L,
        )

        assertEquals(annualSummary, json.decodeFromString<AnnualMileageSummary>(json.encodeToString(annualSummary)))
        assertEquals(shiftSummary, json.decodeFromString<ShiftDeductionSummary>(json.encodeToString(shiftSummary)))
    }
}
