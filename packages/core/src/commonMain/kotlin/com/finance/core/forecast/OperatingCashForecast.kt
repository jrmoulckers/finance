// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.forecast

import com.finance.models.types.Cents
import kotlin.math.roundToLong
import kotlin.math.sqrt
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.plus
import kotlinx.serialization.Serializable

/** Cadences supported by the shared operating cash forecast engine. */
@Serializable
enum class ForecastCadence {
    DAILY,
    WEEKLY,
    BIWEEKLY,
    SEMIMONTHLY,
    MONTHLY,
    QUARTERLY,
    YEARLY,
    EVERY_N_DAYS,
}

/** Direction of a forecast cash movement. Amounts remain positive; direction controls the sign. */
@Serializable
enum class ForecastCashFlowDirection { INFLOW, OUTFLOW }

/** Business purpose for a recurring or scenario cash movement. */
@Serializable
enum class ForecastCashFlowKind {
    PAYROLL,
    TAX,
    BILL,
    TRANSFER,
    SCENARIO,
    OTHER,
}

/** Confidence preset used for horizon low/high bands. */
@Serializable
enum class ForecastConfidence {
    LOW,
    MEDIUM,
    HIGH,
}

/** Origin of a concrete forecast occurrence. */
@Serializable
enum class ForecastOccurrenceSource { RECURRING_COMMITMENT, ONE_OFF_SCENARIO }

/** A payroll, tax, bill, or other repeating operating cash commitment. */
@Serializable
data class RecurringForecastCommitment(
    val id: String,
    val description: String,
    val amount: Cents,
    val direction: ForecastCashFlowDirection,
    val kind: ForecastCashFlowKind,
    val cadence: ForecastCadence,
    val nextDueDate: LocalDate,
    val intervalDays: Int? = null,
    val endsOn: LocalDate? = null,
    val maxOccurrences: Int? = null,
) {
    init {
        require(id.isNotBlank()) { "Recurring commitment id cannot be blank" }
        require(description.isNotBlank()) { "Recurring commitment description cannot be blank" }
        require(amount.amount >= 0) { "Recurring commitment amount must be non-negative" }
        require(maxOccurrences == null || maxOccurrences > 0) { "maxOccurrences must be positive" }
        require(cadence != ForecastCadence.EVERY_N_DAYS || (intervalDays != null && intervalDays > 0)) {
            "EVERY_N_DAYS commitments require a positive intervalDays"
        }
        require(cadence == ForecastCadence.EVERY_N_DAYS || intervalDays == null) {
            "intervalDays is only valid with EVERY_N_DAYS cadence"
        }
    }
}

/** A one-time what-if entry such as a repair, bonus, tax payment, or bill adjustment. */
@Serializable
data class OneOffForecastEntry(
    val id: String,
    val description: String,
    val amount: Cents,
    val direction: ForecastCashFlowDirection,
    val kind: ForecastCashFlowKind = ForecastCashFlowKind.SCENARIO,
    val date: LocalDate,
) {
    init {
        require(id.isNotBlank()) { "One-off entry id cannot be blank" }
        require(description.isNotBlank()) { "One-off entry description cannot be blank" }
        require(amount.amount >= 0) { "One-off entry amount must be non-negative" }
    }
}

/** A balance floor to detect the first forecast breach. Use zero for overdraft detection. */
@Serializable
data class ForecastBalanceThreshold(
    val id: String,
    val amount: Cents = Cents.ZERO,
    val description: String = id,
) {
    init {
        require(id.isNotBlank()) { "Threshold id cannot be blank" }
    }

    companion object {
        val ZERO: ForecastBalanceThreshold = ForecastBalanceThreshold(
            id = "zero",
            amount = Cents.ZERO,
            description = "Negative balance",
        )
    }
}

/** Input for a deterministic operating cash forecast. */
@Serializable
data class OperatingCashForecastInput(
    val startDate: LocalDate,
    val startingBalance: Cents,
    val horizons: List<Int> = DEFAULT_HORIZONS,
    val recurringCommitments: List<RecurringForecastCommitment> = emptyList(),
    val oneOffEntries: List<OneOffForecastEntry> = emptyList(),
    val thresholds: List<ForecastBalanceThreshold> = listOf(ForecastBalanceThreshold.ZERO),
    val baselineDailyNet: Cents = Cents.ZERO,
    val dailyNetDeviation: Cents = Cents.ZERO,
    val confidence: ForecastConfidence = ForecastConfidence.MEDIUM,
) {
    init {
        require(horizons.isNotEmpty()) { "At least one forecast horizon is required" }
        require(horizons.all { it >= 0 }) { "Forecast horizons must be non-negative" }
        require(dailyNetDeviation.amount >= 0) { "Daily net deviation must be non-negative" }
        require(thresholds.map { it.id }.toSet().size == thresholds.size) { "Threshold ids must be unique" }
    }

    val maxHorizonDays: Int get() = horizons.maxOrNull() ?: 0

    companion object {
        val DEFAULT_HORIZONS: List<Int> = listOf(7, 30, 90)
    }
}

