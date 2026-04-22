// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.insights

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.finance.android.auth.HouseholdIdProvider
import com.finance.android.data.repository.AccountRepository
import com.finance.android.data.repository.BudgetRepository
import com.finance.android.data.repository.CategoryRepository
import com.finance.android.data.repository.TransactionRepository
import com.finance.core.currency.CurrencyFormatter
import com.finance.core.insights.CategoryAnalysis
import com.finance.core.insights.CategoryTrend
import com.finance.core.insights.FinancialHealthScore
import com.finance.core.insights.HealthAssessment
import com.finance.core.insights.IncomeExpenseSummary
import com.finance.core.insights.InsightsEngine
import com.finance.core.insights.TrendDirection
import com.finance.models.types.Cents
import com.finance.models.types.Currency
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber

/**
 * UI model for a single category in the spending breakdown.
 */
data class CategorySpendingUi(
    val name: String,
    val amountFormatted: String,
    val percentage: Double,
    val rank: Int,
    val changePercent: Double?,
    val priorAmountFormatted: String,
    val colorIndex: Int,
)

/**
 * UI model for a category trend.
 */
data class CategoryTrendUi(
    val name: String,
    val direction: TrendDirection,
    val averageFormatted: String,
    val changePercent: Double?,
)

/**
 * UI model for the income vs expense summary.
 */
data class IncomeExpenseUi(
    val incomeFormatted: String,
    val expenseFormatted: String,
    val netCashFlowFormatted: String,
    val savingsRateFormatted: String,
    val isPositiveCashFlow: Boolean,
)

/**
 * UI model for a health score component.
 */
data class HealthComponentUi(
    val name: String,
    val score: Int,
    val explanation: String,
)

/**
 * Complete UI state for the Financial Insights Dashboard (#241).
 */
data class InsightsUiState(
    val isLoading: Boolean = true,
    val categoryBreakdown: List<CategorySpendingUi> = emptyList(),
    val categoryTrends: List<CategoryTrendUi> = emptyList(),
    val incomeExpense: IncomeExpenseUi? = null,
    val healthScore: Int = 0,
    val healthAssessment: HealthAssessment = HealthAssessment.FAIR,
    val healthComponents: List<HealthComponentUi> = emptyList(),
    val recommendations: List<String> = emptyList(),
    val currency: Currency = Currency.USD,
)

/**
 * ViewModel for the Financial Insights Dashboard (#241).
 *
 * Delegates to KMP [InsightsEngine] for all analytics computations.
 *
 * @param householdIdProvider Provides the authenticated household ID.
 * @param transactionRepository Source for transaction data.
 * @param accountRepository Source for account data.
 * @param budgetRepository Source for budget data.
 * @param categoryRepository Source for category metadata.
 */
class InsightsViewModel(
    private val householdIdProvider: HouseholdIdProvider,
    private val transactionRepository: TransactionRepository,
    private val accountRepository: AccountRepository,
    private val budgetRepository: BudgetRepository,
    private val categoryRepository: CategoryRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(InsightsUiState())
    val uiState: StateFlow<InsightsUiState> = _uiState.asStateFlow()

    init {
        loadInsights()
    }

    fun refresh() {
        loadInsights()
    }

    private fun loadInsights() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            val householdId = householdIdProvider.householdId.value ?: run {
                Timber.w("No household ID available — skipping insights load")
                _uiState.update { it.copy(isLoading = false) }
                return@launch
            }

            try {
                val transactions = transactionRepository.observeAll(householdId).first()
                val accounts = accountRepository.observeAll(householdId).first()
                val budgets = budgetRepository.observeAll(householdId).first()
                val categories = categoryRepository.observeAll(householdId).first()
                val categoryMap = categories.associateBy { it.id }
                val currency = Currency.USD

                // Category analysis
                val analysis = InsightsEngine.categoryAnalysis(transactions)
                val categoryBreakdown = analysis.mapIndexed { index, cat ->
                    val name = categoryMap[cat.categoryId]?.name ?: "Unknown"
                    CategorySpendingUi(
                        name = name,
                        amountFormatted = CurrencyFormatter.format(cat.totalSpent, currency),
                        percentage = cat.percentOfTotal,
                        rank = cat.rank,
                        changePercent = cat.changePercent,
                        priorAmountFormatted = CurrencyFormatter.format(cat.priorPeriodAmount, currency),
                        colorIndex = index,
                    )
                }

                // Category trends
                val trends = InsightsEngine.categoryTrends(transactions)
                val categoryTrends = trends.take(5).map { trend ->
                    val name = categoryMap[trend.categoryId]?.name ?: "Unknown"
                    CategoryTrendUi(
                        name = name,
                        direction = trend.direction,
                        averageFormatted = CurrencyFormatter.format(trend.averageMonthly, currency),
                        changePercent = trend.overallChangePercent,
                    )
                }

                // Income vs expense
                val summary = InsightsEngine.incomeExpenseSummary(transactions)
                val incomeExpense = IncomeExpenseUi(
                    incomeFormatted = CurrencyFormatter.format(summary.totalIncome, currency),
                    expenseFormatted = CurrencyFormatter.format(summary.totalExpenses, currency),
                    netCashFlowFormatted = CurrencyFormatter.format(summary.netCashFlow, currency, showSign = true),
                    savingsRateFormatted = "${summary.savingsRate.toInt()}%",
                    isPositiveCashFlow = summary.netCashFlow.isPositive(),
                )

                // Health score
                val healthScore = InsightsEngine.calculateHealthScore(transactions, accounts, budgets)
                val healthComponents = healthScore.components.map { component ->
                    HealthComponentUi(
                        name = component.name,
                        score = component.score,
                        explanation = component.explanation,
                    )
                }

                // Recommendations from health components with low scores
                val recommendations = healthScore.components
                    .filter { it.score < 50 }
                    .map { it.explanation }

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        categoryBreakdown = categoryBreakdown,
                        categoryTrends = categoryTrends,
                        incomeExpense = incomeExpense,
                        healthScore = healthScore.overallScore,
                        healthAssessment = healthScore.assessment,
                        healthComponents = healthComponents,
                        recommendations = recommendations,
                        currency = currency,
                    )
                }

                Timber.d(
                    "Insights loaded: categories=%d, trends=%d, healthScore=%d",
                    categoryBreakdown.size,
                    categoryTrends.size,
                    healthScore.overallScore,
                )
            } catch (e: Exception) {
                Timber.e(e, "Failed to load financial insights")
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }
}
