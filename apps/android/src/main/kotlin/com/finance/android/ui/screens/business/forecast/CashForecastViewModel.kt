// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.business.forecast

import androidx.lifecycle.ViewModel
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import timber.log.Timber

/** A formatted upcoming obligation row. */
data class ObligationUi(
    val id: String,
    val label: String,
    val amountFormatted: String,
    val dueLabel: String,
    val kindLabel: String,
    val covered: Boolean,
)

/** A formatted weekly rollup of the daily projection. */
data class ForecastWeekUi(
    val weekLabel: String,
    val closingBalanceFormatted: String,
    val isNegative: Boolean,
)

data class CashForecastUiState(
    val isLoading: Boolean = true,
    val startingBalanceFormatted: String = "$0.00",
    val lowestBalanceFormatted: String = "$0.00",
    val isSafe: Boolean = true,
    val shortfallLabel: String? = null,
    val obligations: List<ObligationUi> = emptyList(),
    val weeks: List<ForecastWeekUi> = emptyList(),
    /** Result of the most recent what-if scenario, if any. */
    val scenarioResultLabel: String? = null,
    val scenarioSafe: Boolean = true,
)

/**
 * ViewModel for the forward-looking operating cash forecast (#2185).
 *
 * Combines the current balance, dated obligations (payroll, taxes, commissary
 * rent, permits, fuel) and expected inflows into a day/week cash calendar,
 * warns before the balance goes negative, and answers what-if scenarios like
 * "if I buy \$900 of ingredients today, am I still safe for payroll Friday?".
 */
class CashForecastViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(CashForecastUiState())
    val uiState: StateFlow<CashForecastUiState> = _uiState.asStateFlow()

    private val startingBalance = Cents.fromDollars(4200.0)
    private val obligations = sampleObligations()
    private val inflows = sampleInflows()

    init {
        val result = CashFlowForecaster.forecast(startingBalance, obligations, inflows, HORIZON_DAYS)
        publish(result)
    }

    /** Run a what-if extra spend today and report whether payroll is still safe. */
    fun runScenario(dollars: Double) {
        val amount = Cents.fromDollars(dollars)
        val result = CashFlowForecaster.withScenarioSpend(
            startingBalance = startingBalance,
            obligations = obligations,
            inflows = inflows,
            amount = amount,
            dayOffset = 0,
            horizonDays = HORIZON_DAYS,
            label = "Ingredient purchase",
        )
        val payrollSafe = result.coversObligation("payroll-fri")
        val amountLabel = CurrencyFormatter.format(amount, Currency.USD)
        val message = if (payrollSafe && result.isSafe) {
            "Spending $amountLabel today keeps you safe for payroll Friday."
        } else if (payrollSafe) {
            "$amountLabel is OK for payroll, but cash dips below zero later — watch day ${result.firstShortfallDay}."
        } else {
            "Spending $amountLabel today would put payroll Friday at risk. Hold off or reduce the order."
        }
        Timber.d("Scenario spend %s -> payrollSafe=%b", amountLabel, payrollSafe)
        _uiState.update { it.copy(scenarioResultLabel = message, scenarioSafe = payrollSafe && result.isSafe) }
    }

    fun clearScenario() {
        _uiState.update { it.copy(scenarioResultLabel = null, scenarioSafe = true) }
    }

    private fun publish(result: ForecastResult) {
        _uiState.update {
            it.copy(
                isLoading = false,
                startingBalanceFormatted = CurrencyFormatter.format(startingBalance, Currency.USD),
                lowestBalanceFormatted = CurrencyFormatter.format(result.lowestBalance, Currency.USD, showSign = true),
                isSafe = result.isSafe,
                shortfallLabel = result.firstShortfallDay?.let { d -> "Projected shortfall in $d days" },
                obligations = obligations.sortedBy { o -> o.dayOffset }.map { o ->
                    ObligationUi(
                        id = o.id,
                        label = o.label,
                        amountFormatted = CurrencyFormatter.format(o.amount, Currency.USD),
                        dueLabel = dueLabel(o.dayOffset),
                        kindLabel = o.kind.label,
                        covered = result.coversObligation(o.id),
                    )
                },
                weeks = weeklyRollup(result),
            )
        }
    }

    private fun weeklyRollup(result: ForecastResult): List<ForecastWeekUi> =
        (0 until HORIZON_DAYS / 7).map { week ->
            val lastDay = (week + 1) * 7
            val day = result.days.firstOrNull { it.dayOffset == lastDay } ?: result.days.last()
            ForecastWeekUi(
                weekLabel = "Week ${week + 1}",
                closingBalanceFormatted = CurrencyFormatter.format(day.closingBalance, Currency.USD, showSign = true),
                isNegative = day.closingBalance.amount < 0L,
            )
        }

    private fun dueLabel(dayOffset: Int): String = when (dayOffset) {
        0 -> "Today"
        1 -> "Tomorrow"
        else -> "In $dayOffset days"
    }

    private fun sampleObligations(): List<Obligation> = listOf(
        Obligation("payroll-fri", "Payroll — 2 staff", Cents.fromDollars(1180.0), 4, ObligationKind.PAYROLL),
        Obligation("commissary", "Commissary rent", Cents.fromDollars(850.0), 6, ObligationKind.COMMISSARY_RENT),
        Obligation("fuel", "Fuel & propane run", Cents.fromDollars(140.0), 2, ObligationKind.FUEL),
        Obligation("permit", "Permit renewal", Cents.fromDollars(220.0), 12, ObligationKind.PERMIT),
        Obligation("q-tax", "Quarterly estimated tax", Cents.fromDollars(1600.0), 18, ObligationKind.TAX),
    )

    private fun sampleInflows(): List<ExpectedInflow> = listOf(
        ExpectedInflow("wknd-1", "Weekend event sales", Cents.fromDollars(2300.0), 5),
        ExpectedInflow("catering", "Catering deposit", Cents.fromDollars(600.0), 9),
        ExpectedInflow("wknd-2", "Weekend event sales", Cents.fromDollars(2100.0), 19),
    )

    private companion object {
        const val HORIZON_DAYS = 28
    }
}
