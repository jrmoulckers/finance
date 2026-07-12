// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.forecast

import com.finance.models.types.Cents

/** A recurring or one-off cash commitment that will leave the account. */
data class Obligation(
    val id: String,
    val label: String,
    val amount: Cents,
    /** Days from today that the money leaves. */
    val dayOffset: Int,
    val kind: ObligationKind,
)

enum class ObligationKind(val label: String) {
    PAYROLL("Payroll"),
    TAX("Estimated taxes"),
    COMMISSARY_RENT("Commissary rent"),
    PERMIT("Permit renewal"),
    FUEL("Fuel run"),
    OTHER("Other"),
}

/** Cash expected to arrive (e.g. a busy weekend's sales). */
data class ExpectedInflow(
    val id: String,
    val label: String,
    val amount: Cents,
    val dayOffset: Int,
)

/**
 * One day of the projected operating cash calendar.
 *
 * @property closingBalance the running balance at the end of the day.
 * @property isNegative `true` when the projected balance dips below zero — the
 *   timing mistake the forecast is designed to catch (#2185).
 */
data class DayProjection(
    val dayOffset: Int,
    val inflow: Cents,
    val outflow: Cents,
    val closingBalance: Cents,
    val isNegative: Boolean,
    val obligations: List<Obligation>,
)

/**
 * The result of a forecast run, including whether every commitment can be met.
 */
data class ForecastResult(
    val days: List<DayProjection>,
    /** Lowest projected closing balance across the horizon. */
    val lowestBalance: Cents,
    /** First day the balance goes negative, or `null` if it never does. */
    val firstShortfallDay: Int?,
) {
    val isSafe: Boolean = firstShortfallDay == null

    /** Whether a specific obligation (by id) is covered on its due day. */
    fun coversObligation(obligationId: String): Boolean =
        days.none { day ->
            day.isNegative && day.obligations.any { it.id == obligationId }
        }
}

/**
 * Pure, forward-looking operating cash forecaster (#2185).
 *
 * Combines the current balance, expected inflows, and dated obligations into a
 * day-by-day running balance so the owner can answer "can I safely make
 * payroll next Friday?" and run what-if scenarios like "if I buy \$900 of
 * ingredients today, am I still safe for payroll Friday?".
 */
object CashFlowForecaster {

    /**
     * Project [horizonDays] of daily balances starting from [startingBalance].
     */
    fun forecast(
        startingBalance: Cents,
        obligations: List<Obligation>,
        inflows: List<ExpectedInflow>,
        horizonDays: Int = 30,
    ): ForecastResult {
        var running = startingBalance
        var lowest = startingBalance
        var firstShortfall: Int? = null
        val days = ArrayList<DayProjection>(horizonDays + 1)

        for (day in 0..horizonDays) {
            val dayInflow = inflows
                .filter { it.dayOffset == day }
                .fold(Cents.ZERO) { acc, i -> acc + i.amount }
            val dayObligations = obligations.filter { it.dayOffset == day }
            val dayOutflow = dayObligations.fold(Cents.ZERO) { acc, o -> acc + o.amount }

            running = running + dayInflow - dayOutflow
            val negative = running.amount < 0L
            if (negative && firstShortfall == null) {
                firstShortfall = day
            }
            if (running.amount < lowest.amount) {
                lowest = running
            }

            days.add(
                DayProjection(
                    dayOffset = day,
                    inflow = dayInflow,
                    outflow = dayOutflow,
                    closingBalance = running,
                    isNegative = negative,
                    obligations = dayObligations,
                ),
            )
        }

        return ForecastResult(
            days = days,
            lowestBalance = lowest,
            firstShortfallDay = firstShortfall,
        )
    }

    /**
     * Re-run the forecast with an extra one-off spend of [amount] on
     * [dayOffset] to answer a what-if scenario without mutating inputs (#2185).
     */
    fun withScenarioSpend(
        startingBalance: Cents,
        obligations: List<Obligation>,
        inflows: List<ExpectedInflow>,
        amount: Cents,
        dayOffset: Int = 0,
        horizonDays: Int = 30,
        label: String = "What-if purchase",
    ): ForecastResult {
        val scenario = obligations + Obligation(
            id = "scenario-spend",
            label = label,
            amount = amount,
            dayOffset = dayOffset,
            kind = ObligationKind.OTHER,
        )
        return forecast(startingBalance, scenario, inflows, horizonDays)
    }
}
