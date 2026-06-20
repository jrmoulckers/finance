// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.vehicle

import kotlinx.datetime.LocalDate
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class VehicleCostCalculatorTest {
    private val json = Json { encodeDefaults = true }
    private val vehicle = Vehicle(
        id = "vehicle-1",
        displayName = "Delivery Van",
        make = "Ford",
        model = "Transit",
        year = 2024,
    )
    private val date = LocalDate(2026, 1, 15)

    @Test
    fun roundsCostPerMileAndMaintenanceReserveHalfUp() {
        assertEquals(51L, VehicleCostCalculator.calculateCostPerMile(101L, 2.0))
        assertEquals(50L, VehicleCostCalculator.calculateCostPerMile(100L, 2.0))

        val interval = VehicleMaintenanceInterval(
            id = "oil",
            vehicleId = vehicle.id,
            name = "Oil change",
            intervalMiles = 40.0,
            expectedCostCents = 100L,
        )

        assertEquals(3L, VehicleCostCalculator.calculateMaintenanceReserveCents(1.0, listOf(interval)))
    }

    @Test
    fun aggregatesFixedVariableFillUpRepairAndMaintenanceCosts() {
        val summary = VehicleCostCalculator.aggregate(
            vehicle = vehicle,
            milesDriven = 100.0,
            fixedCosts = listOf(
                VehicleFixedCost("insurance", vehicle.id, "Insurance", 10_000L),
                VehicleFixedCost("other-insurance", "other-vehicle", "Other insurance", 99_999L),
            ),
            variableCosts = listOf(
                VehicleVariableCost("toll", vehicle.id, "Bridge toll", 500L, VehicleVariableCostCategory.TOLLS),
            ),
            fillUps = listOf(
                VehicleFillUp("fuel", vehicle.id, date, totalCostCents = 4_500L, gallons = 12.0),
            ),
            repairs = listOf(
                VehicleRepair("brakes", vehicle.id, date, "Brake pads", 20_000L, VehicleRepairCategory.MECHANICAL),
            ),
            maintenanceIntervals = listOf(
                VehicleMaintenanceInterval("tires", vehicle.id, "Tires", intervalMiles = 10_000.0, expectedCostCents = 8_000L),
            ),
            businessUseAllocation = BusinessUseAllocation(75),
        )

        assertEquals(10_000L, summary.fixedCostCents)
        assertEquals(500L, summary.variableCostCents)
        assertEquals(4_500L, summary.fuelCostCents)
        assertEquals(20_000L, summary.repairCostCents)
        assertEquals(80L, summary.maintenanceReserveCents)
        assertEquals(35_080L, summary.totalOperatingCostCents)
        assertEquals(351L, summary.costPerMileCents)
        assertEquals(26_310L, summary.businessAllocatedCostCents)
        assertEquals(263L, summary.businessAllocatedCostPerMileCents)
        assertEquals(1, summary.fixedCostCount)
    }

    @Test
    fun zeroMilesKeepsCostsButReturnsZeroCostPerMile() {
        val summary = VehicleCostCalculator.aggregate(
            vehicle = vehicle,
            milesDriven = 0.0,
            fixedCosts = listOf(VehicleFixedCost("registration", vehicle.id, "Registration", 1_001L)),
            businessUseAllocation = BusinessUseAllocation(50),
        )

        assertEquals(1_001L, summary.totalOperatingCostCents)
        assertEquals(0L, summary.costPerMileCents)
        assertEquals(501L, summary.businessAllocatedCostCents)
        assertEquals(0L, summary.businessAllocatedCostPerMileCents)
    }

    @Test
    fun businessUseAllocationRoundsHalfUpAndValidatesPercent() {
        assertEquals(5_003L, VehicleCostCalculator.allocateBusinessCost(10_005L, BusinessUseAllocation(50)))
        assertEquals(0L, VehicleCostCalculator.allocateBusinessCost(10_005L, BusinessUseAllocation(0)))
        assertEquals(10_005L, VehicleCostCalculator.allocateBusinessCost(10_005L, BusinessUseAllocation(100)))

        assertFailsWith<IllegalArgumentException> {
            BusinessUseAllocation(101)
        }
    }

    @Test
    fun emptyInputsProduceZeroCostSummary() {
        val summary = VehicleCostCalculator.aggregate(vehicle = vehicle, milesDriven = 25.0)

        assertEquals(vehicle.id, summary.vehicleId)
        assertEquals(25.0, summary.totalMiles)
        assertEquals(0L, summary.totalOperatingCostCents)
        assertEquals(0L, summary.costPerMileCents)
        assertEquals(0L, summary.businessAllocatedCostCents)
        assertEquals(0, summary.fixedCostCount)
        assertEquals(0, summary.variableCostCount)
        assertEquals(0, summary.fillUpCount)
        assertEquals(0, summary.repairCount)
        assertEquals(0, summary.maintenanceIntervalCount)
    }

    @Test
    fun serializesVehicleOperatingCostContracts() {
        val fixedCost = VehicleFixedCost(
            id = "loan",
            vehicleId = vehicle.id,
            name = "Loan payment",
            amountCents = 42_000L,
            category = VehicleFixedCostCategory.LOAN_OR_LEASE,
            dueDate = date,
        )
        val variableCost = VehicleVariableCost(
            id = "wash",
            vehicleId = vehicle.id,
            name = "Car wash",
            amountCents = 1_200L,
            category = VehicleVariableCostCategory.CAR_WASH,
            date = date,
        )
        val fillUp = VehicleFillUp(
            id = "fill-up",
            vehicleId = vehicle.id,
            date = date,
            totalCostCents = 6_400L,
            gallons = 16.0,
            odometerMiles = 12_345.6,
            vendor = "Fuel Stop",
        )
        val repair = VehicleRepair(
            id = "repair",
            vehicleId = vehicle.id,
            date = date,
            description = "Starter replacement",
            totalCostCents = 55_000L,
            category = VehicleRepairCategory.MECHANICAL,
            odometerMiles = 12_500.0,
        )
        val interval = VehicleMaintenanceInterval(
            id = "rotation",
            vehicleId = vehicle.id,
            name = "Tire rotation",
            intervalMiles = 5_000.0,
            expectedCostCents = 8_000L,
            lastServicedOdometerMiles = 10_000.0,
        )
        val allocation = BusinessUseAllocation(60)
        val summary = VehicleCostCalculator.aggregate(
            vehicle = vehicle,
            milesDriven = 500.0,
            fixedCosts = listOf(fixedCost),
            variableCosts = listOf(variableCost),
            fillUps = listOf(fillUp),
            repairs = listOf(repair),
            maintenanceIntervals = listOf(interval),
            businessUseAllocation = allocation,
        )

        assertEquals(vehicle, json.decodeFromString<Vehicle>(json.encodeToString(vehicle)))
        assertEquals(fixedCost, json.decodeFromString<VehicleFixedCost>(json.encodeToString(fixedCost)))
        assertEquals(variableCost, json.decodeFromString<VehicleVariableCost>(json.encodeToString(variableCost)))
        assertEquals(fillUp, json.decodeFromString<VehicleFillUp>(json.encodeToString(fillUp)))
        assertEquals(repair, json.decodeFromString<VehicleRepair>(json.encodeToString(repair)))
        assertEquals(interval, json.decodeFromString<VehicleMaintenanceInterval>(json.encodeToString(interval)))
        assertEquals(allocation, json.decodeFromString<BusinessUseAllocation>(json.encodeToString(allocation)))
        assertEquals(summary, json.decodeFromString<VehicleCostSummary>(json.encodeToString(summary)))
    }
}
