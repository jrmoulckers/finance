// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.couple.debt

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.ui.couple.CoupleProfile
import com.finance.android.ui.couple.CoupleProfileRepository
import com.finance.android.ui.couple.Partner
import com.finance.core.currency.CurrencyFormatter
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.math.roundToLong

/** A debt row formatted for display. */
data class DebtRowUi(
    val id: String,
    val name: String,
    val balanceFormatted: String,
    val aprFormatted: String,
    val minPaymentFormatted: String,
    val ownershipLabel: String,
)

/** A strategy plan formatted for display. */
data class StrategyPlanUi(
    val strategy: PayoffStrategy,
    val monthsToDebtFree: Int,
    val debtFreeText: String,
    val totalInterestFormatted: String,
    val orderedNames: List<String>,
    val completed: Boolean,
)

/** UI state for the joint debt payoff planner (#2153). */
data class DebtPlannerUiState(
    val isLoading: Boolean = true,
    val profile: CoupleProfile = CoupleProfile(),
    val debts: List<DebtRowUi> = emptyList(),
    val extraMonthlyFormatted: String = "$0.00",
    val extraMonthlyCents: Long = 0L,
    val selectedStrategy: PayoffStrategy = PayoffStrategy.AVALANCHE,
    val simpleMode: Boolean = false,
    val avalanche: StrategyPlanUi? = null,
    val snowball: StrategyPlanUi? = null,
    val recommendedStrategy: PayoffStrategy = PayoffStrategy.AVALANCHE,
    val recommendationSummary: String = "",
    val interestSavedFormatted: String = "$0.00",
    val weddingTradeoffText: String? = null,
)

/**
 * ViewModel for the joint debt payoff planner (#2153).
 *
 * Wraps the pure [DebtPayoffPlanner] with persistence and formatting, compares
 * avalanche vs snowball across both partners' debts, and surfaces how extra
 * payments trade off against other goals like the wedding and house.
 */
