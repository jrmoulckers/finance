// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.models.types.Cents

/**
 * Policy for bounding budget rollover carry-forward (#3649).
 *
 * A single unbounded formula is a poor fit for real envelope/rollover systems: a
 * catastrophic overspend would suppress the next period's budget indefinitely,
 * and an untouched budget would accumulate surplus without limit. This policy
 * lets callers choose how each period's carry is clamped before it is applied to
 * the next period.
 *
 * The [UNLIMITED] default preserves the historical behaviour exactly.
 */
enum class RolloverPolicy {
    /** No bounding — carry forward the full surplus or deficit (historical default). */
    UNLIMITED,

    /** Floor negative carry at zero so one bad period never buries the next; surplus is unbounded. */
    RESET_NEGATIVE,

    /** Clamp carry to `[-base, +base]` — at most one period's worth of surplus or deficit carries. */
    CAP_AT_BASE,
    ;

    /**
     * Apply this policy to a raw [carry] given the period's [base] budget amount.
     *
     * @param carry The unbounded carry (`effective - spent`) for a period.
     * @param base The budget's base amount for the period; used as the cap
     *   magnitude for [CAP_AT_BASE]. Assumed non-negative (budget amounts are
     *   validated positive).
     */
    fun apply(carry: Cents, base: Cents): Cents = when (this) {
        UNLIMITED -> carry
        RESET_NEGATIVE -> if (carry.isNegative()) Cents.ZERO else carry
        CAP_AT_BASE -> Cents(carry.amount.coerceIn(-base.amount, base.amount))
    }
}
