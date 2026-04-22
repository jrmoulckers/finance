// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.tips

import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.serialization.Serializable

/**
 * Categories of financial tips, used for filtering and display grouping.
 */
@Serializable
enum class TipCategory {
    /** Budget-related advice (e.g., over-budget, approaching limit). */
    BUDGET,

    /** Spending pattern observations (e.g., spike detected, unusual merchant). */
    SPENDING,

    /** Savings and goal-related encouragement or warnings. */
    SAVINGS,

    /** Income-related insights (e.g., irregular income detected). */
    INCOME,

    /** General financial literacy and best practices. */
    GENERAL,
}

/**
 * Priority level determines display prominence and notification eligibility.
 */
@Serializable
enum class TipPriority {
    /** Informational — shown in feed but not as a push notification. */
    LOW,

    /** Noteworthy — highlighted in the dashboard tips card. */
    MEDIUM,

    /** Urgent — eligible for push notifications and prominent display. */
    HIGH,
}

/**
 * A contextual financial tip generated from the user's financial data.
 *
 * Tips are ephemeral (not persisted) — they are recalculated each time
 * the engine runs, ensuring they always reflect current data.
 *
 * All monetary values use [Cents] (Long-backed) for exact precision.
 */
@Serializable
data class FinancialTip(
    /** Stable identifier for deduplication across engine runs. */
    val id: String,
    /** Short headline suitable for a card title. */
    val title: String,
    /** Explanatory body text with actionable advice. */
    val description: String,
    /** Classification for filtering and grouping. */
    val category: TipCategory,
    /** Display and notification priority. */
    val priority: TipPriority,
    /** Optional monetary amount relevant to the tip (e.g., overspend amount). */
    val amountCents: Cents? = null,
    /** Optional category reference (e.g., which budget category is over). */
    val relatedCategoryId: SyncId? = null,
    /** Optional account reference (e.g., which account needs attention). */
    val relatedAccountId: SyncId? = null,
    /** Machine-readable action hint for the client (e.g., "navigate:budgets"). */
    val actionHint: String? = null,
)
