// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.vehicle

import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable

/** A vehicle whose actual operating costs are tracked for profitability views. */
@Serializable
data class Vehicle(
    val id: String,
    val displayName: String,
    val make: String? = null,
    val model: String? = null,
    val year: Int? = null,
) {
    init {
        require(id.isNotBlank()) { "Vehicle id is required" }
        require(displayName.isNotBlank()) { "Vehicle displayName is required" }
        require(year == null || year > 0) { "Vehicle year must be positive" }
    }
}

@Serializable
enum class VehicleFixedCostCategory {
    INSURANCE,
    REGISTRATION,
    LOAN_OR_LEASE,
    DEPRECIATION,
    PERMIT,
    PARKING_SUBSCRIPTION,
    OTHER,
}

@Serializable
enum class VehicleVariableCostCategory {
    TOLLS,
    PARKING,
    CAR_WASH,
    SUPPLIES,
    OTHER,
}

@Serializable
enum class VehicleRepairCategory {
    MECHANICAL,
    BODY,
    TIRES,
    DIAGNOSTIC,
    OTHER,
}

/** Fixed vehicle cost incurred for the aggregation window, stored in integer cents. */
@Serializable
data class VehicleFixedCost(
    val id: String,
    val vehicleId: String,
    val name: String,
    val amountCents: Long,
    val category: VehicleFixedCostCategory = VehicleFixedCostCategory.OTHER,
    val dueDate: LocalDate? = null,
) {
    init {
        require(id.isNotBlank()) { "Fixed cost id is required" }
        require(vehicleId.isNotBlank()) { "vehicleId is required" }
        require(name.isNotBlank()) { "Fixed cost name is required" }
        require(amountCents >= 0L) { "Fixed cost amountCents must be non-negative" }
    }
}

/** Non-fuel variable vehicle cost incurred for the aggregation window, stored in integer cents. */
@Serializable
data class VehicleVariableCost(
    val id: String,
    val vehicleId: String,
    val name: String,
    val amountCents: Long,
    val category: VehicleVariableCostCategory = VehicleVariableCostCategory.OTHER,
    val date: LocalDate? = null,
) {
    init {
        require(id.isNotBlank()) { "Variable cost id is required" }
        require(vehicleId.isNotBlank()) { "vehicleId is required" }
        require(name.isNotBlank()) { "Variable cost name is required" }
        require(amountCents >= 0L) { "Variable cost amountCents must be non-negative" }
    }
}

/** A fuel fill-up record used as an actual vehicle operating cost. */
@Serializable
data class VehicleFillUp(
    val id: String,
    val vehicleId: String,
    val date: LocalDate,
    val totalCostCents: Long,
    val gallons: Double,
    val odometerMiles: Double? = null,
    val vendor: String? = null,
    val fullTank: Boolean = true,
) {
    init {
        require(id.isNotBlank()) { "Fill-up id is required" }
        require(vehicleId.isNotBlank()) { "vehicleId is required" }
        require(totalCostCents >= 0L) { "Fill-up totalCostCents must be non-negative" }
        require(gallons.isFinite() && gallons > 0.0) { "Fill-up gallons must be finite and greater than zero" }
        require(odometerMiles == null || (odometerMiles.isFinite() && odometerMiles >= 0.0)) {
            "Fill-up odometerMiles must be finite and non-negative"
        }
    }
}

/** A repair cost incurred for the vehicle in integer cents. */
@Serializable
data class VehicleRepair(
    val id: String,
    val vehicleId: String,
    val date: LocalDate,
    val description: String,
    val totalCostCents: Long,
    val category: VehicleRepairCategory = VehicleRepairCategory.OTHER,
    val odometerMiles: Double? = null,
) {
    init {
        require(id.isNotBlank()) { "Repair id is required" }
        require(vehicleId.isNotBlank()) { "vehicleId is required" }
        require(description.isNotBlank()) { "Repair description is required" }
        require(totalCostCents >= 0L) { "Repair totalCostCents must be non-negative" }
        require(odometerMiles == null || (odometerMiles.isFinite() && odometerMiles >= 0.0)) {
            "Repair odometerMiles must be finite and non-negative"
        }
    }
}

/** Expected recurring maintenance reserve, prorated by miles driven in an aggregation. */
@Serializable
data class VehicleMaintenanceInterval(
    val id: String,
    val vehicleId: String,
    val name: String,
    val intervalMiles: Double,
    val expectedCostCents: Long,
    val lastServicedOdometerMiles: Double? = null,
) {
    init {
        require(id.isNotBlank()) { "Maintenance interval id is required" }
        require(vehicleId.isNotBlank()) { "vehicleId is required" }
        require(name.isNotBlank()) { "Maintenance interval name is required" }
        require(intervalMiles.isFinite() && intervalMiles > 0.0) {
            "Maintenance intervalMiles must be finite and greater than zero"
        }
        require(expectedCostCents >= 0L) { "Maintenance expectedCostCents must be non-negative" }
        require(lastServicedOdometerMiles == null ||
            (lastServicedOdometerMiles.isFinite() && lastServicedOdometerMiles >= 0.0)) {
            "Maintenance lastServicedOdometerMiles must be finite and non-negative"
        }
    }
}

/** Percentage of operating costs allocated to business use. */
@Serializable
data class BusinessUseAllocation(
    val businessUsePercent: Int = 100,
) {
    init {
        require(businessUsePercent in 0..100) { "businessUsePercent must be in 0..100" }
    }
}

/**
 * Aggregated actual operating-cost output for one vehicle.
 *
 * Cost-per-mile fields are integer cents per mile rounded half-up from non-negative decimal values.
 * For example, 101 cents over 2 miles becomes 51 cents per mile.
 */
@Serializable
data class VehicleCostSummary(
    val vehicleId: String,
    val totalMiles: Double,
    val fixedCostCents: Long,
    val variableCostCents: Long,
    val fuelCostCents: Long,
    val repairCostCents: Long,
    val maintenanceReserveCents: Long,
    val totalOperatingCostCents: Long,
    val costPerMileCents: Long,
    val businessUsePercent: Int,
    val businessAllocatedCostCents: Long,
    val businessAllocatedCostPerMileCents: Long,
    val fixedCostCount: Int,
    val variableCostCount: Int,
    val fillUpCount: Int,
    val repairCount: Int,
    val maintenanceIntervalCount: Int,
)
