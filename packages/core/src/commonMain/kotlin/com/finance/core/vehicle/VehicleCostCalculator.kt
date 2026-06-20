// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.vehicle

import kotlin.math.floor

/** Shared KMP engine for actual vehicle operating cost-per-mile calculations. */
object VehicleCostCalculator {
    fun aggregate(
        vehicle: Vehicle,
        milesDriven: Double,
        fixedCosts: List<VehicleFixedCost> = emptyList(),
        variableCosts: List<VehicleVariableCost> = emptyList(),
        fillUps: List<VehicleFillUp> = emptyList(),
        repairs: List<VehicleRepair> = emptyList(),
        maintenanceIntervals: List<VehicleMaintenanceInterval> = emptyList(),
        businessUseAllocation: BusinessUseAllocation = BusinessUseAllocation(),
    ): VehicleCostSummary {
        require(milesDriven.isFinite() && milesDriven >= 0.0) { "milesDriven must be finite and non-negative" }

        val vehicleFixedCosts = fixedCosts.filter { it.vehicleId == vehicle.id }
        val vehicleVariableCosts = variableCosts.filter { it.vehicleId == vehicle.id }
        val vehicleFillUps = fillUps.filter { it.vehicleId == vehicle.id }
        val vehicleRepairs = repairs.filter { it.vehicleId == vehicle.id }
        val vehicleMaintenanceIntervals = maintenanceIntervals.filter { it.vehicleId == vehicle.id }

        val fixedCostCents = vehicleFixedCosts.sumOf { it.amountCents }
        val variableCostCents = vehicleVariableCosts.sumOf { it.amountCents }
        val fuelCostCents = vehicleFillUps.sumOf { it.totalCostCents }
        val repairCostCents = vehicleRepairs.sumOf { it.totalCostCents }
        val maintenanceReserveCents = calculateMaintenanceReserveCents(milesDriven, vehicleMaintenanceIntervals)
        val totalOperatingCostCents = fixedCostCents +
            variableCostCents +
            fuelCostCents +
            repairCostCents +
            maintenanceReserveCents
        val businessAllocatedCostCents = allocateBusinessCost(
            totalOperatingCostCents,
            businessUseAllocation,
        )

        return VehicleCostSummary(
            vehicleId = vehicle.id,
            totalMiles = milesDriven,
            fixedCostCents = fixedCostCents,
            variableCostCents = variableCostCents,
            fuelCostCents = fuelCostCents,
            repairCostCents = repairCostCents,
            maintenanceReserveCents = maintenanceReserveCents,
            totalOperatingCostCents = totalOperatingCostCents,
            costPerMileCents = calculateCostPerMile(totalOperatingCostCents, milesDriven),
            businessUsePercent = businessUseAllocation.businessUsePercent,
            businessAllocatedCostCents = businessAllocatedCostCents,
            businessAllocatedCostPerMileCents = calculateCostPerMile(businessAllocatedCostCents, milesDriven),
            fixedCostCount = vehicleFixedCosts.size,
            variableCostCount = vehicleVariableCosts.size,
            fillUpCount = vehicleFillUps.size,
            repairCount = vehicleRepairs.size,
            maintenanceIntervalCount = vehicleMaintenanceIntervals.size,
        )
    }

    /** Integer cents per mile rounded half-up; zero miles returns 0 to avoid division by zero. */
    fun calculateCostPerMile(totalCostCents: Long, milesDriven: Double): Long {
        require(totalCostCents >= 0L) { "totalCostCents must be non-negative" }
        require(milesDriven.isFinite() && milesDriven >= 0.0) { "milesDriven must be finite and non-negative" }
        if (totalCostCents == 0L || milesDriven == 0.0) return 0L
        return roundHalfUp(totalCostCents / milesDriven)
    }

    fun allocateBusinessCost(totalCostCents: Long, allocation: BusinessUseAllocation): Long {
        require(totalCostCents >= 0L) { "totalCostCents must be non-negative" }
        return roundHalfUpRatio(totalCostCents, allocation.businessUsePercent, 100L)
    }

    fun calculateMaintenanceReserveCents(
        milesDriven: Double,
        intervals: List<VehicleMaintenanceInterval>,
    ): Long {
        require(milesDriven.isFinite() && milesDriven >= 0.0) { "milesDriven must be finite and non-negative" }
        if (milesDriven == 0.0) return 0L
        return intervals.sumOf { interval ->
            roundHalfUp(interval.expectedCostCents * (milesDriven / interval.intervalMiles))
        }
    }

    private fun roundHalfUp(value: Double): Long {
        require(value.isFinite() && value >= 0.0) { "value must be finite and non-negative" }
        return floor(value + 0.5).toLong()
    }

    private fun roundHalfUpRatio(amount: Long, numerator: Int, denominator: Long): Long {
        require(amount >= 0L) { "amount must be non-negative" }
        require(numerator >= 0) { "numerator must be non-negative" }
        require(denominator > 0L) { "denominator must be positive" }
        return ((amount * numerator) + (denominator / 2L)) / denominator
    }
}