/** A concrete dated cash movement produced by recurring expansion or one-off scenarios. */
@Serializable
data class ForecastOccurrence(
    val id: String,
    val sourceId: String,
    val source: ForecastOccurrenceSource,
    val description: String,
    val date: LocalDate,
    val amount: Cents,
    val direction: ForecastCashFlowDirection,
    val kind: ForecastCashFlowKind,
) {
    val signedAmount: Cents
        get() = if (direction == ForecastCashFlowDirection.INFLOW) amount else -amount
}

/** Expected balance at a day boundary in the forecast timeline. */
@Serializable
data class ForecastBalancePoint(
    val dayIndex: Int,
    val date: LocalDate,
    val startingBalance: Cents,
    val committedInflow: Cents,
    val committedOutflow: Cents,
    val baselineNet: Cents,
    val endingBalance: Cents,
    val occurrences: List<ForecastOccurrence>,
)

/** First date a threshold is breached. */
@Serializable
data class ForecastThresholdBreach(
    val thresholdId: String,
    val thresholdAmount: Cents,
    val date: LocalDate,
    val projectedBalance: Cents,
)

/** Roll-up for a requested horizon using web-parity confidence band math. */
@Serializable
data class ForecastHorizonSnapshot(
    val horizonDays: Int,
    val targetDate: LocalDate,
    val expectedBalance: Cents,
    val lowBalance: Cents,
    val highBalance: Cents,
    val committedInflow: Cents,
    val committedOutflow: Cents,
    val baselineNet: Cents,
    val confidence: ForecastConfidence,
)

/** Complete deterministic forecast output. */
@Serializable
data class OperatingCashForecastResult(
    val startDate: LocalDate,
    val endDate: LocalDate,
    val startingBalance: Cents,
    val balancePoints: List<ForecastBalancePoint>,
    val horizonSnapshots: List<ForecastHorizonSnapshot>,
    val occurrences: List<ForecastOccurrence>,
    val thresholdBreaches: List<ForecastThresholdBreach>,
) {
    val endingBalance: Cents get() = balancePoints.lastOrNull()?.endingBalance ?: startingBalance
}

/** Shared KMP engine for operating cash forecasts. */
object OperatingCashForecastEngine {
    fun forecast(input: OperatingCashForecastInput): OperatingCashForecastResult {
        val endDate = input.startDate.plus(input.maxHorizonDays, DateTimeUnit.DAY)
        val occurrences = buildOccurrences(input, endDate)
        val occurrencesByDate = occurrences.groupBy { it.date }
        val thresholdBreachesById = linkedMapOf<String, ForecastThresholdBreach>()
        val balancePoints = mutableListOf<ForecastBalancePoint>()

        var currentBalance = input.startingBalance
        val startPoint = ForecastBalancePoint(
            dayIndex = 0,
            date = input.startDate,
            startingBalance = input.startingBalance,
            committedInflow = Cents.ZERO,
            committedOutflow = Cents.ZERO,
            baselineNet = Cents.ZERO,
            endingBalance = input.startingBalance,
            occurrences = emptyList(),
        )
        balancePoints += startPoint
        detectThresholdBreaches(input.thresholds, input.startDate, currentBalance, thresholdBreachesById)

        for (day in 1..input.maxHorizonDays) {
            val date = input.startDate.plus(day, DateTimeUnit.DAY)
            val dayOccurrences = occurrencesByDate[date].orEmpty()
            val inflow = dayOccurrences
                .filter { it.direction == ForecastCashFlowDirection.INFLOW }
                .fold(Cents.ZERO) { sum, occurrence -> sum + occurrence.amount }
            val outflow = dayOccurrences
                .filter { it.direction == ForecastCashFlowDirection.OUTFLOW }
                .fold(Cents.ZERO) { sum, occurrence -> sum + occurrence.amount }
            val startingBalance = currentBalance
            currentBalance = currentBalance + inflow - outflow + input.baselineDailyNet

            balancePoints += ForecastBalancePoint(
                dayIndex = day,
                date = date,
                startingBalance = startingBalance,
                committedInflow = inflow,
                committedOutflow = outflow,
                baselineNet = input.baselineDailyNet,
                endingBalance = currentBalance,
                occurrences = dayOccurrences,
            )
            detectThresholdBreaches(input.thresholds, date, currentBalance, thresholdBreachesById)
        }

        val pointsByDay = balancePoints.associateBy { it.dayIndex }
        val horizonSnapshots = input.horizons.map { horizonDays ->
            val point = requireNotNull(pointsByDay[horizonDays]) { "Missing balance point for horizon $horizonDays" }
            val pointsThroughHorizon = balancePoints.filter { it.dayIndex in 1..horizonDays }
            ForecastHorizonSnapshot(
                horizonDays = horizonDays,
                targetDate = point.date,
                expectedBalance = point.endingBalance,
                lowBalance = point.endingBalance - bandFor(input, horizonDays),
                highBalance = point.endingBalance + bandFor(input, horizonDays),
                committedInflow = pointsThroughHorizon.fold(Cents.ZERO) { sum, day -> sum + day.committedInflow },
                committedOutflow = pointsThroughHorizon.fold(Cents.ZERO) { sum, day -> sum + day.committedOutflow },
                baselineNet = input.baselineDailyNet * horizonDays,
                confidence = input.confidence,
            )
        }

        return OperatingCashForecastResult(
            startDate = input.startDate,
            endDate = endDate,
            startingBalance = input.startingBalance,
            balancePoints = balancePoints,
            horizonSnapshots = horizonSnapshots,
            occurrences = occurrences,
            thresholdBreaches = thresholdBreachesById.values.toList(),
        )
    }

