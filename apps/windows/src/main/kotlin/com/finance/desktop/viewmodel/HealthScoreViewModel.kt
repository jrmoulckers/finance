// SPDX-License-Identifier: BUSL-1.1

package com.finance.desktop.viewmodel

import com.finance.core.aggregation.FinancialAggregator
import com.finance.core.budget.BudgetCalculator
import com.finance.core.budget.BudgetHealth
import com.finance.core.currency.CurrencyFormatter
import com.finance.desktop.data.repository.AccountRepository
import com.finance.desktop.data.repository.BudgetRepository
import com.finance.desktop.data.repository.GoalRepository
import com.finance.desktop.data.repository.TransactionRepository
import com.finance.models.types.Currency
import com.finance.models.types.SyncId
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime

/**
 * A single scored dimension of financial health.
 *
 * @property name Human-readable category name.
 * @property score Score from 0–100.
 * @property grade Letter grade (A–F).
 * @property description Explanation of what this dimension measures.
 * @property tip Actionable improvement advice.
 * @property benchmarkAverage Average score for comparison benchmark.
 */
data class HealthDimension(
    val name: String,
    val score: Int,
    val grade: String,
    val description: String,
    val tip: String,
    val benchmarkAverage: Int,
)

/**
 * UI state for the financial health score screen.
 */
data class HealthScoreUiState(
    val isLoading: Boolean = true,
    val overallScore: Int = 0,
    val overallGrade: String = "—",
    val dimensions: List<HealthDimension> = emptyList(),
    val netWorthFormatted: String = "",
    val savingsRatePercent: Int = 0,
    val debtToIncomePercent: Int = 0,
    val budgetAdherencePercent: Int = 0,
    val emergencyFundMonths: Float = 0f,
    val scoreHistory: List<HistoryPoint> = emptyList(),
    val benchmarkPercentile: Int = 0,
    val errorMessage: String? = null,
)

/**
 * A historical score data point for trend rendering.
 */
data class HistoryPoint(
    val label: String,
    val score: Int,
)

/**
 * ViewModel for the Financial Health Score screen.
 *
 * Computes a composite financial health score from multiple dimensions
 * (savings rate, budget adherence, debt ratio, emergency fund, goal progress)
 * and provides benchmark comparison data.
 *
 * All financial calculations use KMP shared logic from `packages/core`.
 */
