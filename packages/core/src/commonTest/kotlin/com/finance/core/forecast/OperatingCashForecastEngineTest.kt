// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.forecast

import com.finance.models.types.Cents
import kotlin.math.roundToLong
import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlinx.datetime.LocalDate
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class OperatingCashForecastEngineTest {
    @Test
    fun expandsPayrollTaxBillsAndOneOffScenariosThroughHorizon() {
        val result = OperatingCashForecastEngine.forecast(
            OperatingCashForecastInput(
                startDate = LocalDate(2025, 4, 20),
                startingBalance = Cents(100_000),
                horizons = listOf(30),
                recurringCommitments = listOf(
                    payroll(nextDueDate = LocalDate(2025, 4, 25)),
                    bill(nextDueDate = LocalDate(2025, 5, 1)),
                    tax(nextDueDate = LocalDate(2025, 4, 30)),
                ),
                oneOffEntries = listOf(
                    oneOffOutflow("repair", "Car repair", 15_000, LocalDate(2025, 4, 22)),
                ),
            ),
        )

        assertEquals(LocalDate(2025, 5, 20), result.endDate)
        assertEquals(31, result.balancePoints.size)
        assertEquals(Cents(335_000), result.endingBalance)
        assertEquals(Cents(400_000), result.horizonSnapshots.single().committedInflow)
        assertEquals(Cents(165_000), result.horizonSnapshots.single().committedOutflow)
        assertEquals(
            listOf(
                LocalDate(2025, 4, 22),
                LocalDate(2025, 4, 25),
                LocalDate(2025, 4, 30),
                LocalDate(2025, 5, 1),
                LocalDate(2025, 5, 9),
            ),
            result.occurrences.map { it.date },
        )
    }

    @Test
    fun excludesAsOfDateEntriesAndIncludesHorizonBoundary() {
        val result = OperatingCashForecastEngine.forecast(
            OperatingCashForecastInput(
                startDate = LocalDate(2025, 1, 1),
                startingBalance = Cents(10_000),
                horizons = listOf(10),
                oneOffEntries = listOf(
                    oneOffOutflow("same-day", "Already reflected", 999, LocalDate(2025, 1, 1)),
                    oneOffOutflow("boundary", "Boundary bill", 3_000, LocalDate(2025, 1, 11)),
                    oneOffOutflow("after", "After horizon", 9_000, LocalDate(2025, 1, 12)),
                ),
            ),
        )

        assertEquals(Cents(7_000), result.endingBalance)
        assertEquals(listOf("boundary"), result.occurrences.map { it.sourceId })
        assertEquals(LocalDate(2025, 1, 11), result.horizonSnapshots.single().targetDate)
    }

    @Test
    fun detectsFirstNegativeAndSafetyBufferThresholdBreaches() {
        val result = OperatingCashForecastEngine.forecast(
            OperatingCashForecastInput(
                startDate = LocalDate(2025, 1, 1),
                startingBalance = Cents(10_000),
                horizons = listOf(10),
                thresholds = listOf(
                    ForecastBalanceThreshold.ZERO,
                    ForecastBalanceThreshold("buffer", Cents(5_000), "Safety buffer"),
                ),
                oneOffEntries = listOf(
                    oneOffOutflow("utility", "Utility", 6_000, LocalDate(2025, 1, 3)),
                    oneOffOutflow("rent", "Rent", 5_000, LocalDate(2025, 1, 4)),
                    oneOffOutflow("ignored", "Later bill", 1_000, LocalDate(2025, 1, 8)),
                ),
            ),
        )

        assertEquals(
            listOf(
                ForecastThresholdBreach("buffer", Cents(5_000), LocalDate(2025, 1, 3), Cents(4_000)),
                ForecastThresholdBreach("zero", Cents.ZERO, LocalDate(2025, 1, 4), Cents(-1_000)),
            ),
            result.thresholdBreaches,
        )
    }

    @Test
    fun reportsStartDateBreachForAlreadyLowStartingBalanceAndSupportsZeroDayHorizon() {
        val result = OperatingCashForecastEngine.forecast(
            OperatingCashForecastInput(
                startDate = LocalDate(2025, 2, 1),
                startingBalance = Cents(-2_500),
                horizons = listOf(0),
            ),
        )

        assertEquals(LocalDate(2025, 2, 1), result.endDate)
        assertEquals(Cents(-2_500), result.endingBalance)
        assertEquals(1, result.balancePoints.size)
        assertEquals(
            listOf(ForecastThresholdBreach("zero", Cents.ZERO, LocalDate(2025, 2, 1), Cents(-2_500))),
            result.thresholdBreaches,
        )
    }

    @Test
    fun honorsRecurringEndDateAndOccurrenceLimit() {
        val result = OperatingCashForecastEngine.forecast(
            OperatingCashForecastInput(
                startDate = LocalDate(2025, 1, 1),
                startingBalance = Cents.ZERO,
                horizons = listOf(60),
                recurringCommitments = listOf(
                    payroll(
                        id = "limited-payroll",
                        amount = 10_000,
                        nextDueDate = LocalDate(2025, 1, 10),
                        maxOccurrences = 2,
                    ),
                    bill(
                        id = "ending-bill",
                        amount = 1_000,
                        nextDueDate = LocalDate(2025, 1, 15),
                        endsOn = LocalDate(2025, 2, 15),
                    ),
                ),
            ),
        )

        assertEquals(
            listOf(
                LocalDate(2025, 1, 10),
                LocalDate(2025, 1, 15),
                LocalDate(2025, 1, 24),
                LocalDate(2025, 2, 15),
            ),
            result.occurrences.map { it.date },
        )
        assertEquals(Cents(18_000), result.endingBalance)
    }

    @Test
    fun horizonSnapshotsUseWebParityDefaultHorizonsRecurringImpactAndConfidenceBands() {
        val result = OperatingCashForecastEngine.forecast(
            OperatingCashForecastInput(
                startDate = LocalDate(2025, 4, 20),
                startingBalance = Cents(100_000),
                recurringCommitments = listOf(
                    bill(
                        id = "rent",
                        amount = 50_000,
                        nextDueDate = LocalDate(2025, 5, 1),
                        cadence = ForecastCadence.EVERY_N_DAYS,
                        intervalDays = 30,
                    ),
                ),
                baselineDailyNet = Cents(6_600),
                dailyNetDeviation = Cents(1_000),
                confidence = ForecastConfidence.MEDIUM,
            ),
        )

        val snapshots = result.horizonSnapshots.associateBy { it.horizonDays }
        assertEquals(listOf(7, 30, 90), result.horizonSnapshots.map { it.horizonDays })
        assertEquals(Cents(146_200), snapshots.getValue(7).expectedBalance)
        assertEquals(Cents(248_000), snapshots.getValue(30).expectedBalance)
        assertEquals(Cents(544_000), snapshots.getValue(90).expectedBalance)

        val band30 = (1.64 * 1_000.0 * sqrt(30.0)).roundToLong()
        assertEquals(Cents(248_000 - band30), snapshots.getValue(30).lowBalance)
        assertEquals(Cents(248_000 + band30), snapshots.getValue(30).highBalance)
    }

    @Test
    fun serializesInputAndResultRoundTrips() {
        val json = Json { encodeDefaults = true }
        val input = OperatingCashForecastInput(
            startDate = LocalDate(2025, 6, 1),
            startingBalance = Cents(50_000),
            horizons = listOf(7),
            recurringCommitments = listOf(payroll(nextDueDate = LocalDate(2025, 6, 6))),
            oneOffEntries = listOf(oneOffOutflow("scenario", "Scenario", 1_234, LocalDate(2025, 6, 2))),
            thresholds = listOf(ForecastBalanceThreshold.ZERO),
            baselineDailyNet = Cents(-500),
            dailyNetDeviation = Cents(250),
            confidence = ForecastConfidence.LOW,
        )

        val decodedInput = json.decodeFromString<OperatingCashForecastInput>(json.encodeToString(input))
        val result = OperatingCashForecastEngine.forecast(decodedInput)
        val decodedResult = json.decodeFromString<OperatingCashForecastResult>(json.encodeToString(result))

        assertEquals(input, decodedInput)
        assertEquals(result, decodedResult)
    }

    @Test
    fun validatesUnsupportedCadenceAndNegativeAmounts() {
        assertFailsWith<IllegalArgumentException> {
            RecurringForecastCommitment(
                id = "custom",
                description = "Custom cadence",
                amount = Cents(1_000),
                direction = ForecastCashFlowDirection.OUTFLOW,
                kind = ForecastCashFlowKind.BILL,
                cadence = ForecastCadence.EVERY_N_DAYS,
                nextDueDate = LocalDate(2025, 1, 1),
            )
        }
        assertFailsWith<IllegalArgumentException> {
            oneOffOutflow("bad", "Bad", -1, LocalDate(2025, 1, 1))
        }
        assertFailsWith<IllegalArgumentException> {
            OperatingCashForecastInput(
                startDate = LocalDate(2025, 1, 1),
                startingBalance = Cents.ZERO,
                horizons = emptyList(),
            )
        }
        assertTrue(ForecastBalanceThreshold.ZERO.description.isNotBlank())
    }

    private fun payroll(
        id: String = "payroll",
        amount: Long = 200_000,
        nextDueDate: LocalDate,
        maxOccurrences: Int? = null,
    ): RecurringForecastCommitment = RecurringForecastCommitment(
        id = id,
        description = "Payroll",
        amount = Cents(amount),
        direction = ForecastCashFlowDirection.INFLOW,
        kind = ForecastCashFlowKind.PAYROLL,
        cadence = ForecastCadence.BIWEEKLY,
        nextDueDate = nextDueDate,
        maxOccurrences = maxOccurrences,
    )

    private fun bill(
        id: String = "rent",
        amount: Long = 120_000,
        nextDueDate: LocalDate,
        cadence: ForecastCadence = ForecastCadence.MONTHLY,
        intervalDays: Int? = null,
        endsOn: LocalDate? = null,
    ): RecurringForecastCommitment = RecurringForecastCommitment(
        id = id,
        description = "Bill",
        amount = Cents(amount),
        direction = ForecastCashFlowDirection.OUTFLOW,
        kind = ForecastCashFlowKind.BILL,
        cadence = cadence,
        nextDueDate = nextDueDate,
        intervalDays = intervalDays,
        endsOn = endsOn,
    )

    private fun tax(nextDueDate: LocalDate): RecurringForecastCommitment = RecurringForecastCommitment(
        id = "quarterly-tax",
        description = "Quarterly tax",
        amount = Cents(30_000),
        direction = ForecastCashFlowDirection.OUTFLOW,
        kind = ForecastCashFlowKind.TAX,
        cadence = ForecastCadence.QUARTERLY,
        nextDueDate = nextDueDate,
    )

    private fun oneOffOutflow(
        id: String,
        description: String,
        amount: Long,
        date: LocalDate,
    ): OneOffForecastEntry = OneOffForecastEntry(
        id = id,
        description = description,
        amount = Cents(amount),
        direction = ForecastCashFlowDirection.OUTFLOW,
        date = date,
    )
}