class DebtPlannerViewModel(
    private val repository: CoupleDebtRepository,
    private val profileRepository: CoupleProfileRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DebtPlannerUiState())
    val uiState: StateFlow<DebtPlannerUiState> = _uiState.asStateFlow()

    private val currency: Currency = Currency.USD
    private var extraMonthly: Cents = Cents(DEFAULT_EXTRA_CENTS)

    init {
        recompute()
    }

    fun addDebt(
        name: String,
        balanceDollars: Double,
        aprPercent: Double,
        minPaymentDollars: Double,
        ownership: DebtOwnership,
        owner: Partner?,
    ) {
        if (name.isBlank() || balanceDollars <= 0) return
        repository.upsert(
            CoupleDebt(
                id = "debt-${System.currentTimeMillis()}",
                name = name.trim(),
                balance = Cents.fromDollars(balanceDollars),
                aprBasisPoints = (aprPercent * BPS_PER_PERCENT).roundToLong().toInt().coerceAtLeast(0),
                minimumPayment = Cents.fromDollars(minPaymentDollars.coerceAtLeast(0.0)),
                ownership = ownership,
                owner = if (ownership == DebtOwnership.PERSONAL) owner ?: Partner.A else null,
            ),
        )
        recompute()
    }

    fun deleteDebt(id: String) {
        repository.delete(id)
        recompute()
    }

    fun setExtraMonthly(dollars: Double) {
        extraMonthly = Cents.fromDollars(dollars.coerceAtLeast(0.0))
        recompute()
    }

    fun selectStrategy(strategy: PayoffStrategy) {
        _uiState.update { it.copy(selectedStrategy = strategy) }
    }

    fun setSimpleMode(simple: Boolean) {
        _uiState.update { it.copy(simpleMode = simple) }
    }

    private fun recompute() {
        viewModelScope.launch {
            val debts = repository.load()
            val profile = profileRepository.load()
            val rows = debts.map { it.toRowUi(profile) }

            if (debts.none { it.balance.amount > 0L }) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        profile = profile,
                        debts = rows,
                        extraMonthlyCents = extraMonthly.amount,
                        extraMonthlyFormatted = CurrencyFormatter.format(extraMonthly, currency),
                        avalanche = null,
                        snowball = null,
                        recommendationSummary = "Add both partners' debts to see a payoff plan.",
                        weddingTradeoffText = null,
                    )
                }
                return@launch
            }

            val comparison = DebtPayoffPlanner.compare(debts, extraMonthly)
            val tradeoff = weddingTradeoff(debts, comparison.recommended)

            _uiState.update {
                it.copy(
                    isLoading = false,
                    profile = profile,
                    debts = rows,
                    extraMonthlyCents = extraMonthly.amount,
                    extraMonthlyFormatted = CurrencyFormatter.format(extraMonthly, currency),
                    avalanche = comparison.avalanche.toUi(),
                    snowball = comparison.snowball.toUi(),
                    recommendedStrategy = comparison.recommended,
                    recommendationSummary = comparison.recommendationSummary,
                    interestSavedFormatted = CurrencyFormatter.format(
                        comparison.interestSavedWithAvalanche.abs(), currency,
                    ),
                    weddingTradeoffText = tradeoff,
                )
            }
        }
    }

    private fun weddingTradeoff(debts: List<CoupleDebt>, strategy: PayoffStrategy): String {
        val reallocated = Cents(WEDDING_REALLOCATION_CENTS)
        val monthsSaved = DebtPayoffPlanner.monthsSavedByAdding(
            debts = debts,
            currentExtra = extraMonthly,
            reallocated = reallocated,
            strategy = strategy,
        )
        val amount = CurrencyFormatter.format(reallocated, currency)
        return if (monthsSaved > 0) {
            "Redirecting $amount/mo from wedding or house savings would clear debt " +
                "about $monthsSaved month(s) sooner — weigh that against your timeline."
        } else {
            "At this pace, adding $amount/mo wouldn't change your debt-free date much — " +
                "keeping it for the wedding or house may be the better call."
        }
    }

    private fun CoupleDebt.toRowUi(profile: CoupleProfile): DebtRowUi = DebtRowUi(
        id = id,
        name = name,
        balanceFormatted = CurrencyFormatter.format(balance, currency),
        aprFormatted = "${aprBasisPoints / BPS_PER_PERCENT}% APR",
        minPaymentFormatted = "${CurrencyFormatter.format(minimumPayment, currency)}/mo min",
        ownershipLabel = ownershipLabel(profile),
    )

    private fun CoupleDebt.ownershipLabel(profile: CoupleProfile): String = when (ownership) {
        DebtOwnership.PERSONAL -> profile.nameFor(owner ?: Partner.A)
        DebtOwnership.SHARED -> profile.sharedLabel
        DebtOwnership.JOINTLY_FUNDED -> "${profile.sharedLabel} (jointly funded)"
    }

    private fun PayoffPlan.toUi(): StrategyPlanUi = StrategyPlanUi(
        strategy = strategy,
        monthsToDebtFree = monthsToDebtFree,
        debtFreeText = monthsToText(monthsToDebtFree),
        totalInterestFormatted = CurrencyFormatter.format(totalInterest, currency),
        orderedNames = order.map { it.name },
        completed = completed,
    )

    private fun monthsToText(months: Int): String {
        if (months <= 0) return "Debt-free"
        val years = months / MONTHS_PER_YEAR_INT
        val rem = months % MONTHS_PER_YEAR_INT
        return when {
            years == 0 -> "$months mo"
            rem == 0 -> "$years yr"
            else -> "$years yr $rem mo"
        }
    }

    private companion object {
        const val DEFAULT_EXTRA_CENTS = 20_000L // $200 default extra
        const val WEDDING_REALLOCATION_CENTS = 15_000L // $150 illustrative reallocation
        const val BPS_PER_PERCENT = 100.0
        const val MONTHS_PER_YEAR_INT = 12
    }
}
