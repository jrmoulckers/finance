// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

/**
 * Configurable utilization thresholds for classifying [BudgetHealth] (#3678).
 *
 * Utilization is the fraction of the budget spent (`spent / amount`), where
 * `1.0` means exactly at the limit. A budget is classified as:
 *  - [BudgetHealth.OVER] when utilization is strictly greater than [over];
 *  - [BudgetHealth.WARNING] when utilization is strictly greater than [warning]
 *    (but not over);
 *  - [BudgetHealth.HEALTHY] otherwise.
 *
 * Different categories warrant different sensitivity — e.g. warn at 90% for
 * rent but 50% for discretionary spend. The [DEFAULT] preserves the historical
 * behaviour (warn above 75%, over above 100%) exactly.
 *
 * @property warning Fraction above which the budget is a warning. Must be in
 *   `0.0..1.0` and strictly less than [over].
 * @property over Fraction above which the budget is over. Must be in `0.0..1.0`.
 *   Defaults to `1.0` (the budget amount itself).
 */
data class BudgetThresholds(
    val warning: Double,
    val over: Double = DEFAULT_OVER,
) {
    init {
        require(warning in 0.0..1.0) { "warning threshold must be within 0.0..1.0, was $warning" }
        require(over in 0.0..1.0) { "over threshold must be within 0.0..1.0, was $over" }
        require(warning < over) { "warning ($warning) must be strictly less than over ($over)" }
    }

    /**
     * Classify [utilization] against these thresholds. Boundaries are exclusive:
     * a utilization exactly equal to [warning] or [over] does not cross into the
     * higher band (matching the original `> 0.75` / `> 1.0` semantics).
     */
    fun classify(utilization: Double): BudgetHealth = when {
        utilization > over -> BudgetHealth.OVER
        utilization > warning -> BudgetHealth.WARNING
        else -> BudgetHealth.HEALTHY
    }

    companion object {
        /** Default warning band: 75% of the budget. */
        const val DEFAULT_WARNING = 0.75

        /** Default over band: 100% of the budget. */
        const val DEFAULT_OVER = 1.0

        /** The historical default thresholds (warn above 75%, over above 100%). */
        val DEFAULT = BudgetThresholds(DEFAULT_WARNING, DEFAULT_OVER)
    }
}
