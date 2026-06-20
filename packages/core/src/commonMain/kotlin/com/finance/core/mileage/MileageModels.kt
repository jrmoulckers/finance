// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.mileage

import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

/** Purpose category for IRS standard mileage deduction calculations. */
@Serializable
enum class MileagePurpose {
    BUSINESS,
    MEDICAL,
    MOVING,
    CHARITY,
    PERSONAL,
}

/** Mileage purposes with an IRS standard cents-per-mile rate. */
val IRS_DEDUCTIBLE_MILEAGE_PURPOSES: List<MileagePurpose> = listOf(
    MileagePurpose.BUSINESS,
    MileagePurpose.MEDICAL,
    MileagePurpose.MOVING,
    MileagePurpose.CHARITY,
)

/** IRS standard mileage rate for one tax year and purpose, in integer cents per mile. */
@Serializable
data class MileageRate(
    val taxYear: Int,
    val purpose: MileagePurpose,
    val centsPerMile: Long,
) {
    init {
        require(taxYear > 0) { "taxYear must be positive" }
        require(centsPerMile >= 0) { "centsPerMile must be non-negative" }
        require(purpose != MileagePurpose.PERSONAL || centsPerMile == 0L) {
            "Personal mileage rates must be zero"
        }
    }
}

/** Deduction calculation for a mileage entry. */
@Serializable
data class MileageCalculation(
    val rateCentsPerMile: Long,
    val deductionCents: Long,
    val appliedYear: Int,
)

/** External gig-work platform metadata attached to shifts, routes, and imported trips. */
@Serializable
data class GigPlatformLink(
    val platformId: String,
    val displayName: String,
    val accountId: String? = null,
) {
    init {
        require(platformId.isNotBlank()) { "platformId is required" }
        require(displayName.isNotBlank()) { "displayName is required" }
    }
}

/** Origin of a mileage-log audit event. */
@Serializable
enum class MileageAuditSource {
    MANUAL,
    PLATFORM_IMPORT,
    CALENDAR,
    ODOMETER,
    ROUTE_PRESET,
}

/** Platform-neutral audit metadata for substantiating mileage and shift records. */
@Serializable
data class MileageAuditMetadata(
    val source: MileageAuditSource = MileageAuditSource.MANUAL,
    val platform: GigPlatformLink? = null,
    val externalTripId: String? = null,
    val externalShiftId: String? = null,
    val supportReference: String? = null,
    val createdAt: Instant,
    val updatedAt: Instant = createdAt,
    val importedAt: Instant? = null,
) {
    init {
        require(updatedAt >= createdAt) { "updatedAt must be on or after createdAt" }
    }
}

/** Reusable route template for frequent gig, client, medical, charity, or commute-like trips. */
@Serializable
data class RoutePreset(
    val id: String,
    val name: String,
    val startLocation: String,
    val endLocation: String,
    val defaultMiles: Double? = null,
    val defaultPurpose: MileagePurpose = MileagePurpose.BUSINESS,
    val defaultBusinessUsePercent: Int = 100,
    val platform: GigPlatformLink? = null,
    val notes: String = "",
) {
    init {
        require(id.isNotBlank()) { "Route preset id is required" }
        require(name.isNotBlank()) { "Route preset name is required" }
        require(startLocation.isNotBlank()) { "Start location is required" }
        require(endLocation.isNotBlank()) { "End location is required" }
        require(defaultMiles == null || (defaultMiles.isFinite() && defaultMiles >= 0.0)) {
            "defaultMiles must be finite and non-negative"
        }
        require(defaultBusinessUsePercent in 0..100) { "defaultBusinessUsePercent must be in 0..100" }
    }
}

/** Draft distance fields used to derive logged trip miles. */
@Serializable
data class MileageDistanceInput(
    val miles: Double? = null,
    val odometerStart: Double? = null,
    val odometerEnd: Double? = null,
)

/** A single mileage-log trip entry. */
@Serializable
data class MileageTripEntry(
    val id: String,
    val date: LocalDate,
    val startLocation: String,
    val endLocation: String,
    val miles: Double,
    val purpose: MileagePurpose,
    val odometerStart: Double? = null,
    val odometerEnd: Double? = null,
    val businessUsePercent: Int = 100,
    val routePresetId: String? = null,
    val vehicle: String? = null,
    val notes: String = "",
    val audit: MileageAuditMetadata,
) {
    init {
        require(id.isNotBlank()) { "Trip id is required" }
        require(startLocation.isNotBlank()) { "Start location is required" }
        require(endLocation.isNotBlank()) { "End location is required" }
        require(miles.isFinite() && miles >= 0.0) { "Miles must be finite and non-negative" }
        require(businessUsePercent in 0..100) { "businessUsePercent must be in 0..100" }
        if (odometerStart != null || odometerEnd != null) {
            require(odometerStart != null && odometerEnd != null) {
                "Both odometerStart and odometerEnd are required when using odometer readings"
            }
            require(odometerStart.isFinite() && odometerEnd.isFinite()) { "Odometer values must be finite" }
            require(odometerEnd >= odometerStart) { "Ending odometer must be greater than or equal to starting odometer" }
        }
    }
}

/** Gig-work shift/session that can group imported or manually-entered mileage trips. */
@Serializable
data class WorkShiftSession(
    val id: String,
    val platform: GigPlatformLink? = null,
    val startedAt: Instant,
    val endedAt: Instant? = null,
    val startingOdometer: Double? = null,
    val endingOdometer: Double? = null,
    val tripIds: List<String> = emptyList(),
    val grossEarningsCents: Long? = null,
    val notes: String = "",
    val audit: MileageAuditMetadata,
) {
    init {
        require(id.isNotBlank()) { "Shift id is required" }
        require(endedAt == null || endedAt >= startedAt) { "endedAt must be on or after startedAt" }
        require(grossEarningsCents == null || grossEarningsCents >= 0L) { "grossEarningsCents must be non-negative" }
        if (startingOdometer != null || endingOdometer != null) {
            require(startingOdometer != null && endingOdometer != null) {
                "Both startingOdometer and endingOdometer are required when using odometer readings"
            }
            require(startingOdometer.isFinite() && endingOdometer.isFinite()) { "Odometer values must be finite" }
            require(endingOdometer >= startingOdometer) {
                "Ending odometer must be greater than or equal to starting odometer"
            }
        }
    }

    val isClosed: Boolean get() = endedAt != null
}

/** Mileage totals for one deductible purpose within a year. */
@Serializable
data class MileagePurposeSummary(
    val purpose: MileagePurpose,
    val totalMiles: Double,
    val tripCount: Int,
    val rateCentsPerMile: Long,
    val deductionCents: Long,
)

/** Annual tax-ready mileage summary. */
@Serializable
data class AnnualMileageSummary(
    val year: Int,
    val byPurpose: List<MileagePurposeSummary>,
    val totalLoggedMiles: Double,
    val totalDeductibleMiles: Double,
    val totalDeductionCents: Long,
    val totalTripCount: Int,
    val deductibleTripCount: Int,
)

/** Shift-level mileage deduction summary for gig-work sessions. */
@Serializable
data class ShiftDeductionSummary(
    val shiftId: String,
    val platform: GigPlatformLink? = null,
    val tripCount: Int,
    val totalMiles: Double,
    val deductibleMiles: Double,
    val mileageDeductionCents: Long,
    val grossEarningsCents: Long? = null,
    val netAfterMileageDeductionCents: Long? = grossEarningsCents?.minus(mileageDeductionCents),
)
