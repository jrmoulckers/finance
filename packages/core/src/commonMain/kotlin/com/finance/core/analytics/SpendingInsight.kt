package com.finance.core.analytics

import com.finance.models.types.Cents
import com.finance.models.types.SyncId

/**
 * Directional trend for month-over-month comparison.
 */
enum class Trend { UP, DOWN, STABLE }

/**
 * Insight comparing a single category's spending between the current and previous month.
 *
 * [percentChange] is the relative change expressed as a percentage (e.g., 25.0 means +25 %).
 * Positive values mean spending increased; negative values mean it decreased.
 * When the previous month has zero spending, [percentChange] is `null` (division undefined).
 */
data class SpendingInsight(
    val categoryId: SyncId,
    val currentMonth: Cents,
    val previousMonth: Cents,
    val percentChange: Double?,
    val trend: Trend,
) {
    init {
        require(currentMonth.amount >= 0) { "Current month spending cannot be negative" }
        require(previousMonth.amount >= 0) { "Previous month spending cannot be negative" }
    }
}
