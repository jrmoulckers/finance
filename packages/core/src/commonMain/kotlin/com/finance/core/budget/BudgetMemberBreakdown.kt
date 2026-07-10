// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.models.Budget
import com.finance.models.types.Cents
import com.finance.models.types.SyncId

/**
 * Per-member spend attribution for a shared/household budget within a single
 * period (#3690).
 *
 * Produced by [BudgetCalculator.calculateMemberBreakdown]. The sum of
 * [byMember] values always equals [totalSpent], which in turn reconciles with
 * [BudgetStatus.spent] for the same budget, transactions and reference date.
 *
 * @property budget The budget the breakdown was computed for.
 * @property period The period boundaries the spend was attributed within.
 * @property totalSpent Total qualifying expense across all members (in cents).
 * @property byMember Spend per member `ownerId`, in insertion order. Members
 *   with no qualifying spend in the period are omitted — use [spendFor] to read
 *   a defaulted zero for any owner.
 */
data class BudgetMemberBreakdown(
    val budget: Budget,
    val period: DatePeriod,
    val totalSpent: Cents,
    val byMember: Map<SyncId, Cents>,
) {
    /** Spend attributed to [ownerId], or [Cents.ZERO] when the member has none. */
    fun spendFor(ownerId: SyncId): Cents = byMember[ownerId] ?: Cents.ZERO

    /** The `ownerId`s that contributed any spend to this budget in the period. */
    val members: Set<SyncId> get() = byMember.keys
}
