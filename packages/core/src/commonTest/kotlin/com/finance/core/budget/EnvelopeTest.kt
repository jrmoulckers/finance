// SPDX-License-Identifier: BUSL-1.1

package com.finance.core.budget

import com.finance.models.types.Cents
import com.finance.models.types.SyncId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Tests for #3658 — envelope budgeting with persistent balances.
 */
class EnvelopeTest {

    private fun envelope(
        funded: Long = 0,
        spent: Long = 0,
        id: String = "env-1",
    ) = Envelope(id = SyncId(id), name = "Groceries", funded = Cents(funded), spent = Cents(spent))

    @Test
    fun balance_isFundedMinusSpent() {
        assertEquals(Cents(7000), envelope(funded = 10000, spent = 3000).balance)
    }

    @Test
    fun fund_increasesFundedAndBalance() {
        val funded = EnvelopeOperations.fund(envelope(funded = 5000), Cents(2500))
        assertEquals(Cents(7500), funded.funded)
        assertEquals(Cents(7500), funded.balance)
    }

    @Test
    fun spend_increasesSpentAndReducesBalance() {
        val spent = EnvelopeOperations.spend(envelope(funded = 10000, spent = 2000), Cents(3000))
        assertEquals(Cents(5000), spent.spent)
        assertEquals(Cents(5000), spent.balance)
    }

    @Test
    fun spend_canOverspend_negativeBalance() {
        val overspent = EnvelopeOperations.spend(envelope(funded = 5000), Cents(8000))
        assertEquals(Cents(-3000), overspent.balance)
        assertTrue(overspent.isOverspent)
    }

    @Test
    fun transfer_movesFundingAndConservesTotal() {
        val from = envelope(funded = 10000, id = "from")
        val to = envelope(funded = 2000, spent = 5000, id = "to") // overspent by 3000
        val (newFrom, newTo) = EnvelopeOperations.transfer(from, to, Cents(3000))

        assertEquals(Cents(7000), newFrom.funded)
        assertEquals(Cents(5000), newTo.funded)
        assertEquals(Cents.ZERO, newTo.balance, "transfer covers the overspend exactly")
        assertFalse(newTo.isOverspent)
        // Total funded conserved.
        assertEquals(from.funded + to.funded, newFrom.funded + newTo.funded)
    }

    @Test
    fun fund_nonPositive_rejected() {
        assertFailsWith<IllegalArgumentException> { EnvelopeOperations.fund(envelope(), Cents.ZERO) }
        assertFailsWith<IllegalArgumentException> { EnvelopeOperations.fund(envelope(), Cents(-1)) }
    }

    @Test
    fun spend_nonPositive_rejected() {
        assertFailsWith<IllegalArgumentException> { EnvelopeOperations.spend(envelope(), Cents(-1)) }
    }

    @Test
    fun transfer_toSelf_rejected() {
        val e = envelope(funded = 5000, id = "same")
        assertFailsWith<IllegalArgumentException> { EnvelopeOperations.transfer(e, e, Cents(100)) }
    }

    @Test
    fun transfer_nonPositive_rejected() {
        assertFailsWith<IllegalArgumentException> {
            EnvelopeOperations.transfer(envelope(id = "a"), envelope(id = "b"), Cents(0))
        }
    }

    @Test
    fun blankName_rejected() {
        assertFailsWith<IllegalArgumentException> { Envelope(id = SyncId("x"), name = " ") }
    }

    @Test
    fun operations_areImmutable() {
        val original = envelope(funded = 5000)
        EnvelopeOperations.fund(original, Cents(1000))
        EnvelopeOperations.spend(original, Cents(1000))
        assertEquals(Cents(5000), original.funded, "original envelope unchanged")
        assertEquals(Cents.ZERO, original.spent)
    }
}