    private fun buildOccurrences(
        input: OperatingCashForecastInput,
        endDate: LocalDate,
    ): List<ForecastOccurrence> {
        val recurring = input.recurringCommitments.flatMap { commitment ->
            expandRecurringCommitment(commitment, input.startDate, endDate)
        }
        val oneOffs = input.oneOffEntries
            .filter { entry -> entry.date > input.startDate && entry.date <= endDate }
            .map { entry ->
                ForecastOccurrence(
                    id = "one-off:${entry.id}:${entry.date}",
                    sourceId = entry.id,
                    source = ForecastOccurrenceSource.ONE_OFF_SCENARIO,
                    description = entry.description,
                    date = entry.date,
                    amount = entry.amount,
                    direction = entry.direction,
                    kind = entry.kind,
                )
            }

        return (recurring + oneOffs).sortedWith(
            compareBy<ForecastOccurrence> { it.date }
                .thenBy { it.source.name }
                .thenBy { it.sourceId }
                .thenBy { it.id },
        )
    }

    private fun expandRecurringCommitment(
        commitment: RecurringForecastCommitment,
        startDate: LocalDate,
        endDate: LocalDate,
    ): List<ForecastOccurrence> {
        val occurrences = mutableListOf<ForecastOccurrence>()
        var occurrenceDate = commitment.nextDueDate
        var generatedCount = 0

        while (occurrenceDate <= endDate) {
            if (commitment.endsOn != null && occurrenceDate > commitment.endsOn) break
            generatedCount += 1
            if (commitment.maxOccurrences != null && generatedCount > commitment.maxOccurrences) break

            if (occurrenceDate > startDate) {
                occurrences += ForecastOccurrence(
                    id = "recurring:${commitment.id}:$occurrenceDate:$generatedCount",
                    sourceId = commitment.id,
                    source = ForecastOccurrenceSource.RECURRING_COMMITMENT,
                    description = commitment.description,
                    date = occurrenceDate,
                    amount = commitment.amount,
                    direction = commitment.direction,
                    kind = commitment.kind,
                )
            }
            occurrenceDate = nextOccurrenceDate(commitment, occurrenceDate)
        }

        return occurrences
    }

    private fun nextOccurrenceDate(
        commitment: RecurringForecastCommitment,
        date: LocalDate,
    ): LocalDate = when (commitment.cadence) {
        ForecastCadence.DAILY -> date.plus(1, DateTimeUnit.DAY)
        ForecastCadence.WEEKLY -> date.plus(7, DateTimeUnit.DAY)
        ForecastCadence.BIWEEKLY -> date.plus(14, DateTimeUnit.DAY)
        ForecastCadence.SEMIMONTHLY -> date.plus(15, DateTimeUnit.DAY)
        ForecastCadence.MONTHLY -> date.plus(1, DateTimeUnit.MONTH)
        ForecastCadence.QUARTERLY -> date.plus(3, DateTimeUnit.MONTH)
        ForecastCadence.YEARLY -> date.plus(12, DateTimeUnit.MONTH)
        ForecastCadence.EVERY_N_DAYS -> date.plus(requireNotNull(commitment.intervalDays), DateTimeUnit.DAY)
    }

    private fun detectThresholdBreaches(
        thresholds: List<ForecastBalanceThreshold>,
        date: LocalDate,
        projectedBalance: Cents,
        breachesById: MutableMap<String, ForecastThresholdBreach>,
    ) {
        for (threshold in thresholds) {
            if (!breachesById.containsKey(threshold.id) && projectedBalance < threshold.amount) {
                breachesById[threshold.id] = ForecastThresholdBreach(
                    thresholdId = threshold.id,
                    thresholdAmount = threshold.amount,
                    date = date,
                    projectedBalance = projectedBalance,
                )
            }
        }
    }

    private fun bandFor(input: OperatingCashForecastInput, horizonDays: Int): Cents {
        if (horizonDays == 0 || input.dailyNetDeviation.isZero()) return Cents.ZERO
        val band = zScore(input.confidence) * input.dailyNetDeviation.amount.toDouble() * sqrt(horizonDays.toDouble())
        return Cents(band.roundToLong())
    }

    private fun zScore(confidence: ForecastConfidence): Double = when (confidence) {
        ForecastConfidence.HIGH -> 1.28
        ForecastConfidence.MEDIUM -> 1.64
        ForecastConfidence.LOW -> 1.96
    }
}