class HealthScoreViewModel(
    private val accountRepository: AccountRepository,
    private val transactionRepository: TransactionRepository,
    private val budgetRepository: BudgetRepository,
    private val goalRepository: GoalRepository,
) : DesktopViewModel() {

    private val _uiState = MutableStateFlow(HealthScoreUiState())
    val uiState: StateFlow<HealthScoreUiState> = _uiState.asStateFlow()

    private val hid = SyncId("d1")

    init {
        computeHealthScore()
    }

    fun refresh() {
        computeHealthScore()
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    @Suppress("LongMethod", "CyclomaticComplexMethod") // Score calculation with multiple weighted factors
    private fun computeHealthScore() {
        viewModelScope.launch {
            @Suppress("TooGenericExceptionCaught") // Health score calculation error boundary
            try {
                val currency = Currency.USD
                val now = Clock.System.now()
                val today = now.toLocalDateTime(TimeZone.currentSystemDefault()).date
                val monthStart = LocalDate(today.year, today.month, 1)

                val accounts = accountRepository.observeAll(hid).first()
                val transactions = transactionRepository.observeAll(hid).first()
                val budgets = budgetRepository.observeAll(hid).first()
                val goals = goalRepository.observeAll(hid).first()

                val netWorth = FinancialAggregator.netWorth(accounts)
                val monthlySpending = FinancialAggregator.totalSpending(transactions, monthStart, today)

                // Savings rate: income - spending / income
                val monthlyIncome = FinancialAggregator.totalIncome(transactions, monthStart, today)
                val savingsRate = if (monthlyIncome.amount > 0) {
                    ((monthlyIncome.amount - monthlySpending.amount) * 100 / monthlyIncome.amount).toInt()
                        .coerceIn(0, 100)
                } else {
                    0
                }

                // Budget adherence: avg utilization across budgets
                val budgetScores = budgets.map { budget ->
                    val catTxns = transactions.filter { it.categoryId == budget.categoryId }
                    val status = BudgetCalculator.calculateStatus(budget, catTxns, today)
                    when (status.healthLevel) {
                        BudgetHealth.HEALTHY -> 100
                        BudgetHealth.WARNING -> 60
                        BudgetHealth.OVER -> 20
                    }
                }
                val budgetAdherence = if (budgetScores.isNotEmpty()) {
                    budgetScores.average().toInt()
                } else {
                    50 // neutral if no budgets
                }

                // Goal progress: avg progress across all goals
                val goalProgress = if (goals.isNotEmpty()) {
                    (goals.map { it.progress }.average() * 100).toInt().coerceIn(0, 100)
                } else {
                    50 // neutral if no goals
                }

                // Emergency fund: months of expenses covered by liquid assets
                val liquidAssets = netWorth.amount.coerceAtLeast(0)
                val monthlyExpenseAmount = monthlySpending.amount.coerceAtLeast(1)
                val emergencyMonths = (liquidAssets.toFloat() / monthlyExpenseAmount.toFloat())
                    .coerceIn(0f, 24f)
                val emergencyScore = when {
                    emergencyMonths >= 6f -> 100
                    emergencyMonths >= 3f -> 75
                    emergencyMonths >= 1f -> 50
                    else -> 25
                }

                // Debt-to-income ratio (simplified: negative balances as debt)
                val totalDebt = accounts.filter { it.currentBalance.amount < 0 }
                    .sumOf { -it.currentBalance.amount }
                val annualIncome = (monthlyIncome.amount * 12).coerceAtLeast(1)
                val debtToIncome = ((totalDebt * 100) / annualIncome).toInt().coerceIn(0, 200)
                val debtScore = when {
                    debtToIncome <= 15 -> 100
                    debtToIncome <= 30 -> 75
                    debtToIncome <= 50 -> 50
                    else -> 25
                }

                // Build dimensions
                val dimensions = listOf(
                    HealthDimension(
                        name = "Savings Rate",
                        score = savingsRate,
                        grade = scoreToGrade(savingsRate),
                        description = "Percentage of income saved each month",
                        tip = if (savingsRate < 20) "Aim to save at least 20% of your income"
                        else "Great savings rate! Keep it up",
                        benchmarkAverage = 22,
                    ),
                    HealthDimension(
                        name = "Budget Adherence",
                        score = budgetAdherence,
                        grade = scoreToGrade(budgetAdherence),
                        description = "How well you stay within budget limits",
                        tip = if (budgetAdherence < 70) "Review overspent categories and adjust limits"
                        else "Excellent budget discipline",
                        benchmarkAverage = 65,
                    ),
                    HealthDimension(
                        name = "Emergency Fund",
                        score = emergencyScore,
                        grade = scoreToGrade(emergencyScore),
                        description = "Months of expenses covered by savings",
                        tip = if (emergencyMonths < 3) "Build up to 3–6 months of expenses"
                        else "Solid emergency fund coverage",
                        benchmarkAverage = 55,
                    ),
                    HealthDimension(
                        name = "Debt Management",
                        score = debtScore,
                        grade = scoreToGrade(debtScore),
                        description = "Debt-to-income ratio health",
                        tip = if (debtToIncome > 30) "Focus on paying down high-interest debt"
                        else "Debt levels are well managed",
                        benchmarkAverage = 60,
                    ),
                    HealthDimension(
                        name = "Goal Progress",
                        score = goalProgress,
                        grade = scoreToGrade(goalProgress),
                        description = "Average progress toward savings goals",
                        tip = if (goalProgress < 50) "Consider automating contributions to goals"
                        else "Making great progress on your goals",
                        benchmarkAverage = 45,
                    ),
                )

                // Overall score: weighted average
                val overallScore = (
                    savingsRate * 25 +
                        budgetAdherence * 25 +
                        emergencyScore * 20 +
                        debtScore * 15 +
                        goalProgress * 15
                    ) / 100

                // Simulated score history (last 6 months)
                val scoreHistory = (5 downTo 0).map { monthsAgo ->
                    val variation = (monthsAgo * 3) - (Math.random() * 5).toInt()
                    HistoryPoint(
                        label = "${monthsAgo}m ago",
                        score = (overallScore - variation).coerceIn(0, 100),
                    )
                }

                // Benchmark percentile (simplified)
                val benchmarkPercentile = when {
                    overallScore >= 80 -> 90
                    overallScore >= 65 -> 70
                    overallScore >= 50 -> 50
                    overallScore >= 35 -> 30
                    else -> 15
                }

                _uiState.value = HealthScoreUiState(
                    isLoading = false,
                    overallScore = overallScore,
                    overallGrade = scoreToGrade(overallScore),
                    dimensions = dimensions,
                    netWorthFormatted = CurrencyFormatter.format(netWorth, currency),
                    savingsRatePercent = savingsRate,
                    debtToIncomePercent = debtToIncome,
                    budgetAdherencePercent = budgetAdherence,
                    emergencyFundMonths = emergencyMonths,
                    scoreHistory = scoreHistory,
                    benchmarkPercentile = benchmarkPercentile,
                )
            } catch (e: Exception) {
                _uiState.value = HealthScoreUiState(
                    isLoading = false,
                    errorMessage = "Failed to compute health score: ${e.message}",
                )
            }
        }
    }

    companion object {
        fun scoreToGrade(score: Int): String = when {
            score >= 90 -> "A+"
            score >= 80 -> "A"
            score >= 70 -> "B"
            score >= 60 -> "C"
            score >= 50 -> "D"
            else -> "F"
        }
    }
}
