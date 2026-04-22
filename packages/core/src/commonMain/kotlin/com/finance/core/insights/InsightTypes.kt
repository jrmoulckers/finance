// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.insights

import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.datetime.LocalDate
import kotlinx.datetime.Month
import kotlinx.serialization.Serializable

/**
 * Spending trend for a category over a multi-month window.
 */
@Serializable
data class CategoryTrend(
    val categoryId: SyncId,
    /** Monthly totals ordered chronologically (oldest first). */
    val monthlyAmounts: List<MonthAmount>,
    /** Overall direction of the trend line. */
    val direction: TrendDirection,
    /** Average monthly spend in cents. */
    val averageMonthly: Cents,
    /** Percentage change between first and last month. Null if first month is zero. */
    val overallChangePercent: Double?,
)

/**
 * Spending amount for a single month.
 */
@Serializable
data class MonthAmount(
    val year: Int,
    val month: Month,
    val amount: Cents,
)

/**
 * Direction of a trend over time.
 */
@Serializable
enum class TrendDirection {
    INCREASING,
    DECREASING,
    STABLE,
}

/**
 * Financial health score on a 0–100 scale with component breakdown.
 */
@Serializable
data class FinancialHealthScore(
    /** Overall score 0–100 (higher is better). */
    val overallScore: Int,
    /** Component scores that contribute to the overall score. */
    val components: List<HealthComponent>,
    /** Human-readable assessment. */
    val assessment: HealthAssessment,
) {
    init {
        require(overallScore in 0..100) { "Score must be 0–100, got: $overallScore" }
    }
}

/**
 * A single component of the financial health score.
 */
@Serializable
data class HealthComponent(
    val name: String,
    /** Score 0–100 for this component. */
    val score: Int,
    /** Weight used in overall score calculation (sums to 100 across all components). */
    val weight: Int,
    /** Brief explanation of the score. */
    val explanation: String,
) {
    init {
        require(score in 0..100) { "Component score must be 0–100, got: $score" }
        require(weight > 0) { "Weight must be positive" }
    }
}

/**
 * Qualitative assessment derived from the overall health score.
 */
@Serializable
enum class HealthAssessment {
    EXCELLENT,
    GOOD,
    FAIR,
    NEEDS_ATTENTION,
    CRITICAL,
}

/**
 * A spending category analysis showing rank, proportion, and trend.
 */
@Serializable
data class CategoryAnalysis(
    val categoryId: SyncId,
    /** Total spent in the analysis period. */
    val totalSpent: Cents,
    /** Percentage of total spending this category represents. */
    val percentOfTotal: Double,
    /** Rank among all categories (1 = highest spending). */
    val rank: Int,
    /** Comparison to prior period. */
    val priorPeriodAmount: Cents,
    /** Change percentage vs prior period. Null if prior is zero. */
    val changePercent: Double?,
)

/**
 * Summary of income vs. expense analysis for a period.
 */
@Serializable
data class IncomeExpenseSummary(
    val periodStart: LocalDate,
    val periodEnd: LocalDate,
    val totalIncome: Cents,
    val totalExpenses: Cents,
    val netCashFlow: Cents,
    val savingsRate: Double,
    val topExpenseCategories: List<CategoryAnalysis>,
)
