// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlinx.serialization.Serializable

/**
 * A persistent-balance "envelope" for YNAB-style envelope budgeting (#3658).
 *
 * Unlike a calendar-reset [com.finance.models.Budget], an envelope is a running
 * balance that persists across periods: you explicitly *fund* it (allocate money
 * in) and *spend* from it, and there is no automatic per-period reset. The
 * [balance] can go negative when overspent and must be covered from another
 * envelope via [EnvelopeOperations.transfer].
 *
 * This is an **additive alternative** to period budgets — it does not replace
 * [BudgetCalculator]/[BudgetRolloverCalculator]. All arithmetic is exact
 * integer [Cents]; no floating point is involved.
 *
 * @property id Stable identifier for the envelope.
 * @property name Human-readable envelope name.
 * @property funded Total money allocated into the envelope over its lifetime.
 * @property spent Total money spent from the envelope over its lifetime.
 */
@Serializable
data class Envelope(
    val id: SyncId,
    val name: String,
    val funded: Cents = Cents.ZERO,
    val spent: Cents = Cents.ZERO,
) {
    init {
        require(name.isNotBlank()) { "Envelope name cannot be blank" }
    }

    /** The current balance: [funded] minus [spent]. Negative when overspent. */
    val balance: Cents get() = funded - spent

    /** Whether the envelope is overspent (its [balance] is negative). */
    val isOverspent: Boolean get() = balance.isNegative()
}

/**
 * Pure, deterministic operations over [Envelope] balances (#3658).
 *
 * Every function returns a new [Envelope] (or pair) — inputs are never mutated —
 * and all math stays in integer [Cents].
 */
object EnvelopeOperations {

    /**
     * Allocate [amount] of new money into [envelope], increasing its [Envelope.funded].
     *
     * @throws IllegalArgumentException if [amount] is not positive.
     */
    fun fund(envelope: Envelope, amount: Cents): Envelope {
        require(amount.isPositive()) { "Funding amount must be positive, was ${amount.amount}" }
        return envelope.copy(funded = envelope.funded + amount)
    }

    /**
     * Record a spend of [amount] from [envelope], increasing its [Envelope.spent].
     *
     * Spending is permitted even when it drives the [Envelope.balance] negative
     * (an overspend to be covered later); the resulting balance simply reflects
     * the shortfall.
     *
     * @throws IllegalArgumentException if [amount] is not positive.
     */
    fun spend(envelope: Envelope, amount: Cents): Envelope {
        require(amount.isPositive()) { "Spend amount must be positive, was ${amount.amount}" }
        return envelope.copy(spent = envelope.spent + amount)
    }

    /**
     * Move [amount] of funding from [from] to [to] — e.g. to cover an overspent
     * envelope. Decreases the source's [Envelope.funded] and increases the
     * destination's by the same amount, so total funded across the pair is
     * conserved.
     *
     * @return the updated `(from, to)` pair, in that order.
     * @throws IllegalArgumentException if [amount] is not positive or if [from]
     *   and [to] are the same envelope.
     */
    fun transfer(from: Envelope, to: Envelope, amount: Cents): Pair<Envelope, Envelope> {
        require(amount.isPositive()) { "Transfer amount must be positive, was ${amount.amount}" }
        require(from.id != to.id) { "Cannot transfer an envelope to itself" }
        return from.copy(funded = from.funded - amount) to to.copy(funded = to.funded + amount)
    }
}
