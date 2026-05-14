// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.screens.affordability

import com.finance.models.types.Cents

/**
 * Affordability analysis result for the "Can I Afford This?" feature (#377).
 *
 * Provides a multi-signal assessment of whether a planned purchase is
 * financially sustainable given the user's current situation.
 *
 * @property verdict Overall affordability verdict.
 * @property availableFunds Total liquid funds across active accounts.
 * @property purchaseAmount The amount the user wants to spend.
 * @property remainingAfterPurchase Funds remaining if the purchase goes through.
 * @property budgetImpact How the purchase affects relevant budget categories.
 * @property recommendations Actionable suggestions for the user.
 */
data class AffordabilityResult(
    val verdict: AffordabilityVerdict,
    val availableFunds: Cents,
    val purchaseAmount: Cents,
    val remainingAfterPurchase: Cents,
    val budgetImpact: BudgetImpact,
    val recommendations: List<String>,
)

/**
 * Traffic-light affordability verdict.
 */
enum class AffordabilityVerdict {
    /** Purchase is comfortably within means (>20% remaining). */
    COMFORTABLE,

    /** Purchase is possible but tight (5-20% remaining). */
    TIGHT,

    /** Purchase would leave dangerously low funds (<5% remaining). */
    RISKY,

    /** Purchase exceeds available funds. */
    CANNOT_AFFORD,
}

/**
 * Impact of a purchase on the user's budget categories.
 */
data class BudgetImpact(
    val affectedBudgetName: String?,
    val currentSpent: Cents,
    val budgetLimit: Cents,
    val spentAfterPurchase: Cents,
    val wouldExceedBudget: Boolean,
)

/**
 * Pure calculation engine for affordability checks.
 *
 * Stateless — all inputs are passed as parameters so the logic is
 * easily testable without repositories or ViewModels.
 */
object AffordabilityCalculator {

    /** Threshold ratios for verdict determination. */
    private const val COMFORTABLE_THRESHOLD = 0.20
    private const val TIGHT_THRESHOLD = 0.05

    /**
     * Evaluates whether a purchase is affordable.
     *
     * @param availableFunds Total liquid balance across all accounts.
     * @param purchaseAmount The intended purchase amount.
     * @param monthlyIncome Estimated monthly income (for recommendation context).
     * @param budgetName Name of the relevant budget category, if any.
     * @param budgetSpent Current spending in the budget category.
     * @param budgetLimit The budget category's limit.
     * @return A complete [AffordabilityResult].
     */
    fun evaluate(
        availableFunds: Cents,
        purchaseAmount: Cents,
        monthlyIncome: Cents = Cents.ZERO,
        budgetName: String? = null,
        budgetSpent: Cents = Cents.ZERO,
        budgetLimit: Cents = Cents.ZERO,
    ): AffordabilityResult {
        val remaining = Cents(availableFunds.amount - purchaseAmount.amount)
        val ratio = if (availableFunds.amount > 0) {
            remaining.amount.toDouble() / availableFunds.amount.toDouble()
        } else {
            -1.0
        }

        val verdict = when {
            remaining.amount < 0 -> AffordabilityVerdict.CANNOT_AFFORD
            ratio < TIGHT_THRESHOLD -> AffordabilityVerdict.RISKY
            ratio < COMFORTABLE_THRESHOLD -> AffordabilityVerdict.TIGHT
            else -> AffordabilityVerdict.COMFORTABLE
        }

        val spentAfterPurchase = Cents(budgetSpent.amount + purchaseAmount.amount)
        val wouldExceed = budgetLimit.amount > 0 && spentAfterPurchase.amount > budgetLimit.amount

        val budgetImpact = BudgetImpact(
            affectedBudgetName = budgetName,
            currentSpent = budgetSpent,
            budgetLimit = budgetLimit,
            spentAfterPurchase = spentAfterPurchase,
            wouldExceedBudget = wouldExceed,
        )

        val recommendations = buildRecommendations(verdict, remaining, wouldExceed, monthlyIncome, purchaseAmount)

        return AffordabilityResult(
            verdict = verdict,
            availableFunds = availableFunds,
            purchaseAmount = purchaseAmount,
            remainingAfterPurchase = remaining,
            budgetImpact = budgetImpact,
            recommendations = recommendations,
        )
    }

    @Suppress("UnusedParameter") // Reserved for future implementation
    private fun buildRecommendations(
        verdict: AffordabilityVerdict,
        remaining: Cents,
        wouldExceedBudget: Boolean,
        monthlyIncome: Cents,
        purchaseAmount: Cents,
    ): List<String> = buildList {
        when (verdict) {
            AffordabilityVerdict.CANNOT_AFFORD -> {
                add("This purchase exceeds your available funds.")
                add("Consider saving up or finding a lower-cost alternative.")
            }
            AffordabilityVerdict.RISKY -> {
                add("This purchase would leave very little in reserve.")
                add("Consider waiting until you have more savings buffer.")
            }
            AffordabilityVerdict.TIGHT -> {
                add("You can afford this, but it will be tight.")
                add("Make sure you don't have other large expenses coming up.")
            }
            AffordabilityVerdict.COMFORTABLE -> {
                add("This purchase fits comfortably within your means.")
            }
        }
        if (wouldExceedBudget) {
            add("This would exceed your budget for this category.")
        }
        if (monthlyIncome.amount > 0 && purchaseAmount.amount > monthlyIncome.amount) {
            add("This purchase is larger than your monthly income.")
        }
    }
}
